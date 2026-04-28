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
  // Stage 9 — 레퍼럴 트래킹. 초대자의 users.id(uuid) 저장. 본인은 null.
  referred_by: string | null;
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
}

// -- Insert payload types (기본값이 있는 컬럼은 제외) --

export interface UserInsert {
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
  language_code?: string | null;
  // Stage 9 — 신규 insert 시에만 설정. 기존 유저 재접속 시엔 무시.
  referred_by?: string | null;
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

