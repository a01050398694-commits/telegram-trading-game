-- Stage 22 — Signal pipeline rewrite: status expansion + dedup + honest metrics view.
-- Why: pre-rewrite the table only captured 'open'/'closed' broadcast outcomes, so 96% of
--   ticks (skips, dedups, validation failures) were invisible to operators and to the
--   honest-metrics view. This migration adds the missing status enums, the setup-hash
--   for 6h dedup window, the failed-gate audit trail, and a v_signal_performance_30d
--   view that computes profit factor / expectancy / honest win rate from realized
--   pnl_r_net (not from the misleading `hit` label which earlier flagged tp2 even when
--   tp was below entry on a long — see incident 2026-05-06).

-- 1. New columns. NULL by default; only broadcast statuses (open/closed) require all
--    price fields. Application code enforces, schema stays permissive for skipped rows.
ALTER TABLE signal_outcomes
  ADD COLUMN IF NOT EXISTS setup_hash TEXT,
  ADD COLUMN IF NOT EXISTS validation_failed_gate TEXT,
  ADD COLUMN IF NOT EXISTS dedup_window_hours NUMERIC(6, 2);

-- 2. Relax NOT NULL on price columns so skipped/deduped/invalid rows can omit them.
ALTER TABLE signal_outcomes ALTER COLUMN entry_price DROP NOT NULL;
ALTER TABLE signal_outcomes ALTER COLUMN sl_price DROP NOT NULL;
ALTER TABLE signal_outcomes ALTER COLUMN tp1_price DROP NOT NULL;
ALTER TABLE signal_outcomes ALTER COLUMN tp2_price DROP NOT NULL;

-- 3. Expand status enum.
ALTER TABLE signal_outcomes DROP CONSTRAINT IF EXISTS signal_outcomes_status_check;
ALTER TABLE signal_outcomes
  ADD CONSTRAINT signal_outcomes_status_check
  CHECK (status IN ('open', 'closed', 'skipped', 'deduped', 'invalid'));

-- 4. Allow direction='skip' for cases where no clear intent existed.
ALTER TABLE signal_outcomes DROP CONSTRAINT IF EXISTS signal_outcomes_direction_check;
ALTER TABLE signal_outcomes
  ADD CONSTRAINT signal_outcomes_direction_check
  CHECK (direction IN ('long', 'short', 'skip'));

-- 5. Indexes for dedup lookup + race protection.
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_setup_hash_recent
  ON signal_outcomes (setup_hash, broadcast_at DESC)
  WHERE status IN ('open', 'closed');

-- Note: race protection lives at the application layer (signalDedup.ts SELECT-then-INSERT
--   inside signalCron's single-process loop). A unique partial index on
--   (setup_hash, date_trunc('hour', broadcast_at)) was attempted but PG rejects
--   date_trunc(text, timestamptz) as STABLE-not-IMMUTABLE in an index expression.
--   Single-instance Render free-plan makes the race window narrow enough that the
--   regular index above plus 6h SELECT lookup is sufficient.

-- 6. Backfill: 8 legacy rows on 2026-05-03 / 2026-05-06 are mislabeled.
--    BTC LONG signals had TP < entry → simulator instantly fired `c.high >= tp2`
--    on the first candle and recorded hit='tp2' with pnl_r_net ~ -2R. Flip the
--    misleading label to 'sl' so v_signal_performance_30d reads them correctly.
--    Conservative threshold (-0.5R) avoids touching legitimate small-loss tp1 hits.
UPDATE signal_outcomes
SET hit = 'sl'
WHERE status = 'closed'
  AND hit IN ('tp1', 'tp2')
  AND pnl_r_net < -0.5
  AND broadcast_at < '2026-05-09'::timestamptz;

-- 7. Honest performance view (rolling 30 days).
--    Why: profit factor and expectancy are the metrics that survive overfitting.
--    Win rate alone hid -9R loss behind 87.5% wr because the `hit` label was wrong.
CREATE OR REPLACE VIEW v_signal_performance_30d AS
SELECT
  count(*) FILTER (WHERE status IN ('open', 'closed')) AS broadcast_count,
  count(*) FILTER (WHERE status = 'closed') AS total_closed,
  count(*) FILTER (WHERE status = 'closed' AND pnl_r_net > 0) AS true_wins,
  count(*) FILTER (WHERE status = 'closed' AND pnl_r_net <= 0) AS true_losses,
  count(*) FILTER (WHERE status = 'skipped') AS skipped,
  count(*) FILTER (WHERE status = 'deduped') AS deduped,
  count(*) FILTER (WHERE status = 'invalid') AS invalid,
  ROUND(avg(pnl_r_net) FILTER (WHERE status = 'closed')::numeric, 3) AS expectancy_r,
  ROUND(
    (sum(pnl_r_net) FILTER (WHERE status = 'closed' AND pnl_r_net > 0) /
     NULLIF(abs(sum(pnl_r_net) FILTER (WHERE status = 'closed' AND pnl_r_net < 0)), 0))::numeric,
    3
  ) AS profit_factor,
  ROUND(
    (count(*) FILTER (WHERE status = 'closed' AND pnl_r_net > 0)::float
     / NULLIF(count(*) FILTER (WHERE status = 'closed'), 0))::numeric,
    3
  ) AS win_rate_honest,
  ROUND(sum(pnl_r_net) FILTER (WHERE status = 'closed')::numeric, 2) AS total_pnl_r,
  MIN(broadcast_at) FILTER (WHERE status IN ('open', 'closed')) AS first_broadcast,
  MAX(broadcast_at) FILTER (WHERE status IN ('open', 'closed')) AS last_broadcast
FROM signal_outcomes
WHERE created_at >= now() - interval '30 days';

GRANT SELECT ON v_signal_performance_30d TO service_role;
