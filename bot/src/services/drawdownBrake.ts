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
  // Why: without this, reconcileFromDB sees the same N losses every 10 min and
  //   re-extends cooldownUntil to "now + 4h" forever — the bug that wedged the
  //   pipeline 2026-05-09 → 2026-05-10 alongside the SMA200 starvation. Tracks
  //   the exit_at of the most recent loss when the brake last fired; future
  //   reconciles only re-fire if a NEWER loss has arrived since.
  lastTriggerLossExitAt: number;
}

const state: BrakeState = {
  consecutiveLosses: 0,
  cooldownUntil: 0,
  lastReconciledAt: 0,
  lastTriggerLossExitAt: 0,
};

interface ReconcileResult {
  count: number;
  mostRecentLossExitAt: number;
}

async function reconcileFromDB(): Promise<ReconcileResult> {
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('pnl_r_net, exit_at')
    .eq('status', 'closed')
    .order('exit_at', { ascending: false })
    .limit(5);
  if (error || !data) {
    console.warn('[drawdownBrake] reconcile failed:', error?.message ?? 'no data');
    return { count: state.consecutiveLosses, mostRecentLossExitAt: state.lastTriggerLossExitAt };
  }

  let count = 0;
  let mostRecentLossExitAt = 0;
  for (const row of data) {
    if (typeof row.pnl_r_net !== 'number') break;
    if (row.pnl_r_net < 0) {
      count++;
      const exitAt = row.exit_at ? new Date(row.exit_at as string).getTime() : 0;
      if (exitAt > mostRecentLossExitAt) mostRecentLossExitAt = exitAt;
    } else {
      break; // first win/break-even ends the streak
    }
  }
  state.consecutiveLosses = count;
  state.lastReconciledAt = Date.now();
  return { count, mostRecentLossExitAt };
}

export async function isInCooldown(): Promise<{ active: boolean; until: number }> {
  if (Date.now() - state.lastReconciledAt > RECONCILE_INTERVAL_MS) {
    const { count, mostRecentLossExitAt } = await reconcileFromDB();
    // Only fire if (a) loss threshold met AND (b) the most recent loss is newer than
    //   the loss that triggered the previous cooldown. Without (b), the brake re-fires
    //   on stale data after every 4h expiry and the pipeline is permanently bricked.
    const hasNewLoss = mostRecentLossExitAt > state.lastTriggerLossExitAt;
    if (count >= CONSECUTIVE_LOSS_THRESHOLD && hasNewLoss) {
      state.cooldownUntil = Date.now() + COOLDOWN_MS;
      state.lastTriggerLossExitAt = mostRecentLossExitAt;
      state.consecutiveLosses = 0;
      console.warn(
        `[drawdownBrake] ${CONSECUTIVE_LOSS_THRESHOLD} new consecutive losses (most recent exit ${new Date(mostRecentLossExitAt).toISOString()}), cooldown 4h until ${new Date(state.cooldownUntil).toISOString()}`
      );
    } else if (count >= CONSECUTIVE_LOSS_THRESHOLD) {
      console.log(
        `[drawdownBrake] ${count} losses still on top-5 but already accounted for (last trigger exit ${new Date(state.lastTriggerLossExitAt).toISOString()}), not re-extending cooldown`
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
      const now = Date.now();
      state.cooldownUntil = now + COOLDOWN_MS;
      state.lastTriggerLossExitAt = now; // claim the current moment as the trigger boundary
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
  state.lastTriggerLossExitAt = 0;
}

export function getState(): Readonly<BrakeState> {
  return { ...state };
}

export function setLastReconciledAt(t: number): void {
  // Test-only escape hatch — bypass DB reconcile by pretending we just synced.
  state.lastReconciledAt = t;
}
