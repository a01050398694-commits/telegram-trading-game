// Stage 22 — Signal validator: hard gates between buildSignal and broadcast.
// Why: prior pipeline shipped 5 of 8 LONG signals with TP < entry because there was no
//   final sanity check. This module is the single boundary that turns a "candidate" into
//   either an "approved" signal or a structured rejection with the failed gate name.
//
// Gates run in fixed order, short-circuit on first fail:
//   G1 — TP direction (TP1 must be on profitable side of entry)
//   G2 — Signed R:R floor (rr1 ≥ 1.0, rr2 ≥ 1.5)
//   G3 — SL outside noise floor (|entry - sl| ≥ 0.75 × ATR(14, 1h))
//   G4 — TP not absurd (|tp - entry| ≤ 10–12 × ATR(14, 1h))
//   G6 — MTF confluence (≥ 3/4 of: D1 trend, H4 trend, H1 momentum, volume confirmed)
//   G7 — Divergence opposes direction → already converted to skip in signalEngine,
//        validator double-checks for defense-in-depth
//   G9 — Macro suppression (FOMC ±2h/4h, CPI ±1h/2h, BTC.D > 65, weekend window)
//
// G5 (dedup) is in signalDedup.ts because it needs DB.
// G8 (closed-candle) is enforced in signalEngine via dropInProgress; not a runtime gate.

import type { Signal } from './signalEngine.js';
import type { FullMacroSnapshot } from './macroBundle.js';
import { isWithinFOMC, isWithinCPI, isWeekendWindow } from './eventCalendar.js';

export type GateId =
  | 'G1_TP_DIRECTION'
  | 'G2_RR_FLOOR'
  | 'G3_SL_NOISE'
  | 'G4_TP_CEILING'
  | 'G6_MTF_CONFLUENCE'
  | 'G7_DIVERGENCE'
  | 'G9_MACRO_SUPPRESSED';

export interface ValidationFailure {
  gate: GateId;
  reason: string;
}

export interface ValidationResult {
  ok: boolean;
  failure?: ValidationFailure;
}

export interface ValidationContext {
  atr1h: number | null;
  macro: FullMacroSnapshot | null;
  now: number;
}

const TP_DIR_BUFFER_PCT = 0.001; // TP must be at least 0.1% past entry
const MIN_TP1_RR = 1.0;
const MIN_TP2_RR = 1.5;
const SL_NOISE_FLOOR_ATR_MULT = 0.75;
const TP1_CEILING_ATR_MULT = 10;
const TP2_CEILING_ATR_MULT = 12;
// Stage 22 iteration log:
//   iter1 G6=3/4 → 12 entries/60d, PF 2.16, expectancy +0.44R, total +5.23R ✅
//   iter2 G6=2/4 → 81 entries/60d, PF 0.53, expectancy -0.35R, total -27.96R ❌
//   iter3 G6=3/4 (revert) — 3/4 is the right tier; the additional 69 entries
//                            iter2 admitted were mostly junk. Quality > quantity.
//   ~0.2 signals/day is professional cadence (Cornix-style services average 1-3/day
//   across multiple symbols, but only on confirmed setups).
const MIN_MTF_CONFLUENCE = 3; // out of 4 components
const BTC_DOMINANCE_SUPPRESS_THRESHOLD = 65;

function fail(gate: GateId, reason: string): ValidationResult {
  return { ok: false, failure: { gate, reason } };
}

function ok(): ValidationResult {
  return { ok: true };
}

// G1 — TP direction. Wrong-direction TP is the headline bug from 2026-05-06.
function checkG1(s: Signal): ValidationResult {
  if (s.direction === 'long') {
    const tpFloor = s.entry * (1 + TP_DIR_BUFFER_PCT);
    if (s.tp1 < tpFloor) return fail('G1_TP_DIRECTION', `tp1=${s.tp1} below entry=${s.entry} on long`);
    if (s.tp2 < tpFloor) return fail('G1_TP_DIRECTION', `tp2=${s.tp2} below entry=${s.entry} on long`);
  } else if (s.direction === 'short') {
    const tpFloor = s.entry * (1 - TP_DIR_BUFFER_PCT);
    if (s.tp1 > tpFloor) return fail('G1_TP_DIRECTION', `tp1=${s.tp1} above entry=${s.entry} on short`);
    if (s.tp2 > tpFloor) return fail('G1_TP_DIRECTION', `tp2=${s.tp2} above entry=${s.entry} on short`);
  }
  return ok();
}

// G2 — Signed R:R floor. Pre-Stage-22 used Math.abs and missed direction errors.
function checkG2(s: Signal): ValidationResult {
  const slDist = Math.abs(s.entry - s.stopLoss);
  if (slDist === 0) return fail('G2_RR_FLOOR', 'sl distance is 0');
  const rr1 = s.direction === 'long' ? (s.tp1 - s.entry) / slDist : (s.entry - s.tp1) / slDist;
  const rr2 = s.direction === 'long' ? (s.tp2 - s.entry) / slDist : (s.entry - s.tp2) / slDist;
  if (rr1 < MIN_TP1_RR) return fail('G2_RR_FLOOR', `rr1=${rr1.toFixed(2)} < ${MIN_TP1_RR}`);
  if (rr2 < MIN_TP2_RR) return fail('G2_RR_FLOOR', `rr2=${rr2.toFixed(2)} < ${MIN_TP2_RR}`);
  return ok();
}

