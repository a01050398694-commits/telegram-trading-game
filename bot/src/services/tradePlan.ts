// Stage 20 — Korean trade-plan formatter.
// Why: external trader critique flagged AI persona ("looks juicy", "vibe is bullish") as unfit for
//   actual execution. Replaces commentary with a structured plan: entry/SL/TP1+weight/TP2+weight,
//   cancel conditions, scenario-based handling. No AI fluff.

import type { Signal } from './signalEngine.js';

const KST_TZ = 'Asia/Seoul';

function formatKST(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatPrice(price: number): string {
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

interface TradePlanOptions {
  generatedAt?: number;
}

export function formatTradePlan(signal: Signal, options: TradePlanOptions = {}): string {
  const now = options.generatedAt ?? Date.now();
  const timeStr = formatKST(now);

  if (signal.direction === 'skip') {
    return formatHoldPlan(signal, timeStr);
  }
  return formatEntryPlan(signal, timeStr);
}

function formatEntryPlan(signal: Signal, timeStr: string): string {
  const directionLabel = signal.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
  const slDist = Math.abs(signal.entry - signal.stopLoss);
  const tp1Dist = Math.abs(signal.tp1 - signal.entry);
  const tp2Dist = Math.abs(signal.tp2 - signal.entry);
  const slPct = signal.entry > 0 ? (slDist / signal.entry) * 100 : 0;
  const rr1 = slDist > 0 ? tp1Dist / slDist : 0;
  const rr2 = slDist > 0 ? tp2Dist / slDist : 0;

  // Why: alts on high-vol setups → take more off at TP1 to derisk; BTC and stable setups split evenly.
  const isAlt = signal.symbol !== 'BTCUSDT';
  const isHighVol = slPct > 2.0;
  const tp1Weight = isAlt && isHighVol ? 70 : 50;
  const tp2Weight = 100 - tp1Weight;

  const sign = signal.direction === 'long' ? 1 : -1;
  const tp1Pct = signal.entry > 0 ? (tp1Dist / signal.entry) * 100 * sign : 0;
  const tp2Pct = signal.entry > 0 ? (tp2Dist / signal.entry) * 100 * sign : 0;

  const cancelTime = '진입 후 30분 안에 미체결 시 무효';
  const invalidPrice =
    signal.direction === 'long' ? signal.entry * 0.997 : signal.entry * 1.003;
  const cancelPrice =
    signal.direction === 'long'
      ? `${formatPrice(invalidPrice)} 위에서 15m 마감 미발생 시 무효`
      : `${formatPrice(invalidPrice)} 아래에서 15m 마감 미발생 시 무효`;

  return [
    `${directionLabel} ${signal.symbol}`,
    `📅 ${timeStr} KST`,
    ``,
    `진입가: ${formatPrice(signal.entry)}`,
    `손절가: ${formatPrice(signal.stopLoss)} (${formatPct(-slPct)})`,
    `1차 익절: ${formatPrice(signal.tp1)} (${formatPct(tp1Pct)}) — 비중 ${tp1Weight}%`,
    `2차 익절: ${formatPrice(signal.tp2)} (${formatPct(tp2Pct)}) — 비중 ${tp2Weight}%`,
    ``,
    `손익비: TP1 ${rr1.toFixed(2)}R · TP2 ${rr2.toFixed(2)}R`,
    `레버리지: ${signal.leverage}x (확신도 ${signal.confidence})`,
    ``,
    `📌 진입 취소 조건:`,
    `  • ${cancelTime}`,
    `  • ${cancelPrice}`,
    ``,
    `📋 시나리오별 대처:`,
    `  • TP1 도달 → SL을 진입가로 이동 (break-even), ${tp1Weight}% 청산 후 잔여 ${tp2Weight}% TP2 노림`,
    `  • SL 도달 → 100% 청산`,
    `  • 24h 무반응 → 절반 축소 권장 (자동 청산 X)`,
    `  • 48h 미체결 → 100% 청산 (timeout)`,
    ``,
    `🔍 근거: ${signal.rationale.slice(0, 3).join(' · ')}`,
  ].join('\n');
}

function formatHoldPlan(signal: Signal, timeStr: string): string {
  return [
    `⏸ HOLD ${signal.symbol}`,
    `📅 ${timeStr} KST`,
    ``,
    `현재가: ${formatPrice(signal.currentPrice)}`,
    `사유: ${signal.rationale.slice(0, 2).join(' · ')}`,
    ``,
    `진입 안 함 — 다음 tick까지 관망.`,
  ].join('\n');
}
