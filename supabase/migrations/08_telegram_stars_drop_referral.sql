-- Stage 15.3 — Telegram Stars 결제 시스템 + Referral 시스템 폐기
-- Intent: 외부 InviteMember 결제 제거, Telegram Stars 자체 결제 통합
--
-- Changes:
--   1. DROP users.referred_by FK (referral tracking 폐기)
--   2. DROP referral_missions 테이블 (CASCADE)
--   3. ADD users.subscription_id (Telegram subscription handle)
--   4. CREATE subscription_txns (구독 거래 기록)
--   5. CREATE recharge_txns (재충전 거래 기록)
--   6. Enable RLS on both new tables (auth.uid() = user_id)

-- ============================================================
-- PART 1: DROP referral system
-- ============================================================

-- Drop users.referred_by FK + index (데이터는 보존하지 않음, 그대로 drop)
ALTER TABLE IF EXISTS public.users
  DROP COLUMN IF EXISTS referred_by CASCADE;

-- Drop referral_missions table entirely
DROP TABLE IF EXISTS public.referral_missions CASCADE;


-- ============================================================
-- PART 2: Extend users table for subscription
-- ============================================================

-- Add subscription tracking columns (if not already in 07_premium_analytics)
-- Note: is_premium, premium_until already added in 07
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_id TEXT UNIQUE DEFAULT NULL;

-- Index for active subscriptions
CREATE INDEX IF NOT EXISTS idx_users_subscription_id ON public.users(subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_premium_until ON public.users(premium_until) WHERE premium_until > now();


-- ============================================================
-- PART 3: Create subscription_txns table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_txns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  amount_stars INTEGER NOT NULL,
  amount_usd NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'XTR',
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'failed', 'expired', 'refunded')),
  period_start TIMESTAMPTZ DEFAULT now(),
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_txns_user ON public.subscription_txns(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_txns_status ON public.subscription_txns(status) WHERE status = 'active';

-- Enable RLS on subscription_txns
ALTER TABLE public.subscription_txns ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only read their own subscription records
DROP POLICY IF EXISTS "subscription_txns_user_select" ON public.subscription_txns;
CREATE POLICY "subscription_txns_user_select" ON public.subscription_txns
  FOR SELECT USING (auth.uid() = user_id);

-- RLS: Users can only insert their own subscription records (bot/service role will bypass via SECURITY DEFINER)
DROP POLICY IF EXISTS "subscription_txns_user_insert" ON public.subscription_txns;
CREATE POLICY "subscription_txns_user_insert" ON public.subscription_txns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS: Users cannot directly update (bot updates only)
DROP POLICY IF EXISTS "subscription_txns_user_update" ON public.subscription_txns;
CREATE POLICY "subscription_txns_user_update" ON public.subscription_txns
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- PART 4: Create recharge_txns table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recharge_txns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_payment_charge_id TEXT UNIQUE NOT NULL,
  amount_stars INTEGER NOT NULL,
  amount_usd NUMERIC(10, 2) NOT NULL,
  credit_amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'XTR',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_recharge_txns_user ON public.recharge_txns(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_txns_status ON public.recharge_txns(status) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_recharge_txns_charge_id ON public.recharge_txns(telegram_payment_charge_id);

-- Enable RLS on recharge_txns
ALTER TABLE public.recharge_txns ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only read their own recharge records
DROP POLICY IF EXISTS "recharge_txns_user_select" ON public.recharge_txns;
CREATE POLICY "recharge_txns_user_select" ON public.recharge_txns
  FOR SELECT USING (auth.uid() = user_id);

-- RLS: Users can only insert their own recharge records (bot/service role will bypass via SECURITY DEFINER)
DROP POLICY IF EXISTS "recharge_txns_user_insert" ON public.recharge_txns;
CREATE POLICY "recharge_txns_user_insert" ON public.recharge_txns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS: Users cannot directly update (bot updates only)
DROP POLICY IF EXISTS "recharge_txns_user_update" ON public.recharge_txns;
CREATE POLICY "recharge_txns_user_update" ON public.recharge_txns
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