// G3 — SL outside noise. Tight SL on a noisy ATR is just slippage donation.
function checkG3(s: Signal, atr1h: number | null): ValidationResult {
  if (atr1h === null || atr1h <= 0) return ok(); // can't verify, don't block on missing ATR
  const slDist = Math.abs(s.entry - s.stopLoss);
  const floor = SL_NOISE_FLOOR_ATR_MULT * atr1h;
  if (slDist < floor) {
    return fail('G3_SL_NOISE', `slDist=${slDist.toFixed(2)} < ${floor.toFixed(2)} (0.75*ATR)`);
  }
  return ok();
}

// G4 — TP not absurd. >10 ATR away = overfit / unrealistic target.
function checkG4(s: Signal, atr1h: number | null): ValidationResult {
  if (atr1h === null || atr1h <= 0) return ok();
  const tp1Dist = Math.abs(s.tp1 - s.entry);
  const tp2Dist = Math.abs(s.tp2 - s.entry);
  if (tp1Dist > TP1_CEILING_ATR_MULT * atr1h) {
    return fail('G4_TP_CEILING', `tp1Dist=${tp1Dist.toFixed(2)} > ${TP1_CEILING_ATR_MULT}*ATR`);
  }
  if (tp2Dist > TP2_CEILING_ATR_MULT * atr1h) {
    return fail('G4_TP_CEILING', `tp2Dist=${tp2Dist.toFixed(2)} > ${TP2_CEILING_ATR_MULT}*ATR`);
  }
  return ok();
}

// G6 — Multi-timeframe confluence: at least 3 of 4 components confirm direction.
//   Components: D1 trend, H4 trend, H1 momentum (macdAgree), volume='confirmed'.
//   Why: D1 weighted heaviest because 48h timeout horizon is essentially a swing trade.
//   Pre-Stage-22 alignment was 4 equal votes → m15 noise outvoted D1 regime.
function checkG6(s: Signal): ValidationResult {
  const intent = s.direction;
  if (intent !== 'long' && intent !== 'short') return ok();
  const wantTrend = intent === 'long' ? 'bullish' : 'bearish';
  const tf = s.multiTimeframeAlignment;
  let score = 0;
  if (tf.d1 === wantTrend) score++;
  if (tf.h4 === wantTrend) score++;
  if (tf.h1 === wantTrend) score++;
  if (s.volumeConfirmation === 'confirmed') score++;
  if (score < MIN_MTF_CONFLUENCE) {
    return fail(
      'G6_MTF_CONFLUENCE',
      `MTF score ${score}/4 (d1=${tf.d1} h4=${tf.h4} h1=${tf.h1} vol=${s.volumeConfirmation})`
    );
  }
  return ok();
}

// G7 — Divergence opposite direction. signalEngine already converts these to skip;
//   validator double-checks so a future engine refactor doesn't silently re-introduce
//   contradictory signals. Defense-in-depth.
function checkG7(s: Signal): ValidationResult {
  if (s.direction === 'long' && s.divergence.bearish) {
    return fail('G7_DIVERGENCE', 'bearish divergence on long');
  }
  if (s.direction === 'short' && s.divergence.bullish) {
    return fail('G7_DIVERGENCE', 'bullish divergence on short');
  }
  return ok();
}

// G9 — Macro suppression windows.
function checkG9(macro: FullMacroSnapshot | null, now: number): ValidationResult {
  const fomc = isWithinFOMC(now);
  if (fomc.hit) return fail('G9_MACRO_SUPPRESSED', `FOMC ±2h/4h (event ${fomc.eventDate})`);
  const cpi = isWithinCPI(now);
  if (cpi.hit) return fail('G9_MACRO_SUPPRESSED', `CPI ±1h/2h (event ${cpi.eventDate})`);
  if (isWeekendWindow(now)) {
    return fail('G9_MACRO_SUPPRESSED', 'weekend low-liquidity window (Fri 22:00 UTC – Sun 16:00 UTC)');
  }
  const btcD = macro?.global?.btcDominance ?? null;
  if (btcD !== null && btcD > BTC_DOMINANCE_SUPPRESS_THRESHOLD) {
    return fail('G9_MACRO_SUPPRESSED', `BTC.D=${btcD.toFixed(1)}% > ${BTC_DOMINANCE_SUPPRESS_THRESHOLD}% (alts decoupled)`);
  }
  return ok();
}

/**
 * Run all gates in order. Short-circuit on first failure.
 * Skip-direction signals never reach this — signalCron filters them upstream
 * because they have no entry/SL/TP to validate.
 */
export function validateSignal(s: Signal, ctx: ValidationContext): ValidationResult {
  if (s.direction === 'skip') {
    // Skips are not validated; caller already decided to skip via signalEngine.
    return ok();
  }
  let r = checkG1(s);
  if (!r.ok) return r;
  r = checkG2(s);
  if (!r.ok) return r;
  r = checkG3(s, ctx.atr1h);
  if (!r.ok) return r;
  r = checkG4(s, ctx.atr1h);
  if (!r.ok) return r;
  r = checkG6(s);
  if (!r.ok) return r;
  r = checkG7(s);
  if (!r.ok) return r;
  r = checkG9(ctx.macro, ctx.now);
  if (!r.ok) return r;
  return ok();
}

// Test-only export: individual gates so unit tests can exercise them in isolation.
export const __test__ = { checkG1, checkG2, checkG3, checkG4, checkG6, checkG7, checkG9 };
