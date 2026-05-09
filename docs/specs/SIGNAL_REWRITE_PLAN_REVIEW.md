# SIGNAL_REWRITE_PLAN — Self-Review

_Created: 2026-05-09_
_Reviewer: same author as the plan, deliberately adversarial_

## Method

Re-read the plan as if I were a senior engineer skeptical of every claim. Ask: where does this break, what's missing, what's over-engineered, what's untestable?

## Gaps / corrections

### R1. G6 double-counts R:R against G2

The plan's G6 confluence has 5 components, the 5th being `rr1 ≥ 1.5`. But G2 already rejects `rr1 < 1.0` and `rr2 < 1.5` *before* G6 runs. So in G6's universe, rr1 is always ≥ 1.0; the `rr1 ≥ 1.5` flag is partial overlap with G2.

**Correction**: G6 components become 4 binary flags + 1 "rr1 ≥ 1.5 bonus" so the floor of "≥3/5" still admits rr1<1.5 setups *if* trend, structure, momentum, and volume all confirm. Or: drop the rr1 component, lower floor to ≥3/4. Decision: drop the rr1 component → 4 components, floor ≥3/4. Simpler and orthogonal to G2.

### R2. Closed-candle (G8) is not really a gate

It's a TA computation policy. Plans treat it as a runtime gate but the only thing the validator can check is "does the input klines array end with the in-progress candle?" — which it can't easily detect post-hoc.

**Correction**: G8 is enforced in `signalEngine` (drop the last candle of every TF before computing TAs). Validator drops G8 from the gate list (8 gates, not 9). `eventCalendar` etc. unchanged.

### R3. Dedup hash bucket size 0.5% may collapse legitimate distinct setups in volatile alts

For SOL at $80, 0.5% = $0.40. For SOL at $200, 0.5% = $1.00. In fast-moving alts, 0.5% can be one candle's range → distinct setups hash-collide.

**Correction**: bucket entry to **0.25%** (50 → 25 bps in `roundToBps`). 0.25% is one ATR-noise unit on majors. Document the 6h window as the primary dedup mechanism, hash as the precision tool. Add env var `SIGNAL_DEDUP_BUCKET_BPS` default 25.

### R4. Race condition on dedup is documented but undefended

Plan says "single-process so race doesn't happen". True today, but Render restart during signalCron tick can cause: tick A inserts → tick A crashes mid-broadcast → restart → tick B re-runs same window → could re-broadcast.

**Correction**: Add unique partial index in migration:
```sql
CREATE UNIQUE INDEX uniq_setup_hash_within_dedup_window
  ON signal_outcomes (setup_hash, date_trunc('hour', broadcast_at))
  WHERE status IN ('open','closed');
```
This catches concurrent and restart-overlap inserts. Catch the unique-violation in signalDedup → treat as duplicate → skip. Cheap insurance.

### R5. Backtest acceptance gates assume PF ≥ 1.2 is achievable; no baseline

If the *current* engine on the same 90 days has PF=0.5, jumping to 1.2 in one rewrite is ambitious. Need a baseline number first.

**Correction**: Implementation step 1 is "run current engine over 90d backtest, save baseline metrics". That number becomes the floor we must beat. Acceptance gates remain industry-standard (PF≥1.2, expectancy≥0.2R) but if baseline is 0.4 we KNOW the rewrite needs heavy tuning, not just gates.

### R6. Frequency check `[0.5, 8]/day` not symbol-aware

Across 4 symbols × ~17 ticks/day each = 70 candidate signals/day. If 5% pass, 3.5/day across all symbols. But we publish per symbol — 0.5/day per symbol is once every 2 days for SOL. Acceptable? Probably yes for swing trades, less so for daily traders.

**Correction**: Acceptance gate becomes `total_signals/day ∈ [1, 12]` (less prescriptive) and per-symbol `[0.1, 4]/day`. Tighter ranges are tunable.

### R7. Score tier rebalancing not specified

D8 says `confidence='high'` never fires. Plan doesn't say what new tiers look like.

**Correction**: With G6 as hard gate (≥3/4), the score system becomes informational. `confidence` derives from G6 score alone:
- G6=4/4 → high
- G6=3/4 → medium
- (≤2 already rejected)
This makes confidence meaningful again. Leverage tier follows confidence as today.

### R8. XRP not in env default but in SUPPORTED_SYMBOLS

Plan doesn't address.

**Correction**: env default flips to `'btcusdt,ethusdt,solusdt,xrpusdt'`. Backtest must include XRP for 90d. If XRP fails per-symbol gate (e.g., signals/day < 0.1), drop from production list, keep in backtest as control.

