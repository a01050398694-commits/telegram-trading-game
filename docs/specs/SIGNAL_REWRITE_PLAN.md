# Signal Pipeline Rewrite Plan

_Created: 2026-05-09_
_Status: DRAFT — pending CEO approval_

## 0. TL;DR

Current signal pipeline ships LONG signals where TP is **below** entry (5 of 8 broadcast on 2026-05-03~06), spam-fires the same setup 5× in 2 hours, and reports a fake 87.5% win rate while losing **-8.97R over 4 days**. Root causes are concrete and fixable.

This plan rewrites the validation, dedup, scoring, and metrics layers — not the TA library, not the cron framework. Backtest 90 days; deploy only when **profit factor ≥ 1.2, expectancy ≥ +0.2R, max drawdown ≤ 30%, win-rate honest** (= measured by `pnl_r_net > 0`, not by the broken `hit` label).

Acceptance gate is mechanical: backtest output must satisfy all 4 thresholds before live re-enablement.

---

## 1. Defect Catalog (21 items, severity-ranked)

### Tier 0 — FATAL (directly causes -EV)

| # | File:Line | Defect | Evidence |
|---|---|---|---|
| D1 | `bot/src/lib/ta.ts:447-450` | `findNearestSupportResistance` fallback returns the most-recent swing high as "resistance" even when current price is **above** all swings. Direct cause of TP < entry on LONG. | `long_with_tp_below_entry = 5` (DB query) |
| D2 | `bot/src/services/signalEngine.ts:318-322` | R:R gate uses `Math.abs(tp - entry)` so wrong-direction TP passes the gate (rrTp1 always positive). | All 5 buggy signals had rrTp1=2.0+ recorded |
| D3 | `bot/src/services/tradeSimulator.ts:55,64` | Simulator labels "tp2 hit" on first candle when `c.high >= signal.tp2` even if tp2 < entry. PnlR computed correctly negative, but `hit` field becomes "tp2" → distorts metrics. | 5 records show `hit='tp2'` with `pnl_r_net=-2.0` |
| D4 | `bot/src/cron/signalCron.ts:219` | No final sanity gate before broadcast (no check that SL < entry < TP1 < TP2 for long). | 5 broken signals reached the channel |

### Tier 1 — Severe (spam, distorted metrics)

| # | File:Line | Defect |
|---|---|---|
| D5 | `signalCron.ts:63-64` | `COOLDOWN_MS = 0`, `SKIP_COOLDOWN_MS = 0`. No protection against repeat-fire. |
| D6 | `signalCron.ts:128` | Boot tick fires immediately. Render restart → instant re-fire of identical setup. |
| D7 | (architecture) | No deterministic signal hash dedup. Same (symbol, direction, swingHigh/Low, TP) fired 5× in 2h22m. |
| D8 | `signalEngine.ts:247` | `confidence='high'` requires score ≥ 65 (out of theoretical 100, requires 6/6 layers). Real-world: 0/8 high-confidence signals → tier collapses to medium-only. |
| D9 | `signalOutcome.ts:37` | Skip signals not persisted. 96% of ticks have no audit trail. Cannot distinguish "healthy filtering" from "cron dead". |

### Tier 2 — Correctness drift

| # | File:Line | Defect |
|---|---|---|
| D10 | `signalEngine.ts:131-141` | D1 trend disagreement contributes only 1/4 alignment vote, no multiplicative penalty. 7/8 signals had `d1:bearish` while still firing LONG. For 48h timeout horizon, D1 should weight most. |
| D11 | `signalEngine.ts:194-198` | Bearish divergence opposite to direction → 0 points awarded but **no penalty**. Should be hard skip or -10 penalty. |
| D12 | `signalEngine.ts:107-129` | SMA50/200 windows are TF-relative, not time-equalized. m15 SMA200 = 50h ago; d1 SMA200 = 200d ago. Treated as equal votes. |
| D13 | `signalEngine.ts:200-209` | Volume confirmation only awards points; `weak`/`none` never blocks. |
| D14 | `signalEngine.ts:281` | `stopLoss = recentSwingLow * 0.997`. If `recentSwingLow` falls back to `Math.min(...lows)` (extreme), SL can be far from entry. ATR cap on line 310 mitigates but logic is fragile. |
| D15 | `signalEngine.ts:201` | Volume only checked on h1. m15 momentum + h4 trend + h1 volume + d1 trend would be the standard pro stack. |
| D16 | `marketRegime.ts:27-31` | Regime thresholds too narrow (BTC.D > 60 rare). Most ticks fall to 'neutral' → no filter applied. |

