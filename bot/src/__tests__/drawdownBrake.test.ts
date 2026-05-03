// Stage 20 — Drawdown Brake unit tests.
// Why: pin the consecutive-loss → cooldown contract. isInCooldown() goes through DB reconcile,
//   so we use setLastReconciledAt to bypass that side effect for the synchronous-cadence tests.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordOutcome,
  isInCooldown,
  resetState,
  getState,
  setLastReconciledAt,
} from '../services/drawdownBrake.js';

describe('drawdownBrake (Stage 20)', () => {
  beforeEach(() => {
    resetState();
    // Skip the DB reconcile so we can drive state purely through recordOutcome().
    setLastReconciledAt(Date.now());
  });

  it('does not trigger cooldown after 4 consecutive losses', async () => {
    for (let i = 0; i < 4; i++) recordOutcome(-1);
    const brake = await isInCooldown();
    expect(brake.active).toBe(false);
    expect(getState().consecutiveLosses).toBe(4);
  });

  it('triggers 4h cooldown after 5 consecutive losses', async () => {
    for (let i = 0; i < 5; i++) recordOutcome(-1);
    const brake = await isInCooldown();
    expect(brake.active).toBe(true);
    expect(brake.until).toBeGreaterThan(Date.now());
  });

  it('resets counter on a winning trade', () => {
    recordOutcome(-1);
    recordOutcome(-1);
    recordOutcome(+2);
    expect(getState().consecutiveLosses).toBe(0);
  });

  it('does not change counter on break-even (pnlR=0)', () => {
    recordOutcome(-1);
    recordOutcome(0);
    expect(getState().consecutiveLosses).toBe(1);
  });
});
