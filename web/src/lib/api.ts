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

export type OrderType = 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'triggered' | 'expired';

export type ServerOrder = {
  id: string;
  symbol: string;
  type: OrderType;
  side: 'long' | 'short';
  price: number;
  size: number;
  leverage: number;
  status: OrderStatus;
  createdAt: string;
  filledAt?: string | null;
  cancelledAt?: string | null;
  positionId?: string | null;
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
  openOrders: ServerOrder[];
};

export type OpenTradeInput = {
  telegramUserId: number;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  fallbackPrice: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  slPrice?: number | null;
  tpPrice?: number | null;
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
// Stage 21 — Telegram Stars NATIVE invoice
// ---------------------------------------------------------------------------

export type StarsPlan = 'premium' | 'recharge_1k' | 'recharge_5k' | 'recharge_10k';

export interface StarsInvoiceResponse {
  ok: true;
  invoiceLink: string;
  plan: StarsPlan;
  amountStars: number;
  priceUsd: number;
  creditUsd: number | null;
}

export function createStarsInvoice(plan: StarsPlan): Promise<StarsInvoiceResponse> {
  return request<StarsInvoiceResponse>('/api/invoice/create', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

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

// Stage 17 — Orders & Position Management
export type PlaceOrderInput = {
  telegramUserId: number;
  symbol: string;
  orderType: 'limit' | 'stop_loss' | 'take_profit';
  side: 'long' | 'short';
  size: number;
  leverage: number;
  triggerPrice: number;
  positionId?: string;
};

export type PlaceOrderResult = { ok: true; orderId: string };

export function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  return request<PlaceOrderResult>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type FetchOrdersResult = { orders: ServerOrder[] };

export function fetchOrders(telegramUserId: number): Promise<FetchOrdersResult> {
  return request<FetchOrdersResult>('/api/orders', {
    query: { telegramUserId },
  });
}

export type CancelOrderResult = { ok: true; orderId: string };

export function cancelOrder(orderId: string, telegramUserId: number): Promise<CancelOrderResult> {
  return request<CancelOrderResult>(`/api/orders/${orderId}`, {
    method: 'DELETE',
    body: JSON.stringify({ telegramUserId }),
  });
}

export function cancelAllOrders(telegramUserId: number): Promise<{ ok: true; count: number }> {
  return request<{ ok: true; count: number }>('/api/orders/all', {
    method: 'DELETE',
    query: { telegramUserId },
  });
}

export type FetchOrderHistoryResult = { orders: ServerOrder[] };

export function fetchOrderHistory(telegramUserId: number): Promise<FetchOrderHistoryResult> {
  return request<FetchOrderHistoryResult>('/api/orders/history', {
    query: { telegramUserId },
  });
}

export type SetSlTpInput = {
  telegramUserId: number;
  positionId: string;
  slPrice?: number | null;
  tpPrice?: number | null;
};

export type SetSlTpResult = { ok: true; positionId: string };

export function setSlTp(input: SetSlTpInput): Promise<SetSlTpResult> {
  return request<SetSlTpResult>('/api/positions/sl-tp', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Stage 17 — Partial Close Position
export type ClosePartialInput = {
  telegramUserId: number;
  positionId: string;
  closePct: 25 | 50 | 75 | 100;
  fallbackPrice: number;
};

export type ClosePartialResult = {
  ok: true;
  pnl: number;
  newSize: number;
  newBalance: number;
  newStatus: 'open' | 'closed';
};

export function closePartial(input: ClosePartialInput): Promise<ClosePartialResult> {
  return request<ClosePartialResult>('/api/trade/close-partial', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Stage 17 — Set Margin Mode (Isolated / Cross)
export type SetMarginModeInput = {
  telegramUserId: number;
  positionId: string;
  marginMode: 'isolated' | 'cross';
};

export type SetMarginModeResult = {
  ok: true;
  marginMode: 'isolated' | 'cross';
};

export function setMarginMode(input: SetMarginModeInput): Promise<SetMarginModeResult> {
  return request<SetMarginModeResult>('/api/positions/margin-mode', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

