-- Stage 15.7 — Atomic position open/close via PostgreSQL functions
-- Intent: openPosition / closePosition 의 wallet 차감 + positions insert 두 쿼리 사이
--   동시성 사고 시 wallet 음수 / ghost position 생성 위험. SELECT FOR UPDATE 로 차단.
-- 타입 정합: schema.sql 의 wallets.balance / positions.size / positions.pnl = BIGINT.
--   entry_price, liquidation_price 만 numeric(20,8) 유지 (암호화폐 정밀도).

-- ============================================================
-- open_position_atomic
--   · wallet FOR UPDATE 잠금
--   · is_liquidated / balance 검증 후 차감 + insert 한 트랜잭션
--   · 실패 시 RAISE EXCEPTION → 함수 전체 트랜잭션 자동 롤백
-- ============================================================

CREATE OR REPLACE FUNCTION public.open_position_atomic(
  p_user_id           UUID,
  p_symbol            TEXT,
  p_position_type     TEXT,
  p_side              TEXT,
  p_size              BIGINT,
  p_leverage          INTEGER,
  p_entry_price       NUMERIC(20, 8),
  p_liquidation_price NUMERIC(20, 8)
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance         BIGINT;
  v_is_liquidated   BOOLEAN;
  v_new_position_id UUID;
BEGIN
  SELECT balance, is_liquidated
    INTO v_balance, v_is_liquidated
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_MISSING: user %', p_user_id;
  END IF;

  IF v_is_liquidated THEN
    RAISE EXCEPTION 'LIQUIDATED';
  END IF;

  IF v_balance < p_size THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: % < %', v_balance, p_size;
  END IF;

  UPDATE public.wallets
    SET balance = balance - p_size
    WHERE user_id = p_user_id;

  INSERT INTO public.positions (
    user_id, symbol, position_type, side, size, leverage,
    entry_price, liquidation_price, status
  ) VALUES (
    p_user_id, p_symbol, p_position_type, p_side, p_size, p_leverage,
    p_entry_price, p_liquidation_price, 'open'
  ) RETURNING id INTO v_new_position_id;

  RETURN v_new_position_id;
END;
$$;

-- ============================================================
-- close_position_atomic
--   · positions FOR UPDATE 잠금 + status='open' 검증
--   · pnl / return_amount 는 노드가 계산 (PnL 공식 = liquidation.ts SoT)
--   · positions 업데이트 + wallets 적립 atomic
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_position_atomic(
  p_position_id     UUID,
  p_pnl             BIGINT,
  p_return_amount   BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID;
  v_new_balance BIGINT;
BEGIN
  SELECT user_id INTO v_user_id
    FROM public.positions
    WHERE id = p_position_id AND status = 'open'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POSITION_NOT_FOUND_OR_NOT_OPEN: %', p_position_id;
  END IF;

  UPDATE public.positions
    SET status = 'closed', pnl = p_pnl, closed_at = now()
    WHERE id = p_position_id;

  UPDATE public.wallets
    SET balance = balance + p_return_amount
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

-- ============================================================
-- 권한: SECURITY DEFINER 함수는 호출자 RLS 우회하므로
-- service_role 만 EXECUTE 가능하도록 명시적 제한.
-- ============================================================

REVOKE ALL ON FUNCTION public.open_position_atomic(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_position_atomic(UUID, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_position_atomic(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_position_atomic(UUID, BIGINT, BIGINT) TO service_role;
