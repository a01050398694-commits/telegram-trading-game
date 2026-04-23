-- 04_admin_actions.sql
-- D-04: 관리자 감사 로그. Admin API 호출(/api/admin/*) 전 건을 남긴다.
-- 규제/책임 추적용. 유저 승인/거부, 수동 프리미엄 부여, 수동 환불 등.

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_label TEXT NOT NULL,              -- 관리자 식별자 (x-admin-secret 이 어떤 admin 의 것인지)
  action_type TEXT NOT NULL,              -- 'verify_approve' | 'verify_reject' | 'grant_premium' | 'refund' 등
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON public.admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user_id
  ON public.admin_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action_type
  ON public.admin_actions(action_type);

-- 서비스 롤 전용. RLS 로 유저 접근 완전 차단.
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
-- (RLS policy 없이 enable 만 해두면 anon/authenticated 는 모두 deny)
