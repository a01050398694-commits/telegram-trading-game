-- 1. Users 테이블 (유저 정보 및 래퍼럴/VIP 상태)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  is_vip BOOLEAN DEFAULT false, -- 매일 밤 상위 10명에게만 임시 부여
  referral_status TEXT DEFAULT 'NONE', -- 'NONE', 'PENDING', 'APPROVED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Wallets 테이블 — Stage 6+ USD 정수 달러 단위 ($100,000 기본 지급)
-- 레거시 스키마. 실제 운영은 supabase/schema.sql 기준.
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  balance NUMERIC DEFAULT 100000, -- $100K USD seed (Stage 8.0 bug fix: 10_000_000_000 → 100_000)
  is_liquidated BOOLEAN DEFAULT false,
  last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 3. Positions 테이블 (실시간 트레이딩 포지션)
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL, -- 예: 'BTCUSDT'
  position_type TEXT NOT NULL, -- 'LONG' or 'SHORT'
  entry_price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL, -- 진입 금액
  leverage NUMERIC DEFAULT 1,
  liquidation_price NUMERIC NOT NULL, -- 청산가
  status TEXT DEFAULT 'OPEN', -- 'OPEN', 'CLOSED', 'LIQUIDATED'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- 성능 최적화를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON public.positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_user_id ON public.positions(user_id);
