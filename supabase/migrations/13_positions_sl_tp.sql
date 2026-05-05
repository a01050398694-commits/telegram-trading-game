-- Migration 13: Positions table extension + RPC signature update (Stage 17)
-- Add sl_price, tp_price, margin_mode, realized_pnl_total columns to positions table
-- Update open_position_atomic to accept optional SL/TP prices

-- Add 4 new columns to positions table
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS sl_price NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS tp_price NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS margin_mode TEXT DEFAULT 'isolated' CHECK (margin_mode IN ('isolated', 'cross')),
  ADD COLUMN IF NOT EXISTS realized_pnl_total BIGINT DEFAULT 0;

-- ============================================================
-- Update open_position_atomic signature to accept SL/TP prices
-- Default NULL maintains backward compatibility with existing callers
-- ============================================================

DROP FUNCTION IF EXISTS public.open_position_atomic(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.open_position_atomic(
  p_user_id           UUID,
  p_symbol            TEXT,
  p_position_type     TEXT,
  p_side              TEXT,
  p_size              BIGINT,
  p_leverage          INTEGER,
  p_entry_price       NUMERIC(20, 8),
  p_liquidation_price NUMERIC(20, 8),
  p_sl_price          NUMERIC(20, 8) DEFAULT NULL,
  p_tp_price          NUMERIC(20, 8) DEFAULT NULL
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
    entry_price, liquidation_price, status,
    sl_price, tp_price, margin_mode, realized_pnl_total
  ) VALUES (
    p_user_id, p_symbol, p_position_type, p_side, p_size, p_leverage,
    p_entry_price, p_liquidation_price, 'open',
    p_sl_price, p_tp_price, 'isolated', 0
  ) RETURNING id INTO v_new_position_id;

  RETURN v_new_position_id;
END;
$$;

-- Update grant for new signature
REVOKE ALL ON FUNCTION public.open_position_atomic(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_position_atomic(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO service_role;
