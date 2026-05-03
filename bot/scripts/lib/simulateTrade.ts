// Stage 19 — Trade outcome simulator for backtesting.
// Why: deterministic SL/TP hit decision. When SL and TP are both touched within the same candle
//   (intra-candle order is unknown), assume SL hits first. This is the conservative pessimistic
//   choice — backtest results bias toward LOWER realized R rather than overstating wins.

import type { Candle } from './historicalFetch.js';

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

export function simulateTrade(signal: TradeSignal, futureCandles: Candle[]): TradeOutcome {
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

  // Timeout — mark to market on the last available candle.
  const last = futureCandles[futureCandles.length - 1]!;
  const unrealizedR = signal.direction === 'long'
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
