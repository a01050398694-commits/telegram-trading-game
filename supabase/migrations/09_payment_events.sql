-- Stage 15.6 — Payment idempotency guard
-- Intent: Telegram chat_member retry / InviteMember webhook 중복 발화에 대한
-- 1차 방어막. handler 진입 시점에 INSERT ... ON CONFLICT DO NOTHING 으로
-- 같은 event_id 두번째 호출은 row 0개 영향 → 즉시 return.

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,           -- e.g. 'invitemember:<chatId>:<tgUserId>:<update.date>'
  source TEXT NOT NULL,                    -- 'invitemember' | 'stars' | ...
  chat_id TEXT,
  telegram_user_id BIGINT,
  payload JSONB,                           -- raw chat_member update for audit
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_source ON public.payment_events(source);
CREATE INDEX IF NOT EXISTS idx_payment_events_tg_user ON public.payment_events(telegram_user_id);

-- RLS: bot service-role 만 접근. 일반 유저는 read/write 모두 거부.
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_events_no_user_access" ON public.payment_events;
CREATE POLICY "payment_events_no_user_access" ON public.payment_events
  FOR ALL USING (false) WITH CHECK (false);
-- service_role 키는 RLS bypass 라서 봇은 이 정책 무시하고 read/write 가능.
