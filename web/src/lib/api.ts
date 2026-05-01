// Bot Express 서버 REST 클라이언트.
// Vite proxy 설정으로 /api/* 는 localhost:3000 으로 포워딩됨.
// cloudflared 터널 내부에서도 same-origin 으로 호출 가능.

export type ServerPosition = {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  entryPrice: number;
  liquidationPrice: number | null;
  openedAt: string;
};

// Stage 9 — 거래소 UID 인증 신청 상태.
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type ServerVerification = {
  id: string;
  exchangeId: string;
  uid: string;
  email: string | null;
  status: VerificationStatus;
  createdAt: string;
};

export type UserStatus = {
  userId: string;
  balance: number;
  isLiquidated: boolean;
  lastCreditedAt: string | null;
  position: ServerPosition | null;
  verification: ServerVerification | null;
  isVIP: boolean;
  isPremium: boolean;
  rank: number;
  // null = 서버가 조회 실패 또는 신규 유저. UI 는 "--" 로 표시.
  yesterdayPnl: number | null;
  telegramUserId: number;
  history: { date: string; pnl: number }[];
};

export type OpenTradeInput = {
  telegramUserId: number;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  fallbackPrice: number;
};

export type OpenTradeResult = { ok: true; positionId: string; entryPrice: number };
export type CloseTradeResult = { ok: true; pnl: number; balance: number; exitPrice: number };

export type HistoryEntry = {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  entryPrice: number;
  status: 'closed' | 'liquidated';
  pnl: number;
  openedAt: string;
  closedAt: string | null;
};
export type HistoryResponse = { history: HistoryEntry[] };

export type RankingEntry = {
  rank: number;
  telegramUserId: number;
  username: string;
  equity: number;
  dailyPnl: number;
  dailyPnlPercent: number;
};
export type RankingsResponse = { rankings: RankingEntry[] };

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number> },
): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const fullPath = baseUrl + path;
  
  const url = init?.query
    ? `${fullPath}?${new URLSearchParams(
        Object.entries(init.query).map(([k, v]) => [k, String(v)]),
      )}`
    : fullPath;
  const headers: HeadersInit = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers || {}),
  };

  const initData = window.Telegram?.WebApp?.initData;
  if (initData) {
    (headers as Record<string, string>)['X-Telegram-Init-Data'] = initData;
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function fetchUserStatus(telegramUserId: number): Promise<UserStatus> {
  return request<UserStatus>('/api/user/status', { query: { telegramUserId } });
}

export function fetchUserHistory(telegramUserId: number): Promise<HistoryResponse> {
  return request<HistoryResponse>('/api/user/history', { query: { telegramUserId } });
}

export function openTrade(input: OpenTradeInput): Promise<OpenTradeResult> {
  return request<OpenTradeResult>('/api/trade/open', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function closeTrade(telegramUserId: number, positionId: string, fallbackPrice: number): Promise<CloseTradeResult> {
  return request<CloseTradeResult>('/api/trade/close', {
    method: 'POST',
    body: JSON.stringify({ telegramUserId, positionId, fallbackPrice }),
  });
}

export function getTodayRankings(): Promise<RankingsResponse> {
  return request<RankingsResponse>('/api/rankings/today', { method: 'GET' });
}

// Stage 9 — 거래소 UID 인증 신청 제출. 성공 시 서버가 생성한 VerificationRow 반환.
export type SubmitVerificationInput = {
  telegramUserId: number;
  exchangeId: string;
  uid: string;
  email?: string | null;
};
export type SubmitVerificationResult = { ok: true; verification: ServerVerification };

export function submitVerification(
  input: SubmitVerificationInput,
): Promise<SubmitVerificationResult> {
  return request<SubmitVerificationResult>('/api/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export { ApiError };

// ---------------------------------------------------------------------------
// Stage 15.2 — Premium 매매 분석기 API
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

export function fetchPremiumAnalytics(telegramUserId: number): Promise<PremiumAnalyticsResponse> {
  return request<PremiumAnalyticsResponse>('/api/premium/analytics', {
    query: { telegramUserId },
  });
}

export function toggleLockMode(
  telegramUserId: number,
  enabled: boolean,
): Promise<{ ok: true; lockModeEnabled: boolean }> {
  return request<{ ok: true; lockModeEnabled: boolean }>('/api/premium/lock-mode', {
    method: 'POST',
    body: JSON.stringify({ telegramUserId, enabled }),
  });
}

