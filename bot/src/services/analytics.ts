/**
 * Stage 15.2 — Premium 매매 분석기 서비스.
 *
 * 모듈 A~D 데이터를 DB 쿼리 한 방으로 집계.
 * 외부 API 호출 0. N+1 쿼리 절대 금지 — 사용자당 최대 4개 SQL.
 * 
 * 왜 raw SQL 안 쓰고 Supabase JS 로 처리하나:
 *   · 모노레포에서 RPC 호출 시 마이그레이션 관리 부담 + 환경 동기화 이슈.
 *   · positions 테이블 row 수가 사용자당 수백~수천 수준이므로 JS 집계도 성능 안전.
 */

import type { Db } from '../db/supabase.js';

// ---------------------------------------------------------------------------
// 응답 스키마 (구현 지시서 §6.3.2 그대로)
// ---------------------------------------------------------------------------
export interface ModuleA {
  pnlUsd: number;
  winRate: number;
  rrRatio: number;
  maxLossStreak: number;
  liquidations: number;
  avgHoldMinutes: number;
}

export interface ModuleBBucket {
  label: string;
  pnl: number;
  winRate: number;
  trades: number;
}

export interface ModuleB {
  buckets: ModuleBBucket[];
  weakestBucket: string;
  recommendationText: string;
  simulatedGainUsd: number;
}

export interface ModuleCBucket {
  range: string;
  liquidationRate: number;
  trades: number;
}

export interface ModuleC {
  buckets: ModuleCBucket[];
  thresholdLeverage: number;
  recommendationText: string;
}

export interface ModuleD {
  afterWin: { avgSizeUsd: number; avgLeverage: number; nextWinRate: number };
  afterLoss: { avgSizeUsd: number; avgLeverage: number; nextWinRate: number };
  sizeIncreasePct: number;
  warning: boolean;
  lockModeEnabled: boolean;
}

export interface PremiumAnalyticsResponse {
  isPremium: boolean;
  generatedAt: string;
  windowDays: 30;
  totalTrades: number;
  stats: ModuleA;
  hourly?: ModuleB;
  leverage?: ModuleC;
  behavior?: ModuleD;
}

// ---------------------------------------------------------------------------
// 포지션 행 최소 타입 (집계 전용 — DB select 최적화)
// ---------------------------------------------------------------------------
interface AnalyticsPosition {
  side: 'long' | 'short';
  size: number;
  leverage: number;
  pnl: number;
  status: 'closed' | 'liquidated';
  opened_at: string;
  closed_at: string | null;
}

