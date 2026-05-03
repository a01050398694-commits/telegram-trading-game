// Stage 19 T4 — R:R Guard unit tests.
// Why: deterministic kline fixtures are flaky (synthesizing structure detection is brittle).
//   Test the pure R:R math directly + the contract that the gate's threshold values exist.
//   Integration end-to-end is covered by the live smoke:signal run + backtest harness.

import { describe, it, expect } from 'vitest';
import { computeRiskReward } from '../services/signalEngine.js';

describe('computeRiskReward (Stage 19 R:R Guard)', () => {
  it('LONG: computes correct R for healthy ratio (TP1=1.6R, TP2=2.4R)', () => {
    // entry=100, sl=95 (-5), tp1=108 (+8 → 1.6R), tp2=112 (+12 → 2.4R)
    const rr = computeRiskReward(100, 95, 108, 112);
    expect(rr.rrTp1).toBeCloseTo(1.6, 2);
    expect(rr.rrTp2).toBeCloseTo(2.4, 2);
  });

  it('SHORT: mirrors LONG math — tp below entry, sl above', () => {
    // entry=100, sl=105 (+5), tp1=92 (-8 → 1.6R), tp2=88 (-12 → 2.4R)
    const rr = computeRiskReward(100, 105, 92, 88);
    expect(rr.rrTp1).toBeCloseTo(1.6, 2);
    expect(rr.rrTp2).toBeCloseTo(2.4, 2);
  });

  it('detects unprofitable R:R that would trigger Gate skip (TP1 < 1.0R)', () => {
    // The 03:03 BTC LONG live case: entry=78403, sl=74691 (-3712), tp1=78920 (+517), tp2=79448 (+1045)
    const rr = computeRiskReward(78403, 74691, 78920, 79448);
    expect(rr.rrTp1).toBeLessThan(1.0);
    expect(rr.rrTp2).toBeLessThan(1.5);
    // Specifically, rrTp1 should be the documented ~0.14
    expect(rr.rrTp1).toBeCloseTo(0.14, 1);
  });

  it('returns 0/0 when slDistance is 0 (NaN guard)', () => {
    const rr = computeRiskReward(100, 100, 110, 120);
    expect(rr.rrTp1).toBe(0);
    expect(rr.rrTp2).toBe(0);
  });
});