### R9. Boot tick gate spec missing

Plan says "gate boot tick by DB last_broadcast" but no spec.

**Correction**: At `signalCron.start()`:
```ts
const { data } = await supabase.from('signal_outcomes')
  .select('broadcast_at').order('broadcast_at', { ascending: false }).limit(1);
const lastTs = data?.[0]?.broadcast_at ? new Date(data[0].broadcast_at).getTime() : 0;
if (Date.now() - lastTs < 30 * 60_000) {
  console.log('[signalCron] skipping boot tick (recent broadcast within 30min)');
  this.scheduleNext();
  return;
}
void this.tick().finally(() => this.scheduleNext());
```

### R10. Funding rate dependency may not exist on Binance.US

Binance.US does not have perpetual futures → no funding rate endpoint. The plan's G9-funding component is moot for our data source.

**Correction**: Drop funding from G9. Macro suppression remains: FOMC, CPI, BTC.D > 65, weekend window. Document funding-rate as out-of-scope for Binance.US data.

### R11. Honest /stats query not specced

Plan mentions `/stats` admin command but no SQL.

**Correction**: Specify two views:
```sql
-- View: honest performance over rolling N days
CREATE OR REPLACE VIEW v_signal_performance_30d AS
SELECT
  count(*) FILTER (WHERE status = 'closed') AS total_closed,
  count(*) FILTER (WHERE pnl_r_net > 0) AS true_wins,
  count(*) FILTER (WHERE pnl_r_net <= 0) AS true_losses,
  count(*) FILTER (WHERE status = 'skipped') AS skipped,
  count(*) FILTER (WHERE status = 'deduped') AS deduped,
  count(*) FILTER (WHERE status = 'invalid') AS invalid,
  ROUND(avg(pnl_r_net) FILTER (WHERE status='closed')::numeric, 3) AS expectancy_r,
  ROUND(
    (sum(pnl_r_net) FILTER (WHERE pnl_r_net > 0) /
     NULLIF(abs(sum(pnl_r_net) FILTER (WHERE pnl_r_net < 0)), 0))::numeric,
    3
  ) AS profit_factor,
  ROUND(
    (count(*) FILTER (WHERE pnl_r_net > 0)::float
     / NULLIF(count(*) FILTER (WHERE status='closed'), 0))::numeric,
    3
  ) AS win_rate_honest
FROM signal_outcomes
WHERE broadcast_at >= now() - interval '30 days';
```
`/stats` queries this view. Public-facing (community channel /performance command) reads same view but only emits PF, expectancy, win-rate-honest — no skipped/invalid counts.

### R12. Migration backwards-compat for legacy rows

Existing 8 rows in `signal_outcomes` will have `setup_hash=NULL`. Dedup query already handles NULL via `.in('status', ['open','closed'])` → NULL hashes don't dedup, but they also don't compare against. Acceptable. New view treats them as legacy data.

### R13. Validator should also catch null S/R from new ta.ts

After R1 fix in `findNearestSupportResistance` (returns null in breakout territory), `signalEngine` must handle null. If TP1 source is null, the signal is automatically `direction=skip` with rationale "no overhead resistance — breakout territory, defer".

**Correction**: Add to signalEngine TP/SL block: if `keyLevels.nearestResistance == null` for long → skip with rationale. Same for support on short. Validator never sees the candidate (skip happens earlier).

### R14. Backtest fee deduction must equal live fee deduction

Plan says `FEE_R_DEDUCTION=0.13` is reused. But backtest currently uses `simulateTrade` which returns gross R. `signalOutcome.closeOutcome` subtracts fees, but backtest's `computeStatistics` may not.

**Correction**: Backtest harness must apply `FEE_R_DEDUCTION` to every simulated outcome before computing stats. Verified in implementation phase by spot-check: a known-loss signal must show pnlR ≈ -1.13 not -1.0.

### R15. Plan doesn't enumerate test cases

Plan says "27 tests minimum" without listing them.

**Correction**: Test matrix appended below.

### R16. No regression test for the original buggy BTC signal

A new test should reproduce the exact 5/06 BTC signal (entry $81,401, swingHigh $79,143) and assert validator rejects via G1.

**Correction**: New test: `signalValidator.test.ts > G1 > rejects BTC long where TP < entry (regression: 2026-05-06 incident)`.

### R17. Plan doesn't address /signal_now bypassing dedup

Admin can force-tick → goes through full pipeline including dedup → can be blocked even when admin wants to test.

**Correction**: `forceTick()` accepts `bypassDedup?: boolean` parameter. /signal_now wires `bypassDedup=true` so admins can always test. Validator gates (G1..G7) still enforced — we never let an invalid signal through, even for admin.

