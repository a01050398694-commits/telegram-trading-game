// Stage 20 — Drawdown Brake.
// Why: Stage 19 backtest showed max consecutive losses = 47. Without a circuit breaker, the bot
//   keeps firing during clearly-broken regimes. 5 losses in a row → 4h cooldown.
// PATCH v2 (defect #4) — memory state lost on Render restart. Reconcile from signal_outcomes
//   every 10 min so the brake survives reboots.

import { createSupabase } from '../db/supabase.js';

const CONSECUTIVE_LOSS_THRESHOLD = 5;
const COOLDOWN_MS = 4 * 3600_000;
const RECONCILE_INTERVAL_MS = 10 * 60_000;

const supabase = createSupabase();

interface BrakeState {
  consecutiveLosses: number;
  cooldownUntil: number;
  lastReconciledAt: number;
}

const state: BrakeState = {
  consecutiveLosses: 0,
  cooldownUntil: 0,
  lastReconciledAt: 0,
};

async function reconcileFromDB(): Promise<void> {
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('pnl_r_net, exit_at')
    .eq('status', 'closed')
    .order('exit_at', { ascending: false })
    .limit(5);
  if (error || !data) {
    console.warn('[drawdownBrake] reconcile failed:', error?.message ?? 'no data');
    return;
  }

  let count = 0;
  for (const row of data) {
    if (typeof row.pnl_r_net !== 'number') break;
    if (row.pnl_r_net < 0) count++;
    else break; // first win/break-even ends the streak
  }
  state.consecutiveLosses = count;
  state.lastReconciledAt = Date.now();
}

export async function isInCooldown(): Promise<{ active: boolean; until: number }> {
  if (Date.now() - state.lastReconciledAt > RECONCILE_INTERVAL_MS) {
    await reconcileFromDB();
    if (state.consecutiveLosses >= CONSECUTIVE_LOSS_THRESHOLD) {
      state.cooldownUntil = Date.now() + COOLDOWN_MS;
      state.consecutiveLosses = 0;
      console.warn(
        `[drawdownBrake] reconcile detected ${CONSECUTIVE_LOSS_THRESHOLD} consecutive losses, cooldown 4h until ${new Date(state.cooldownUntil).toISOString()}`
      );
    }
  }
  return {
    active: Date.now() < state.cooldownUntil,
    until: state.cooldownUntil,
  };
}

export function recordOutcome(pnlR: number): void {
  if (pnlR < 0) {
    state.consecutiveLosses++;
    if (state.consecutiveLosses >= CONSECUTIVE_LOSS_THRESHOLD) {
      state.cooldownUntil = Date.now() + COOLDOWN_MS;
      state.consecutiveLosses = 0;
      console.warn(
        `[drawdownBrake] ${CONSECUTIVE_LOSS_THRESHOLD} consecutive losses, cooldown 4h until ${new Date(state.cooldownUntil).toISOString()}`
      );
    }
  } else if (pnlR > 0) {
    state.consecutiveLosses = 0;
  }
  // pnlR === 0 (break-even / timeout flat) — counter unchanged.
}

export function resetState(): void {
  state.consecutiveLosses = 0;
  state.cooldownUntil = 0;
  state.lastReconciledAt = 0;
}

export function getState(): Readonly<BrakeState> {
  return { ...state };
}

export function setLastReconciledAt(t: number): void {
  // Test-only escape hatch — bypass DB reconcile by pretending we just synced.
  state.lastReconciledAt = t;
}