// ---------------------------------------------------------------------------
// 메인 계산 함수
// ---------------------------------------------------------------------------
export async function computeAnalytics(
  db: Db,
  userId: string,
  isPremium: boolean,
  lockModeEnabled: boolean,
): Promise<PremiumAnalyticsResponse> {
  const windowDays = Number(process.env.ANALYTICS_WINDOW_DAYS || '30');
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // 쿼리 1: 최근 N일 종료/청산 포지션 전량 조회 (사용자 1인분)
  const { data, error } = await db
    .from('positions')
    .select('side, size, leverage, pnl, status, opened_at, closed_at')
    .eq('user_id', userId)
    .in('status', ['closed', 'liquidated'])
    .gte('closed_at', cutoff)
    .order('closed_at', { ascending: true });

  if (error) throw new Error(`analytics query failed: ${error.message}`);

  const positions = (data as AnalyticsPosition[]) ?? [];
  const totalTrades = positions.length;

  // 모듈 A — 항상 계산
  const stats = computeModuleA(positions);

  const result: PremiumAnalyticsResponse = {
    isPremium,
    generatedAt: new Date().toISOString(),
    windowDays: 30,
    totalTrades,
    stats,
  };

  // Premium 전용 모듈 B/C/D — 거래 10건 이상 + Premium 활성일 때만
  if (isPremium && totalTrades >= 10) {
    result.hourly = computeModuleB(positions);
    result.leverage = computeModuleC(positions);
    result.behavior = computeModuleD(positions, lockModeEnabled);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 모듈 A — 매매 통계 (무료)
// ---------------------------------------------------------------------------
function computeModuleA(positions: AnalyticsPosition[]): ModuleA {
  if (positions.length === 0) {
    return { pnlUsd: 0, winRate: 0, rrRatio: 0, maxLossStreak: 0, liquidations: 0, avgHoldMinutes: 0 };
  }

  let totalPnl = 0;
  let wins = 0;
  let winPnlSum = 0;
  let lossPnlSum = 0;
  let winCount = 0;
  let lossCount = 0;
  let liquidations = 0;
  let maxLossStreak = 0;
  let currentLossStreak = 0;
  let totalHoldMs = 0;
  let holdCount = 0;

  for (const p of positions) {
    totalPnl += p.pnl;

    if (p.status === 'liquidated') {
      liquidations++;
    }

    if (p.pnl > 0) {
      wins++;
      winCount++;
      winPnlSum += p.pnl;
      currentLossStreak = 0;
    } else if (p.pnl < 0) {
      lossCount++;
      lossPnlSum += Math.abs(p.pnl);
      currentLossStreak++;
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    } else {
      // pnl === 0 — 연패 끊기지 않음 (무승부)
      currentLossStreak = 0;
    }

    if (p.opened_at && p.closed_at) {
      const holdMs = new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime();
      if (holdMs > 0) {
        totalHoldMs += holdMs;
        holdCount++;
      }
    }
  }

  const winRate = positions.length > 0 ? wins / positions.length : 0;

  // 손익비: 평균 이익 / 평균 손실. 손실 0이면 Infinity 방지 → 0 처리.
  const avgWinPnl = winCount > 0 ? winPnlSum / winCount : 0;
  const avgLossPnl = lossCount > 0 ? lossPnlSum / lossCount : 0;
  const rrRatio = avgLossPnl > 0 ? avgWinPnl / avgLossPnl : 0;

  const avgHoldMinutes = holdCount > 0 ? totalHoldMs / holdCount / 60000 : 0;

  return {
    pnlUsd: Math.round(totalPnl * 100) / 100,
    winRate: Math.round(winRate * 1000) / 1000,
    rrRatio: Math.round(rrRatio * 100) / 100,
    maxLossStreak,
    liquidations,
    avgHoldMinutes: Math.round(avgHoldMinutes),
  };
}

// ---------------------------------------------------------------------------
// 모듈 B — 시간대별 성과 (Premium)
// KST(UTC+9) 기준 4구간: 00-06, 06-12, 12-18, 18-24
// ---------------------------------------------------------------------------
function computeModuleB(positions: AnalyticsPosition[]): ModuleB {
  const bucketDefs = [
    { label: '00:00–06:00', min: 0, max: 6 },
    { label: '06:00–12:00', min: 6, max: 12 },
    { label: '12:00–18:00', min: 12, max: 18 },
    { label: '18:00–24:00', min: 18, max: 24 },
  ];

  const bucketData = bucketDefs.map((def) => ({
    label: def.label,
    pnl: 0,
    wins: 0,
    trades: 0,
  }));

  for (const p of positions) {
    // KST = UTC + 9
    const openedDate = new Date(p.opened_at);
    const kstHour = (openedDate.getUTCHours() + 9) % 24;
    const idx = Math.floor(kstHour / 6);
    const bucket = bucketData[idx];
    if (bucket) {
      bucket.trades++;
      bucket.pnl += p.pnl;
      if (p.pnl > 0) bucket.wins++;
    }
  }

  const result: ModuleBBucket[] = bucketData.map((b) => ({
    label: b.label,
    pnl: Math.round(b.pnl * 100) / 100,
    winRate: b.trades > 0 ? Math.round((b.wins / b.trades) * 1000) / 1000 : 0,
    trades: b.trades,
  }));

  // 가장 약한 구간: pnl 최저 구간 (거래가 있는 것만)
  const activeBuckets = result.filter((b) => b.trades > 0);
  const weakest = activeBuckets.length > 0
    ? activeBuckets.reduce((min, b) => (b.pnl < min.pnl ? b : min))
    : result[0]!;

  const simulatedGain = weakest.pnl < 0 ? Math.abs(weakest.pnl) : 0;

  const recommendationText = weakest.pnl < 0
    ? `${weakest.label} KST 매매 회피 시 30일 기준 +$${simulatedGain.toFixed(0)} 추가 수익 시뮬레이션`
    : `모든 시간대에서 수익 중. 현재 패턴 유지 권장.`;

  return {
    buckets: result,
    weakestBucket: weakest.label,
    recommendationText,
    simulatedGainUsd: Math.round(simulatedGain * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// 모듈 C — 레버리지 vs 청산률 (Premium)
// 5개 구간: 1-3x, 3-5x, 5-10x, 10-20x, 20x+
// ---------------------------------------------------------------------------
function computeModuleC(positions: AnalyticsPosition[]): ModuleC {
  const rangeDefs = [
    { range: '1-3x', min: 1, max: 3 },
    { range: '3-5x', min: 3, max: 5 },
    { range: '5-10x', min: 5, max: 10 },
    { range: '10-20x', min: 10, max: 20 },
    { range: '20x+', min: 20, max: Infinity },
  ];

  const rangeData = rangeDefs.map((def) => ({
    range: def.range,
    min: def.min,
    max: def.max,
    total: 0,
    liquidated: 0,
  }));

  for (const p of positions) {
    const rd = rangeData.find((r) => p.leverage >= r.min && p.leverage < r.max);
    if (rd) {
      rd.total++;
      if (p.status === 'liquidated') rd.liquidated++;
    }
  }

  const buckets: ModuleCBucket[] = rangeData.map((r) => ({
    range: r.range,
    liquidationRate: r.total > 0 ? Math.round((r.liquidated / r.total) * 1000) / 1000 : 0,
    trades: r.total,
  }));

  // 임계점: 청산률이 처음으로 15% 넘는 구간
  const thresholdBucket = buckets.find((b) => b.trades > 0 && b.liquidationRate > 0.15);
  const thresholdLeverage = thresholdBucket
    ? (rangeData.find((r) => r.range === thresholdBucket.range)?.min ?? 0)
    : 0;

  let recommendationText: string;
  if (thresholdBucket) {
    // 임계점 이후 평균 청산률 계산
    const threshIdx = buckets.indexOf(thresholdBucket);
    const afterThreshold = buckets.slice(threshIdx).filter((b) => b.trades > 0);
    const beforeThreshold = buckets.slice(0, threshIdx).filter((b) => b.trades > 0);
    const avgAfter = afterThreshold.length > 0
      ? afterThreshold.reduce((s, b) => s + b.liquidationRate, 0) / afterThreshold.length
      : 0;
    const avgBefore = beforeThreshold.length > 0
      ? beforeThreshold.reduce((s, b) => s + b.liquidationRate, 0) / beforeThreshold.length
      : 0;
    const multiplier = avgBefore > 0 ? Math.round(avgAfter / avgBefore) : 3;
    recommendationText = `임계점 ${thresholdLeverage}x. 그 이상 사용 시 청산률 ${multiplier}배 증가.`;
  } else {
    recommendationText = '현재 레버리지 사용 범위에서 청산률이 안정적입니다.';
  }

  return { buckets, thresholdLeverage, recommendationText };
}

// ---------------------------------------------------------------------------
// 모듈 D — 거래 행동 패턴 / Revenge Trading 감지 (Premium)
// ---------------------------------------------------------------------------
function computeModuleD(
  positions: AnalyticsPosition[],
  lockModeEnabled: boolean,
): ModuleD {
  // 시간순 정렬 (이미 closed_at ASC 이지만 방어적)
  const sorted = [...positions].sort(
    (a, b) => new Date(a.closed_at ?? a.opened_at).getTime() - new Date(b.closed_at ?? b.opened_at).getTime(),
  );

  const afterWin = { sizes: [] as number[], leverages: [] as number[], nextWins: 0, total: 0 };
  const afterLoss = { sizes: [] as number[], leverages: [] as number[], nextWins: 0, total: 0 };

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    if (prev.pnl > 0) {
      // 이전이 이익
      afterWin.sizes.push(curr.size);
      afterWin.leverages.push(curr.leverage);
      afterWin.total++;
      if (curr.pnl > 0) afterWin.nextWins++;
    } else if (prev.pnl < 0) {
      // 이전이 손실
      afterLoss.sizes.push(curr.size);
      afterLoss.leverages.push(curr.leverage);
      afterLoss.total++;
      if (curr.pnl > 0) afterLoss.nextWins++;
    }
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

  const afterWinAvgSize = avg(afterWin.sizes);
  const afterLossAvgSize = avg(afterLoss.sizes);

  // 손실 후 사이즈 증가 %
  const sizeIncreasePct = afterWinAvgSize > 0
    ? Math.round(((afterLossAvgSize - afterWinAvgSize) / afterWinAvgSize) * 100)
    : 0;

  // 50% 이상 증가면 경고
  const warning = sizeIncreasePct >= 50;

  return {
    afterWin: {
      avgSizeUsd: Math.round(afterWinAvgSize * 100) / 100,
      avgLeverage: Math.round(avg(afterWin.leverages) * 10) / 10,
      nextWinRate: afterWin.total > 0
        ? Math.round((afterWin.nextWins / afterWin.total) * 1000) / 1000
        : 0,
    },
    afterLoss: {
      avgSizeUsd: Math.round(afterLossAvgSize * 100) / 100,
      avgLeverage: Math.round(avg(afterLoss.leverages) * 10) / 10,
      nextWinRate: afterLoss.total > 0
        ? Math.round((afterLoss.nextWins / afterLoss.total) * 1000) / 1000
        : 0,
    },
    sizeIncreasePct,
    warning,
    lockModeEnabled,
  };
}

// ---------------------------------------------------------------------------
// 주간 리포트 데이터 생성 (모듈 E — 일요일 21:00 KST cron 용)
// ---------------------------------------------------------------------------
export interface WeeklyReportData {
  userId: string;
  telegramId: number;
  weekPnl: number;
  trades: number;
  winRate: number;
  bestSymbol: string;
  bestTimeSlot: string;
  worstScenario: string;
  liquidationCause: string;
  topRecommendation: string;
}

export async function computeWeeklyReport(
  db: Db,
  userId: string,
  telegramId: number,
): Promise<WeeklyReportData> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('positions')
    .select('symbol, side, size, leverage, pnl, status, opened_at, closed_at')
    .eq('user_id', userId)
    .in('status', ['closed', 'liquidated'])
    .gte('closed_at', weekAgo)
    .order('closed_at', { ascending: true });

  if (error) throw new Error(`weeklyReport query: ${error.message}`);

  const positions = (data as AnalyticsPosition[]) ?? [];

  let weekPnl = 0;
  let wins = 0;
  const symbolPnl = new Map<string, number>();
  const timeSlotPnl = new Map<string, number>();
  let liquidations = 0;
  let highestLevLiq = '';

  for (const p of positions) {
    weekPnl += p.pnl;
    if (p.pnl > 0) wins++;

    // 심볼별 PnL
    const sym = (p as unknown as { symbol: string }).symbol ?? 'UNKNOWN';
    symbolPnl.set(sym, (symbolPnl.get(sym) ?? 0) + p.pnl);

    // 시간대별
    const kstHour = (new Date(p.opened_at).getUTCHours() + 9) % 24;
    const slot = `${String(Math.floor(kstHour / 6) * 6).padStart(2, '0')}:00–${String(Math.floor(kstHour / 6) * 6 + 6).padStart(2, '0')}:00`;
    timeSlotPnl.set(slot, (timeSlotPnl.get(slot) ?? 0) + p.pnl);

    if (p.status === 'liquidated') {
      liquidations++;
      highestLevLiq = `${p.leverage}x ${sym}`;
    }
  }

  // 강점: 가장 많이 이긴 심볼
  const bestSymbol = [...symbolPnl.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

  // 강점: 가장 좋은 시간대
  const bestTimeSlot = [...timeSlotPnl.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

  // 약점: 가장 많이 진 심볼
  const worstSymbol = [...symbolPnl.entries()]
    .sort((a, b) => a[1] - b[1])[0];
  const worstScenario = worstSymbol && worstSymbol[1] < 0
    ? `${worstSymbol[0]} 에서 $${Math.abs(worstSymbol[1]).toFixed(0)} 손실`
    : 'N/A';

  // 약점: 청산 원인
  const liquidationCause = liquidations > 0
    ? `${liquidations}회 청산 (마지막: ${highestLevLiq})`
    : '청산 없음';

  // 권고
  let topRecommendation = '현재 매매 패턴 유지 권장.';
  const worstTimeSlot = [...timeSlotPnl.entries()]
    .sort((a, b) => a[1] - b[1])[0];
  if (worstTimeSlot && worstTimeSlot[1] < 0) {
    topRecommendation = `${worstTimeSlot[0]} KST 시간대 매매 축소 검토. 해당 구간 손실 $${Math.abs(worstTimeSlot[1]).toFixed(0)}.`;
  }

  return {
    userId,
    telegramId,
    weekPnl: Math.round(weekPnl * 100) / 100,
    trades: positions.length,
    winRate: positions.length > 0 ? Math.round((wins / positions.length) * 1000) / 1000 : 0,
    bestSymbol,
    bestTimeSlot,
    worstScenario,
    liquidationCause,
    topRecommendation,
  };
}