### R18. Sentry integration for validator failures

Currently signalCron logs errors but validator failure ≠ error → silently absorbed. Need observability.

**Correction**: Validator failures by gate are logged via console + Sentry **breadcrumb** (not exception). Spike in G6 rejection rate over a 24h window → Sentry custom alert. Out of scope for first pass; document as future.

### R19. Plan doesn't specify what to do with the 8 buggy historical rows

Existing rows have `hit='tp2'` but pnl_r_net negative. They distort any view-based metric.

**Correction**: Migration includes a one-time backfill:
```sql
UPDATE signal_outcomes
SET hit = CASE
  WHEN status='closed' AND pnl_r_net <= -0.5 AND hit IN ('tp1','tp2') THEN 'sl'
  WHEN status='closed' AND pnl_r_net > 0 AND hit = 'sl' THEN 'tp1'
  ELSE hit
END
WHERE status = 'closed' AND broadcast_at < '2026-05-09';
```
Documented as cleanup of pre-fix mislabeled outcomes. Not destructive — only flips clearly-wrong labels.

### R20. Cost limit risk

Plan calls for ~13 file changes + DB migration + new tests. Backtest iteration loop may take many runs. Could exceed CLAUDE.md §4 single-task limits.

**Correction**: Treat as **multi-chunk task** explicitly:
- Chunk A: code + migration + unit tests + dedup view (10 files)
- Chunk B: backtest iteration (no file changes after acceptance)
- Chunk C: shadow live + monitoring (no code changes, env toggle only)
Each chunk reports back; user can stop between chunks.

---

## Updated test matrix (R15)

### `signalValidator.test.ts`

**G1 — TP direction (5)**
1. long with tp1 = entry × 1.001 → fail (boundary)
2. long with tp1 = entry × 1.0011 → pass
3. long with tp1 < entry → fail (regression: BTC 2026-05-06)
4. short with tp1 > entry → fail
5. short with tp1 = entry × 0.999 → fail

**G2 — R:R floor (4)**
1. long rr1 = 0.99 → fail
2. long rr1 = 1.0 → pass G2 (boundary)
3. long rr2 = 1.49 → fail
4. short rr2 = 1.5 → pass

**G3 — SL outside noise (3)**
1. slDist = 0.74 × ATR → fail
2. slDist = 0.75 × ATR → pass (boundary)
3. ATR = 0 (degenerate) → pass with warning (don't block on missing ATR)

**G4 — TP not absurd (3)**
1. tp1 = 10.1 × ATR away → fail
2. tp1 = 10 × ATR → pass
3. tp2 = 12.5 × ATR away → fail

**G6 — MTF confluence (5)**
1. all 4 confirm → pass with score 4
2. 3 confirm → pass with score 3
3. 2 confirm → fail
4. mixed (d1 disagrees) → score reduces appropriately
5. all neutral → fail

**G7 — divergence-vs-direction (4)**
1. long with bearish div h1 → fail
2. long with bearish div h4 → fail
3. long with no div → pass
4. short with bullish div h1 → fail

**G9 — macro suppression (5)**
1. now within FOMC ±2h → fail
2. now after CPI +2h → pass
3. BTC.D = 65.1 → fail
4. weekend Saturday → fail
5. neutral macro → pass

**Integration tests (3)**
1. Real BTC 5/06 setup → validator returns first failure G1
2. Synthetic clean LONG, all gates pass → validator returns ok
3. Synthetic clean SHORT with G3 fail → first failure G3, downstream gates not run

### `signalDedup.test.ts`

1. First signal of hash → not duplicate
2. Same hash within 6h → duplicate
3. Same hash 6h+1min later → not duplicate
4. Same symbol/direction, entry 0.3% apart, default 25bps bucket → DIFFERENT hash (not dup)
5. Same symbol/direction, entry 0.1% apart → SAME hash (dup)
6. Skipped row should not block new signal (skipped status excluded from dedup)

### Backtest regression
1. Run new engine on 90d historical → all 8 acceptance gates pass

---

## Verdict

Plan is sound after R1–R20 corrections. Net effect:
- 8 gates (not 9: G8 is not a runtime gate)
- 4 confluence components (not 5)
- 25bps bucket (not 50)
- Unique partial index for race protection
- Funding rate dropped from G9 (Binance.US has no perp data)
- Backfill SQL for 8 historical mislabeled rows
- Multi-chunk rollout to stay under CLAUDE.md §4 cost ceiling

Updated plan compiled into `SIGNAL_REWRITE_PLAN.md` v2 (next step).
