// Stage 20 — Trade simulator for live outcome tracking + backtest.
// Moved from scripts/lib/simulateTrade.ts so live signalOutcome.ts can reuse it.
// Why: deterministic SL/TP hit decision. SL takes priority when both touched in the same candle
//   (intra-candle order is unknown) — pessimistic choice; backtest results never overstate wins.

import type { OhlcCandle } from './marketData.js';

export type { OhlcCandle };

export interface TradeSignal {
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  entryTime: number;
}

export type TradeOutcome =
  | { hit: 'tp1'; exitTime: number; exitPrice: number; pnlR: number; durationHours: number }
  | { hit: 'tp2'; exitTime: number; exitPrice: number; pnlR: number; durationHours: number }
  | { hit: 'sl'; exitTime: number; exitPrice: number; pnlR: number; durationHours: number }
  | { hit: 'timeout'; exitTime: number; exitPrice: number; pnlR: number; durationHours: number };

const TIMEOUT_HOURS = 48;

export function simulateTrade(signal: TradeSignal, futureCandles: OhlcCandle[]): TradeOutcome {
  const slDistance = Math.abs(signal.entry - signal.stopLoss);
  if (slDistance === 0 || futureCandles.length === 0) {
    return {
      hit: 'timeout',
      exitTime: signal.entryTime,
      exitPrice: signal.entry,
      pnlR: 0,
      durationHours: 0,
    };
  }

  const timeoutAt = signal.entryTime + TIMEOUT_HOURS * 3_600_000;

  for (const c of futureCandles) {
    if (c.openTime >= timeoutAt) break;
    const elapsedHours = (c.openTime - signal.entryTime) / 3_600_000;

    if (signal.direction === 'long') {
      if (c.low <= signal.stopLoss) {
        return {
          hit: 'sl',
          exitTime: c.openTime,
          exitPrice: signal.stopLoss,
          pnlR: -1,
          durationHours: elapsedHours,
        };
      }
      if (c.high >= signal.tp2) {
        return {
          hit: 'tp2',
          exitTime: c.openTime,
          exitPrice: signal.tp2,
          pnlR: (signal.tp2 - signal.entry) / slDistance,
          durationHours: elapsedHours,
        };
      }
      if (c.high >= signal.tp1) {
        return {
          hit: 'tp1',
          exitTime: c.openTime,
          exitPrice: signal.tp1,
          pnlR: (signal.tp1 - signal.entry) / slDistance,
          durationHours: elapsedHours,
        };
      }
    } else {
      if (c.high >= signal.stopLoss) {
        return {
          hit: 'sl',
          exitTime: c.openTime,
          exitPrice: signal.stopLoss,
          pnlR: -1,
          durationHours: elapsedHours,
        };
      }
      if (c.low <= signal.tp2) {
        return {
          hit: 'tp2',
          exitTime: c.openTime,
          exitPrice: signal.tp2,
          pnlR: (signal.entry - signal.tp2) / slDistance,
          durationHours: elapsedHours,
        };
      }
      if (c.low <= signal.tp1) {
        return {
          hit: 'tp1',
          exitTime: c.openTime,
          exitPrice: signal.tp1,
          pnlR: (signal.entry - signal.tp1) / slDistance,
          durationHours: elapsedHours,
        };
      }
    }
  }

  const last = futureCandles[futureCandles.length - 1]!;
  const unrealizedR =
    signal.direction === 'long'
      ? (last.close - signal.entry) / slDistance
      : (signal.entry - last.close) / slDistance;
  return {
    hit: 'timeout',
    exitTime: last.openTime,
    exitPrice: last.close,
    pnlR: unrealizedR,
    durationHours: (last.openTime - signal.entryTime) / 3_600_000,
  };
}
