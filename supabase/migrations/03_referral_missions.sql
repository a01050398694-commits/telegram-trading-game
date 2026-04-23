-- 03_referral_missions.sql
-- B-08: 레퍼럴 미션 상태 테이블.
--   · 3명 초대: +$50,000 연습 자본 즉시 지급
--   · 10명 초대: InviteMember 1개월 Academy 쿠폰 발급
-- users.referred_by 는 이미 존재하므로 "누가 나를 초대" 는 그쪽에서 계산.
-- 본 테이블은 "내가 초대한 사람 수 캐시 + 마일스톤 수령 여부 + 쿠폰 발급 이력"을 보관.

CREATE TABLE IF NOT EXISTS public.referral_missions (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  referred_count INTEGER NOT NULL DEFAULT 0,
  milestone_3_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  milestone_10_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  promo_code TEXT,             -- 10명 마일스톤 달성 시 발급된 InviteMember Promo code
  bonus_amount_granted BIGINT NOT NULL DEFAULT 0,  -- 누적 지급된 보너스 USD (정수 달러)
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_missions_count
  ON public.referral_missions(referred_count);

-- RLS: 본인 데이터만 조회 가능. 서비스 롤(bot)은 SECURITY DEFINER 로 우회.
ALTER TABLE public.referral_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_missions_self_read" ON public.referral_missions;
CREATE POLICY "referral_missions_self_read" ON public.referral_missions
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE telegram_id = COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'telegram_id',
        ''
      )::BIGINT
    )
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.touch_referral_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_referral_missions ON public.referral_missions;
CREATE TRIGGER trg_touch_referral_missions
  BEFORE UPDATE ON public.referral_missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_missions_updated_at();