### Tier 3 — Operational visibility

| # | File:Line | Defect |
|---|---|---|
| D17 | `signalOutcome.ts:23` | `insertFailureCount` in-memory only. Lost on restart → /stats can't surface tracking gaps. |
| D18 | (architecture) | No `/stats` command exposing **honest** win rate (filtered by `pnl_r_net > 0` AND `hit IN ('tp1','tp2')` AND `tp1 > entry`). Public-facing metric is the broken `hit` label. |
| D19 | (architecture) | No event-calendar suppression (FOMC, CPI). Industry standard. |

### Tier 4 — Cosmetic / future

| # | File:Line | Defect |
|---|---|---|
| D20 | `signalCron.ts:42` | Random style/mood per tick. Aesthetics, not core. |
| D21 | (architecture) | No "valid for X hours" signal expiry stored in DB. tradePlan.ts mentions "30min trigger" but it's text only. |

---

## 2. Industry Standards Adopted (from research)

### Hard gates (any failure → skip + log reason)

| ID | Rule | Source |
|---|---|---|
| G1 | TP1 > entry × (1 + 0.001) for long; TP1 < entry × (1 - 0.001) for short | Cornix |
| G2 | Signed R:R: `(tp1-entry)/(entry-sl) ≥ 1.0` long, `(entry-tp1)/(sl-entry) ≥ 1.0` short. tp2 ≥ 1.5R. | Industry consensus |
| G3 | `\|entry - sl\| ≥ 0.75 × ATR(14, 1h)` — SL outside noise | Pro convention |
| G4 | `\|tp - entry\| ≤ 10 × ATR(14, 1h)` — TP not absurd | Pro convention |
| G5 | Setup hash = `H(symbol \| direction \| round(entry, 0.5%) \| round(tp1, 0.5%))` — block if same hash fired in last 6 hours | Cornix dedup |
| G6 | MTF confluence ≥ 3/5: D1 trend + H4 trend + H1 setup + entry above SMA20(5m) + R:R ≥ 1.5 | Signal Pilot |
| G7 | Bearish divergence on H1 or H4 + LONG → skip (and vice versa) | Standard TA |
| G8 | Closed-candle-only TA: drop the in-progress current candle before computing indicators | Freqtrade |
| G9 | Macro suppression: skip during FOMC ±2h/4h, CPI ±1h/2h, BTC.D > 65%, weekend window (Fri 22:00 UTC – Sun 16:00 UTC), funding > 0.15% | Binance/Amberdata |

### Quality metrics published

| Metric | Definition | Acceptance gate |
|---|---|---|
| Win rate (honest) | `count(pnl_r_net > 0) / count(closed)` | 40–55% (>70% = overfitting flag) |
| Profit factor | `sum(pnl_r_net where >0) / abs(sum(pnl_r_net where <0))` | ≥ 1.2 (deploy gate), ≥ 1.4 (proud) |
| Expectancy | `avg(pnl_r_net) over closed` | ≥ 0.2R (deploy gate), ≥ 0.4R (proud) |
| Max drawdown | worst peak-to-trough cumulative R | ≤ 30% (deploy gate) |
| Calmar | `annualized_return / max_drawdown` | ≥ 1.5 |
| Sortino | downside-deviation Sharpe variant | ≥ 1.5 |
| Longest losing streak | consecutive losses | ≤ 7 |

### Fee/slippage model (already in code as `FEE_R_DEDUCTION = 0.13`)

Keep. Validated against Binance taker 0.04% × 2 + 0.05% slippage × 2 = 0.18%, normalized to flat 0.13R for typical 1.5% SL distance.

---

## 3. New Architecture

