// Supabase 테이블 row 타입. supabase/schema.sql과 1:1 매칭.
// 추후 `supabase gen types` 자동 생성으로 교체 가능하지만,
// Stage 2에서는 실제 프로젝트 연결 전에도 컴파일 가능하도록 수동 정의한다.

export type PositionType = 'spot' | 'futures';
export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed' | 'liquidated';

export interface UserRow {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletRow {
  user_id: string;
  // bigint 컬럼 — supabase-js는 숫자가 Number 안전범위(2^53)를 넘으면 string으로 반환.
  // 게임머니 최대값이 수백억 단위라 Number.MAX_SAFE_INTEGER(9천조) 대비 안전하므로 number 사용.
  balance: number;
  is_liquidated: boolean;
  last_credited_at: string | null;
  updated_at: string;
}

export interface PositionRow {
  id: string;
  user_id: string;
  symbol: string;
  position_type: PositionType;
  side: PositionSide;
  size: number;
  leverage: number;
  // numeric 컬럼 — supabase-js는 string으로 반환. 계산 시 Number() 변환.
  entry_price: string;
  liquidation_price: string | null;
  status: PositionStatus;
  pnl: number;
  opened_at: string;
  closed_at: string | null;
  // Stage 17 — SL/TP + margin mode
  sl_price: string | null;
  tp_price: string | null;
  margin_mode: 'isolated' | 'cross';
  realized_pnl_total: number;
}

// -- Insert payload types (기본값이 있는 컬럼은 제외) --

export interface UserInsert {
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
  language_code?: string | null;
}

// Stage 9 — 거래소 UID 인증 신청 상태.
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRow {
  id: string;
  user_id: string;
  exchange_id: string;
  uid: string;
  email: string | null;
  status: VerificationStatus;
  created_at: string;
}

export interface VerificationInsert {
  user_id: string;
  exchange_id: string;
  uid: string;
  email?: string | null;
}

export interface PositionInsert {
  user_id: string;
  symbol: string;
  position_type: PositionType;
  side: PositionSide;
  size: number;
  leverage: number;
  entry_price: number;
  liquidation_price: number | null;
}

export interface RankingSnapshotRow {
  id: string;
  date: string;
  rank: number;
  user_id: string;
  equity: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  created_at: string;
}

// Stage 15.6 — Payment events (idempotency guard)
export interface PaymentEventRow {
  id: string;
  event_id: string;
  source: string;
  chat_id: string | null;
  telegram_user_id: number | null;
  payload: Record<string, unknown> | null;
  processed_at: string;
}

export interface PaymentEventInsert {
  event_id: string;
  source: string;
  chat_id?: string | null;
  telegram_user_id?: number | null;
  payload?: Record<string, unknown> | null;
}

// Stage 17 — Order types for Limit/Stop orders
export type OrderType = 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'triggered' | 'expired';

export interface OrderRow {
  id: string;
  user_id: string;
  symbol: string;
  type: OrderType;
  side: PositionSide;
  price: string;  // numeric → string
  size: number;
  leverage: number;
  position_id: string | null;
  status: OrderStatus;
  created_at: string;
  filled_at: string | null;
  cancelled_at: string | null;
  triggered_at: string | null;
}

export interface OrderInsert {
  user_id: string;
  symbol: string;
  type: OrderType;
  side: PositionSide;
  price: number;
  size: number;
  leverage: number;
  position_id?: string | null;
  status?: OrderStatus;
}
