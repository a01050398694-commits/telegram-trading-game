-- Stage 20 — Signal outcome tracking for performance metrics.
-- Why: every fired LONG/SHORT signal is auditable end-to-end so /stats and dailyReport
--   reflect realized R, not just claims. Service-role only (CTO-only RLS).

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL CHECK (symbol IN ('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT')),
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price NUMERIC(20, 8) NOT NULL,
  sl_price NUMERIC(20, 8) NOT NULL,
  tp1_price NUMERIC(20, 8) NOT NULL,
  tp2_price NUMERIC(20, 8) NOT NULL,
  leverage INTEGER NOT NULL DEFAULT 1,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'none')),
  score INTEGER NOT NULL,
  rationale JSONB NOT NULL DEFAULT '[]'::jsonb,
  broadcast_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  hit TEXT CHECK (hit IN ('tp1', 'tp2', 'sl', 'timeout')),
  exit_price NUMERIC(20, 8),
  exit_at TIMESTAMPTZ,
  duration_hours NUMERIC(10, 2),
  pnl_r_gross NUMERIC(10, 4),
  pnl_r_net NUMERIC(10, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_symbol_status ON signal_outcomes(symbol, status);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_broadcast_at ON signal_outcomes(broadcast_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_status_open ON signal_outcomes(status) WHERE status = 'open';

ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;
-- service-role bypasses RLS automatically; no user policies needed (CTO admin tool).