```
                       ┌───────────────────────────┐
                       │     signalCron.tick()     │
                       └──────────────┬────────────┘
                                      ▼
                       ┌───────────────────────────┐
                       │   buildSignalCandidate    │  (TA + scoring)
                       │   - returns Candidate     │
                       └──────────────┬────────────┘
                                      ▼
                       ┌───────────────────────────┐
                       │     validateSignal        │  (NEW — gate engine)
                       │     runs G1..G9 in order  │
                       │     short-circuits on     │
                       │     first fail, returns   │
                       │     ValidationResult      │
                       └──────────────┬────────────┘
                                      ▼
                  pass?  ──no──▶  store as 'skipped' + reason
                   │
                   ▼ yes
                       ┌───────────────────────────┐
                       │     dedupCheck (G5)       │
                       │     6h hash window in DB  │
                       └──────────────┬────────────┘
                                      ▼
                  dup?   ──yes──▶ store as 'deduped' + hash
                   │
                   ▼ no
                       ┌───────────────────────────┐
                       │     formatTradePlan       │
                       │     bot.api.sendMessage   │
                       │     trackSignalOutcome    │
                       └───────────────────────────┘
```

### File changes (all under bot/src — no other workspaces touched)

| File | Action | Why |
|---|---|---|
| `bot/src/services/signalValidator.ts` | **NEW** | All 9 gates, pure functions, exhaustive unit tests |
| `bot/src/services/signalDedup.ts` | **NEW** | DB-backed setup-hash + 6h cooldown |
| `bot/src/lib/ta.ts` | MODIFY | `findNearestSupportResistance` returns `null` when no resistance/support exists; signalEngine handles null |
| `bot/src/services/signalEngine.ts` | MODIFY | Use signed R:R; treat null S/R; penalize divergence-vs-direction; fix d1 weighting; expose Candidate (pre-validation) and Signal (post-validation) types |
| `bot/src/services/tradeSimulator.ts` | MODIFY | Defense-in-depth: assert `tp1 > entry` (long) at top; throw if violated (caught upstream → marked invalid) |
| `bot/src/services/signalOutcome.ts` | MODIFY | Persist skipped/deduped/invalid as rows with `status` enum |
| `bot/src/cron/signalCron.ts` | MODIFY | Restore `COOLDOWN_MS=60min`, `SKIP_COOLDOWN_MS=15min`; gate boot tick by DB last_broadcast; wire validator + dedup |
| `supabase/migrations/15_signal_outcomes_status_expand.sql` | **NEW** | Add `status IN ('open','closed','skipped','deduped','invalid')`, `setup_hash`, `validation_failed_gate`, `dedup_window_hours` |
| `bot/scripts/backtest.ts` | MODIFY | Run new validator; emit 7 quality metrics; output JSON + Markdown summary |
| `bot/src/services/eventCalendar.ts` | **NEW** | FOMC/CPI hard-coded calendar (2026 dates) — small, manual, easy |
| `bot/src/services/macroBundle.ts` | MODIFY | Add `fundingRate` and `weekendWindow` to FullMacroSnapshot |
| `bot/src/__tests__/signalValidator.test.ts` | **NEW** | 9 gates × 3 cases each = ~27 tests minimum |
| `bot/src/__tests__/signalDedup.test.ts` | **NEW** | hash + window + race conditions |

### DB schema migration

```sql
-- 15_signal_outcomes_status_expand.sql
ALTER TABLE signal_outcomes
  ADD COLUMN setup_hash text,
  ADD COLUMN validation_failed_gate text,
  ADD COLUMN dedup_window_hours numeric;

ALTER TABLE signal_outcomes
  DROP CONSTRAINT IF EXISTS signal_outcomes_status_check;

ALTER TABLE signal_outcomes
  ADD CONSTRAINT signal_outcomes_status_check
  CHECK (status IN ('open','closed','skipped','deduped','invalid'));

CREATE INDEX idx_signal_outcomes_setup_hash_recent
  ON signal_outcomes (setup_hash, broadcast_at DESC)
  WHERE status IN ('open','closed');
```

`hit` field stays nullable; new rows for skipped/deduped/invalid have `hit=null` and `pnl_r_net=null`.

---

## 4. Validator Specification

