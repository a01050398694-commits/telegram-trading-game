-- Stage 22.1 — drawdown brake unblock.
-- Why: 5 BTC LONG signals broadcast on 2026-05-06 had TP < entry (Stage 21 root-cause
--   bug — findNearestSupportResistance fabricated a level on the wrong side of price
--   in clean-breakout territory). Simulator fired SL within minutes; pnl_r_net ~ -2R
--   each. Migration 15 retroactively flipped their `hit` label from tp1/tp2 to 'sl'
--   but kept status='closed'. Result: drawdownBrake.reconcileFromDB() always sees
--   5 consecutive losses in the top-5 closed rows → 4h cooldown re-extended on every
--   reconcile → infinite block. Stage 22.1 hotfix bumped MTF_FETCH_LIMIT and the
--   first post-deploy tick on 2026-05-09 16:55 confirmed the engine produces
--   alignment 3/4 again — but the brake then forced direction='skip' because of
--   these stale broken-pre-Stage-22 outcomes.
--
-- Fix: reclassify those 5 broken pre-Stage-22 signals as status='invalid'. They
--   genuinely had invalid setups (TP wrong direction); drawdownBrake.ts queries
--   only `status='closed'` so this removes them from the brake's view. The /stats
--   30-day performance view (v_signal_performance_30d) also stops counting them
--   in `total_closed`, which is the honest accounting — they were never real bets.
--   Excludes the 2026-05-03 SOL short SL (-1.13R) — that was a legitimate Stage 21
--   loss with a clean direction; it stays 'closed'.

UPDATE signal_outcomes
SET status = 'invalid', validation_failed_gate = 'G1_TP_DIRECTION_LEGACY'
WHERE status = 'closed'
  AND symbol = 'BTCUSDT'
  AND direction = 'long'
  AND broadcast_at >= '2026-05-06'::timestamptz
  AND broadcast_at < '2026-05-07'::timestamptz
  AND pnl_r_net < -1.5;
