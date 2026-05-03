// Stage 19 T10 — Trade simulator unit tests.
// Why: pin SL-priority assumption + R math so backtest interpretation is unambiguous.

import { describe, it, expect } from 'vitest';
import { simulateTrade } from '../../scripts/lib/simulateTrade.js';
import type { Candle } from '../../scripts/lib/historicalFetch.js';

function candle(openTime: number, low: number, high: number, close: number): Candle {
  return {
    openTime,
    open: close,
    high,
    low,
    close,
    volume: 1000,
    closeTime: openTime + 5 * 60_000,
  };
}

describe('simulateTrade (Stage 19)', () => {
  it('LONG: hits TP1 when price rises to TP1 first', () => {
    const signal = {
      direction: 'long' as const,
      entry: 100,
      stopLoss: 95,
      tp1: 110,
      tp2: 120,
      entryTime: 0,
    };
    const candles = [
      candle(5 * 60_000, 99, 105, 102),
      candle(10 * 60_000, 101, 111, 110),
    ];
    const out = simulateTrade(signal, candles);
    expect(out.hit).toBe('tp1');
    expect(out.pnlR).toBeCloseTo(2, 1);
  });

  it('LONG: hits SL when price drops to SL', () => {
    const signal = {
      direction: 'long' as const,
      entry: 100,
      stopLoss: 95,
      tp1: 110,
      tp2: 120,
      entryTime: 0,
    };
    const candles = [candle(5 * 60_000, 94, 99, 95)];
    const out = simulateTrade(signal, candles);
    expect(out.hit).toBe('sl');
    expect(out.pnlR).toBe(-1);
  });

  it('LONG: SL takes priority when both touched in same candle (conservative)', () => {
    const signal = {
      direction: 'long' as const,
      entry: 100,
      stopLoss: 95,
      tp1: 110,
      tp2: 120,
      entryTime: 0,
    };
    const candles = [candle(5 * 60_000, 94, 111, 100)];
    const out = simulateTrade(signal, candles);
    expect(out.hit).toBe('sl');
  });

  it('SHORT: hits TP2 when price drops to TP2', () => {
    const signal = {
      direction: 'short' as const,
      entry: 100,
      stopLoss: 105,
      tp1: 95,
      tp2: 90,
      entryTime: 0,
    };
    const candles = [candle(5 * 60_000, 89, 99, 90)];
    const out = simulateTrade(signal, candles);
    expect(out.hit).toBe('tp2');
    expect(out.pnlR).toBeCloseTo(2, 1);
  });

  it('returns timeout when no level hit within 48h', () => {
    const signal = {
      direction: 'long' as const,
      entry: 100,
      stopLoss: 95,
      tp1: 110,
      tp2: 120,
      entryTime: 0,
    };
    const candles = Array.from({ length: 100 }, (_, i) =>
      candle((i + 1) * 5 * 60_000, 99, 102, 101)
    );
    const out = simulateTrade(signal, candles);
    expect(out.hit).toBe('timeout');
  });
});