```ts
// bot/src/services/signalValidator.ts (sketch)

export type GateId = 'G1_TP_DIRECTION' | 'G2_RR_FLOOR' | 'G3_SL_NOISE'
                   | 'G4_TP_CEILING' | 'G6_MTF_CONFLUENCE' | 'G7_DIVERGENCE'
                   | 'G8_CLOSED_CANDLE' | 'G9_MACRO_SUPPRESSED';

export interface ValidationFailure {
  gate: GateId;
  reason: string;
  detail: Record<string, number | string>;
}

export interface ValidationResult {
  ok: boolean;
  failures: ValidationFailure[]; // ordered, first failure short-circuits
}

export function validateSignal(
  candidate: SignalCandidate,
  ctx: { atr1h: number; macro: FullMacroSnapshot | null; now: number }
): ValidationResult {
  // G1, G2, G3, G4, G6, G7, G8, G9 in order.
  // G5 (dedup) handled by signalDedup.ts because it needs DB.
}
```

### G1..G9 specifications (TS pseudo)

**G1 — TP direction**
```ts
const tpFloor = direction === 'long' ? entry * 1.001 : entry * 0.999;
if (direction === 'long'  && tp1 <= tpFloor) fail('G1', 'tp1 below entry on long');
if (direction === 'short' && tp1 >= tpFloor) fail('G1', 'tp1 above entry on short');
```

**G2 — R:R floor (signed)**
```ts
const slDist = direction === 'long' ? entry - sl : sl - entry;
const rr1 = direction === 'long' ? (tp1 - entry) / slDist : (entry - tp1) / slDist;
if (rr1 < 1.0) fail('G2', `rr1=${rr1.toFixed(2)} < 1.0`);
const rr2 = direction === 'long' ? (tp2 - entry) / slDist : (entry - tp2) / slDist;
if (rr2 < 1.5) fail('G2', `rr2=${rr2.toFixed(2)} < 1.5`);
```

**G3 — SL outside noise**
```ts
const slDist = Math.abs(entry - sl);
if (slDist < 0.75 * atr1h) fail('G3', 'SL inside noise floor');
```

**G4 — TP not absurd**
```ts
if (Math.abs(tp1 - entry) > 10 * atr1h) fail('G4', 'TP1 > 10 ATR away');
if (Math.abs(tp2 - entry) > 12 * atr1h) fail('G4', 'TP2 > 12 ATR away');
```

**G6 — MTF confluence (5 components, need ≥3)**
```ts
let score = 0;
if (tfD1.trend === intent) score++;        // daily trend
if (tfH4.trend === intent) score++;        // 4h trend
if (tfH1.macdAgree === intent) score++;    // 1h momentum
if (volumeConfirm === 'confirmed') score++;
if (rr1 >= 1.5) score++;
if (score < 3) fail('G6', `MTF score ${score}/5`);
```

**G7 — divergence-vs-direction**
```ts
if (intent === 'long'  && (divH1.bearish || divH4.bearish)) fail('G7','bearish div on long');
if (intent === 'short' && (divH1.bullish || divH4.bullish)) fail('G7','bullish div on short');
```

**G8 — closed-candle**
```ts
// signalEngine fix: drop the trailing in-progress candle from each TF before computing TAs.
// Asserted at validator level: ATR/RSI/MACD must be computed from len-1 array.
// Implementation in signalEngine, validator only spot-checks.
```

**G9 — macro suppression**
```ts
if (eventCalendar.isWithinFOMC(now, 2*3600_000, 4*3600_000)) fail('G9', 'FOMC ±2h/4h');
if (eventCalendar.isWithinCPI(now, 1*3600_000, 2*3600_000))  fail('G9', 'CPI ±1h/2h');
if (macro?.global?.btcDominance > 65) fail('G9', 'BTC.D > 65');
if (isWeekendWindow(now)) fail('G9', 'weekend low-liquidity');
if (Math.abs(macro?.fundingRate ?? 0) > 0.15) fail('G9', 'funding extreme');
```

---

## 5. Dedup Specification

```ts
// signalDedup.ts
function setupHash(s: SignalCandidate): string {
  const entryBucket = roundToBps(s.entry, 50); // 0.5%
  const tp1Bucket = roundToBps(s.tp1, 50);
  return `${s.symbol}|${s.direction}|${entryBucket}|${tp1Bucket}`;
}

async function isDuplicate(hash: string, withinHours = 6): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinHours * 3600_000).toISOString();
  const { count } = await supabase
    .from('signal_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('setup_hash', hash)
    .gte('broadcast_at', cutoff)
    .in('status', ['open','closed']);
  return (count ?? 0) > 0;
}
```

---

## 6. Backtest Acceptance Gates (mechanical)

