-- Stage 15.2 — Premium 매매 분석기 + 매매 잠금 모드 지원 컬럼 추가.

-- 매매 시점 잔액 기록 (포지션 사이즈 % 분석용)
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS entry_balance numeric DEFAULT NULL;

-- 매매 잠금 모드
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lock_mode_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_mode_until timestamptz DEFAULT NULL;

-- Premium 상태 (DB 기반 관리 — getChatMember 폴링 결과 저장)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_until timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_premium ON users(is_premium) WHERE is_premium = true;
