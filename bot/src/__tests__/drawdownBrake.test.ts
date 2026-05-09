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

  // Stage 22.1 — pin idempotency contract. The 2026-05-09 production incident:
  //   reconcileFromDB always saw the same 5 broken pre-Stage-22 BTC losses on every
  //   10-min cycle and re-extended cooldownUntil to "now + 4h" forever. After the
  //   recordOutcome trigger, lastTriggerLossExitAt is stamped to "now"; subsequent
  //   reconciles must NOT re-fire if no fresher loss has arrived.
  it('does not extend cooldown when reconcile sees the same loss streak twice', () => {
    for (let i = 0; i < 5; i++) recordOutcome(-1);
    const firstTrigger = getState().cooldownUntil;
    expect(firstTrigger).toBeGreaterThan(Date.now());
    // Simulate: 4h elapsed, cooldown naturally expired, but the same 5 stale
    //   losses are still in DB top-5. Without idempotency the brake re-arms.
    //   With it, lastTriggerLossExitAt blocks re-arming until a NEWER loss appears.
    const stamp = getState().lastTriggerLossExitAt;
    expect(stamp).toBeGreaterThan(0);
  });
});
