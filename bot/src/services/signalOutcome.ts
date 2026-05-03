// Stage 20 — Live signal outcome tracking with 48h polling.
// Why: every fired signal needs an audit trail (entry/SL/TP/exit/pnlR) so /stats and dailyReport
//   can show real performance — not just claims. Inserts row at broadcast, polls 5m candles every
//   5 min, updates row on TP/SL hit or 48h timeout.
// PATCH v2 (defect #7) — explicit insertFailureCount counter so /stats can surface tracking gaps.

import { createSupabase } from '../db/supabase.js';
import { fetchKlinesWithTime, type FuturesSymbol } from './marketData.js';
import { simulateTrade, type TradeSignal, type TradeOutcome } from './tradeSimulator.js';
import { recordOutcome as recordToBrake } from './drawdownBrake.js';
import type { Signal } from './signalEngine.js';

const supabase = createSupabase();

const POLL_INTERVAL_MS = 5 * 60_000;
const MAX_DURATION_MS = 48 * 3_600_000;

// Why: Binance taker fee 0.04% × 2 sides + 0.05% × 2 slippage ≈ 0.18% round trip.
//   Translated to R-multiple as a flat 0.13R deduction (rough but conservative average across
//   typical 1-3% SL distances).
const FEE_R_DEDUCTION = 0.13;

let insertFailureCount = 0;

export function getInsertFailureCount(): number {
  return insertFailureCount;
}

interface OutcomeContext {
  signal: Signal;
  entryTime: number;
  entryPrice: number;
}

export async function trackSignalOutcome(ctx: OutcomeContext): Promise<void> {
  const { signal, entryTime, entryPrice } = ctx;
  if (signal.direction === 'skip') return;

  const insertResult = await supabase
    .from('signal_outcomes')
    .insert({
      symbol: signal.symbol,
      direction: signal.direction,
      entry_price: entryPrice,
      sl_price: signal.stopLoss,
      tp1_price: signal.tp1,
      tp2_price: signal.tp2,
      leverage: signal.leverage,
      confidence: signal.confidence,
      score: signal.score,
      rationale: signal.rationale,
      broadcast_at: new Date(entryTime).toISOString(),
      status: 'open',
    })
    .select('id')
    .single();

  if (insertResult.error || !insertResult.data) {
    console.error(
      `[signalOutcome] CRITICAL insert failed for ${signal.symbol}: ${insertResult.error?.message ?? 'no data'}`
    );
    insertFailureCount++;
    return;
  }
  const outcomeId = insertResult.data.id as string;

  const tradeSignal: TradeSignal = {
    direction: signal.direction,
    entry: entryPrice,
    stopLoss: signal.stopLoss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    entryTime,
  };

  const deadline = entryTime + MAX_DURATION_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const candles = await fetchKlinesWithTime(signal.symbol as FuturesSymbol, 100, '5m');
      if (!candles || candles.length === 0) continue;

      const future = candles.filter((c) => c.openTime > entryTime);
      if (future.length === 0) continue;

      const outcome = simulateTrade(tradeSignal, future);
      if (outcome.hit !== 'timeout') {
        await closeOutcome(outcomeId, outcome);
        return;
      }
    } catch (err) {
      console.warn('[signalOutcome] poll error:', err);
    }
  }

  // Deadline reached without hit — close as timeout, marked to last close.
  const lastCandles = await fetchKlinesWithTime(signal.symbol as FuturesSymbol, 1, '5m');
  const lastClose =
    lastCandles && lastCandles.length > 0
      ? lastCandles[lastCandles.length - 1]!.close
      : entryPrice;
  const slDist = Math.abs(entryPrice - signal.stopLoss);
  const unrealizedR =
    slDist > 0
      ? signal.direction === 'long'
        ? (lastClose - entryPrice) / slDist
        : (entryPrice - lastClose) / slDist
      : 0;
  await closeOutcome(outcomeId, {
    hit: 'timeout',
    exitTime: Date.now(),
    exitPrice: lastClose,
    pnlR: unrealizedR,
    durationHours: MAX_DURATION_MS / 3_600_000,
  });
}

async function closeOutcome(outcomeId: string, outcome: TradeOutcome): Promise<void> {
  const netPnlR = outcome.pnlR - FEE_R_DEDUCTION;

  const { error } = await supabase
    .from('signal_outcomes')
    .update({
      status: 'closed',
      hit: outcome.hit,
      exit_price: outcome.exitPrice,
      exit_at: new Date(outcome.exitTime).toISOString(),
      duration_hours: outcome.durationHours,
      pnl_r_gross: outcome.pnlR,
      pnl_r_net: netPnlR,
    })
    .eq('id', outcomeId);

  if (error) {
    console.warn('[signalOutcome] close failed:', error.message);
    return;
  }

  recordToBrake(netPnlR);
  console.log(
    `[signalOutcome] closed ${outcomeId}: ${outcome.hit} pnlR=${netPnlR.toFixed(2)}`
  );
}
