-- Migration 12: Orders table for Limit/Stop orders (Stage 17)
-- Status: pending, filled, cancelled, triggered, expired
-- Linked to positions via position_id (nullable for limit orders, required for SL/TP)

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('limit', 'stop_loss', 'take_profit')),
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  price NUMERIC(20, 8) NOT NULL,  -- limit price for limit, trigger price for SL/TP
  size BIGINT NOT NULL,            -- order size (USD equivalent)
  leverage INTEGER NOT NULL,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,  -- NULL for limit orders, filled position id for SL/TP
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'triggered', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  filled_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  triggered_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_orders_user_symbol_status ON public.orders(user_id, symbol, status);
CREATE INDEX IF NOT EXISTS idx_orders_position_id ON public.orders(position_id) WHERE position_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status_pending ON public.orders(status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "users_can_view_own_orders" ON public.orders;
CREATE POLICY "users_can_view_own_orders" ON public.orders
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_insert_own_orders" ON public.orders;
CREATE POLICY "users_can_insert_own_orders" ON public.orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_update_own_pending_orders" ON public.orders;
CREATE POLICY "users_can_update_own_pending_orders" ON public.orders
  FOR UPDATE USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Service role bypasses RLS for admin operations
GRANT ALL ON public.orders TO service_role;