```
RUN: npm run backtest -w bot
INPUT: 90 days BTC/ETH/SOL/XRP, m5 + m15 + h1 + h4 + d1
OUTPUT: scripts/backtest-results/backtest-{ts}.json + .md

ACCEPTANCE (all must hold):
  win_rate_honest    in [0.40, 0.65]   # >0.65 = overfit flag, halt
  profit_factor      >= 1.2
  expectancy_R       >= 0.2
  max_drawdown_R     <= 30 (in absolute R units, since equity is unit R)
  longest_loss_streak<= 7
  signals_per_day    in [0.5, 8]       # not too sparse, not spam
  rejection_rate_G1  == 0              # G1 should never fail post-fix
  rejection_rate_G7  >= 0.05           # divergence guard exercises
```

Failure → loop back to scoring tweaks, re-backtest. No live deploy until all 8 gates pass.

---

## 7. Rollout Plan

| Phase | Gate | Action |
|---|---|---|
| P1 | code complete | typecheck + 100% existing tests + new validator/dedup tests pass |
| P2 | backtest pass | all 8 acceptance gates pass on 90d data; results committed to repo |
| P3 | shadow live | DRY_RUN=true on Render for 24h. Compare DB rows (status='skipped'/'invalid'/'open') against backtest expectations |
| P4 | live ON | DRY_RUN=false; first 7 days closely monitored, daily report compares realized R vs expected R |
| P5 | weekly /stats | new `/stats` admin command shows honest 7-metric snapshot |

---

## 8. Risks / Open Questions

| Risk | Mitigation |
|---|---|
| FOMC/CPI calendar hardcoded → goes stale | Calendar in `eventCalendar.ts` with explicit "valid through 2026-12-31"; quarterly review reminder in PROGRESS |
| Funding rate API not in current macroBundle | Add Binance.US `/v1/premiumIndex` if available, else use Binance.com proxy via FRED-style fallback. If unavailable, gate G9-funding becomes no-op (logged warning, not fatal) |
| Backtest of 90d may not span enough regimes | Run 3 sub-backtests: bull (Q1 2026), chop (Apr 2026), recent (May 2026). All 3 must pass deploy gates individually OR weighted aggregate |
| Honest win rate may collapse from 87% to 35% | Acceptable if PF > 1.2 and expectancy > 0.2R. Reframe `/stats` to lead with PF and expectancy, win rate secondary |
| Dedup window 6h may be too tight in trending markets | Tunable env var `SIGNAL_DEDUP_WINDOW_HOURS` default 6 |
| New validator may reject 95% of signals → too quiet | Backtest reveals this. Tune G6 score floor (3/5 → 2/5) or G2 R:R floor. Documented in iteration log |

---

## 9. Out of Scope (future stages)

- AI commentary mode rewrite (currently `SIGNAL_AI_COMMENTARY=false`, untouched)
- Webapp signal display
- VIP-only signal tier
- User-configurable risk profile per signal
- Position-size suggestion (current is leverage only)

---

## 10. File Diff Estimate

| Tier | Files | New | Modified |
|---|---|---|---|
| New code | signalValidator.ts, signalDedup.ts, eventCalendar.ts | 3 | 0 |
| Modified | signalEngine.ts, tradeSimulator.ts, signalOutcome.ts, signalCron.ts, ta.ts, macroBundle.ts, backtest.ts | 0 | 7 |
| Tests | signalValidator.test.ts, signalDedup.test.ts | 2 | 0 |
| Migration | 15_signal_outcomes_status_expand.sql | 1 | 0 |
| **Total** | | **6 new** | **7 modified** |

Within CLAUDE.md §4 limit (≤ 20 files).

---

## 11. Backtest Iteration Log Template (per attempt)

```
## Iteration N — {timestamp}
- Knobs changed: G6 floor 3→2, G2 rr2 1.5→1.3
- Result:
  - signals: 142
  - win_rate_honest: 47.2%
  - profit_factor: 1.18  ❌ < 1.2
  - expectancy_R: 0.19R ❌ < 0.2
  - max_dd_R: 22R ✅
- Verdict: FAIL on PF + expectancy. Hypothesis: G6 too loose, scaling back to 3/5.
- Next: revert G6 → 3/5, raise G2 rr1 1.0→1.1, re-run.
```
