-- Migration 14: close_position_partial RPC for partial liquidations (Stage 17 Phase G)
-- Function signature: close_position_partial(p_user_id UUID, p_position_id UUID, p_close_pct INTEGER, p_mark_price NUMERIC)
-- Returns: { pnl, new_size, new_balance, new_status }
-- IDOR protection: user_id parameter mandatory, checked inside function

CREATE OR REPLACE FUNCTION public.close_position_partial(
  p_user_id UUID,
  p_position_id UUID,
  p_close_pct INTEGER,
  p_mark_price NUMERIC(20, 8)
) RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_size BIGINT;
  v_side TEXT;
  v_entry_price NUMERIC(20, 8);
  v_leverage INTEGER;
  v_close_size BIGINT;
  v_pnl BIGINT;
  v_return_amount BIGINT;
  v_new_balance BIGINT;
  v_new_size BIGINT;
  v_new_status TEXT;
BEGIN
  -- Fetch position with ownership check
  SELECT user_id, size, side, entry_price, leverage
    INTO v_user_id, v_size, v_side, v_entry_price, v_leverage
    FROM public.positions
    WHERE id = p_position_id AND status = 'open'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POSITION_NOT_FOUND_OR_NOT_OPEN: %', p_position_id;
  END IF;

  -- IDOR check: verify caller owns this position
  IF v_user_id != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: user % cannot close position owned by %', p_user_id, v_user_id;
  END IF;

  -- Calculate close size (percentage of current position)
  v_close_size := (v_size * p_close_pct) / 100;

  -- Calculate PnL (side-dependent)
  IF v_side = 'long' THEN
    v_pnl := ((p_mark_price - v_entry_price) / v_entry_price) * v_close_size * v_leverage;
  ELSE  -- short
    v_pnl := ((v_entry_price - p_mark_price) / v_entry_price) * v_close_size * v_leverage;
  END IF;

  -- Return amount = principal + PnL
  v_return_amount := v_close_size + v_pnl;
  v_new_size := v_size - v_close_size;

  -- 100% close vs partial close
  IF p_close_pct = 100 THEN
    v_new_status := 'closed';
    UPDATE public.positions
      SET status = 'closed',
          pnl = v_pnl,
          realized_pnl_total = v_pnl,
          closed_at = now()
      WHERE id = p_position_id;
  ELSE
    -- Partial close: reduce size, accumulate realized PnL, keep status open
    UPDATE public.positions
      SET size = v_new_size,
          realized_pnl_total = realized_pnl_total + v_pnl
      WHERE id = p_position_id;
    v_new_status := 'open';
  END IF;

  -- Credit wallet with return amount
  UPDATE public.wallets
    SET balance = balance + v_return_amount
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_balance;

  -- Expire any pending SL/TP orders for this position (invalid after partial close)
  UPDATE public.orders
    SET status = 'expired'
    WHERE position_id = p_position_id AND status = 'pending';

  RETURN ROW(
    v_pnl,
    v_new_size,
    v_new_balance,
    v_new_status
  );
END;
$$;

-- Grant only service_role (API layer enforces app-level IDOR check via userId param)
REVOKE ALL ON FUNCTION public.close_position_partial(UUID, UUID, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_position_partial(UUID, UUID, INTEGER, NUMERIC) TO service_role;
