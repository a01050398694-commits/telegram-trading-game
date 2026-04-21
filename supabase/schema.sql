-- =============================================================
-- Telegram Trading Game — Stage 2 Schema
-- 실행 방법: Supabase Dashboard > SQL Editor에 전체 복사-붙여넣기 후 Run
-- 재실행 안전(IF NOT EXISTS). 파괴적 변경은 별도 마이그레이션 파일로 분리.
-- =============================================================

-- 모든 금액은 게임머니 단위로 bigint 저장.
-- Stage 2~5.5: 원 단위 (100억 = 10_000_000_000)
-- Stage 6+: USD 정수 달러 단위 (시드 $100,000 = 100_000)
-- 가격(entry_price, liquidation_price)은 numeric(20, 8)로 암호화폐 시세 정밀도 확보.
--
-- Stage 6 마이그레이션 (기존 유저 리셋) — 필요 시 Supabase SQL Editor에 실행:
--   UPDATE public.wallets
--     SET balance = 100000, is_liquidated = false, last_credited_at = NULL;
--   DELETE FROM public.positions;  -- 기존 포지션은 단위 불일치로 폐기
--
-- Stage 8.0 FATAL $10B BUG FIX — 기존 유저가 10_000_000_000 으로 저장되어
-- Total Equity 가 $10,000.02M 으로 표시되던 증상. 대시보드에서 반드시 실행:
--   UPDATE public.wallets
--     SET balance = 100000, is_liquidated = false, last_credited_at = NULL
--     WHERE balance > 1000000;   -- $1M 초과는 모두 버그 값으로 간주, 100K 로 강제 리셋.

-- -----------------------------------------------------------
-- 1. users: 텔레그램 사용자 기본 정보
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     bigint UNIQUE NOT NULL,
  username        text,
  first_name      text,
  language_code   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON public.users(telegram_id);

-- -----------------------------------------------------------
-- 2. wallets: 유저별 게임머니 지갑
--   - 1 user : 1 wallet
--   - is_liquidated = true 인 동안은 포지션 진입 금지 (재결제 전까지 락)
--   - last_credited_at: 일일 100억 지급 체크용 (UTC 날짜 기준)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id           uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance           bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_liquidated     boolean NOT NULL DEFAULT false,
  last_credited_at  date,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- 3. positions: 오픈/청산된 트레이딩 포지션
--   - position_type: 'spot' (현물, leverage=1, 청산 없음) | 'futures'
--   - side: 'long' | 'short'
--   - size: 포지션에 투입한 게임머니(증거금) — 청산 시 전액 소실
--   - leverage: 1(현물) ~ 100(선물)
--   - liquidation_price: 선물에서 강제 청산이 트리거되는 가격
--   - status: 'open' | 'closed' | 'liquidated'
--   - pnl: 청산/종료 시 손익 (양수=이익, 음수=손실)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.positions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol             text NOT NULL,
  position_type      text NOT NULL CHECK (position_type IN ('spot', 'futures')),
  side               text NOT NULL CHECK (side IN ('long', 'short')),
  size               bigint NOT NULL CHECK (size > 0),
  leverage           integer NOT NULL CHECK (leverage >= 1 AND leverage <= 125),
  entry_price        numeric(20, 8) NOT NULL CHECK (entry_price > 0),
  liquidation_price  numeric(20, 8),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
  pnl                bigint NOT NULL DEFAULT 0,
  opened_at          timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);

CREATE INDEX IF NOT EXISTS positions_user_status_idx ON public.positions(user_id, status);
CREATE INDEX IF NOT EXISTS positions_symbol_status_idx ON public.positions(symbol, status);

-- -----------------------------------------------------------
-- updated_at 자동 갱신 트리거
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_wallets_updated_at ON public.wallets;
CREATE TRIGGER set_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------
-- Stage 9: 레퍼럴 + 거래소 UID 인증
--   A) users.referred_by — 초대한 유저의 uuid(users.id FK)
--   B) exchange_verifications — Premium 탭에서 제출된 UID 인증 신청 큐
--
-- 최초 배포 시엔 위 CREATE TABLE 내부에 넣어도 되지만, 기존 운영 DB 호환을
-- 위해 ALTER + CREATE 형태로 분리. Supabase Dashboard SQL Editor 에 이 파일
-- 전체를 붙여 Run 하면 IF NOT EXISTS 로 안전하게 상승 적용된다.
-- -----------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_referred_by_idx ON public.users(referred_by);

CREATE TABLE IF NOT EXISTS public.exchange_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exchange_id   text NOT NULL,
  uid           text NOT NULL,
  email         text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_verifications_user_idx
  ON public.exchange_verifications(user_id);
CREATE INDEX IF NOT EXISTS exchange_verifications_status_idx
  ON public.exchange_verifications(status);

-- -----------------------------------------------------------
-- Row Level Security
--   - 현재는 bot 서버가 service_role 키로 접근하므로 RLS는 사실상 우회된다.
--   - 추후 Web App에서 anon 키로 직접 읽을 때를 대비해 정책만 선언해 둔다.
--   - 지금은 모든 테이블 RLS ON + 정책 없음 = anon 접근 차단.
-- -----------------------------------------------------------
ALTER TABLE public.users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_verifications  ENABLE ROW LEVEL SECURITY;
