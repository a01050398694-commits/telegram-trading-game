-- Stage 15.2 — 시드 정책 변경: 매일 리셋 → 신규 가입 1회만 $10K 지급.
-- seeded_at 컬럼으로 재지급 방지. 기존 유저는 이미 시드 받은 것으로 간주.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS seeded_at timestamptz DEFAULT NULL;

-- 기존 유저는 모두 이미 시드받은 것으로 간주 (재지급 방지)
UPDATE users SET seeded_at = created_at WHERE seeded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_seeded_at ON users(seeded_at);
