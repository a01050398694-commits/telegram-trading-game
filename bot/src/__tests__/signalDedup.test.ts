import { describe, it, expect } from 'vitest';
import { setupHash, __test__ as priv } from '../services/signalDedup.js';
import type { Signal } from '../services/signalEngine.js';

// Why: dedup ships as a hash + DB lookup. The hash function is pure and unit-testable;
//   the DB lookup is integration-tested in backtest. Here we lock the hash semantics so
//   future refactors don't quietly collapse or fragment buckets.

function fakeSignal(over: Partial<Signal> = {}): Signal {
  return {
    symbol: 'BTCUSDT',
    direction: 'long',
    score: 60,
    confidence: 'medium',
    currentPrice: 80000,
    entry: 80000,
    stopLoss: 79000,
    tp1: 81000,
    tp2: 82000,
    leverage: 5,
    rationale: [],
    multiTimeframeAlignment: { m15: 'bullish', h1: 'bullish', h4: 'bullish', d1: 'bullish', alignmentScore: 1 },
    structure: { trend: 'bullish', recentSwingHigh: 82000, recentSwingLow: 78000, bosDetected: true },
    keyLevels: { nearestResistance: 81000, nearestSupport: 79000, pivot: 80000 },
    divergence: { bullish: false, bearish: false },
    volumeConfirmation: 'confirmed',
    ...over,
  };
}

describe('setupHash — structure-based', () => {
  it('produces stable hash for the same signal', () => {
    const s = fakeSignal();
    expect(setupHash(s)).toBe(setupHash(s));
  });

  it('different symbols produce different hashes', () => {
    const a = setupHash(fakeSignal({ symbol: 'BTCUSDT' }));
    const b = setupHash(fakeSignal({ symbol: 'ETHUSDT' }));
    expect(a).not.toBe(b);
  });

  it('different directions produce different hashes', () => {
    const a = setupHash(fakeSignal({ direction: 'long' }));
    const b = setupHash(fakeSignal({ direction: 'short' }));
    expect(a).not.toBe(b);
  });

  it('format is SYM|DIR|swingHigh|swingLow', () => {
    const h = setupHash(fakeSignal());
    expect(h.split('|').length).toBe(4);
    expect(h.startsWith('BTCUSDT|long|')).toBe(true);
  });

  it('regression: 5 BTC LONG signals from 2026-05-06 share an identical hash', () => {
    // All 5 had swingHigh=79143.40 and swingLow=78230.48 with entries drifting
    // $81,401-$81,761 across the 2h22m burst. Structure-based hash collapses them
    // into one — exactly the point of dedup. Pre-Stage-22 there was no hash and
    // they all broadcast.
    const struct = { trend: 'bullish' as const, recentSwingHigh: 79143.40, recentSwingLow: 78230.48, bosDetected: true };
    const e1 = fakeSignal({ entry: 81401, structure: struct });
    const e2 = fakeSignal({ entry: 81729, structure: struct });
    const e3 = fakeSignal({ entry: 81761, structure: struct });
    expect(setupHash(e1)).toBe(setupHash(e2));
    expect(setupHash(e2)).toBe(setupHash(e3));
  });

  it('different swing structures produce different hashes (new setup → broadcastable)', () => {
    const a = setupHash(fakeSignal({
      structure: { trend: 'bullish', recentSwingHigh: 82000, recentSwingLow: 78000, bosDetected: false },
    }));
    const b = setupHash(fakeSignal({
      structure: { trend: 'bullish', recentSwingHigh: 84000, recentSwingLow: 80000, bosDetected: true },
    }));
    expect(a).not.toBe(b);
  });
});

describe('getDedupConfig', () => {
  it('returns sensible defaults when env not set', () => {
    delete process.env.SIGNAL_DEDUP_WINDOW_HOURS;
    const cfg = priv.getDedupConfig();
    expect(cfg.windowHours).toBe(6);
  });

  it('respects env override', () => {
    process.env.SIGNAL_DEDUP_WINDOW_HOURS = '4';
    const cfg = priv.getDedupConfig();
    expect(cfg.windowHours).toBe(4);
    delete process.env.SIGNAL_DEDUP_WINDOW_HOURS;
  });

  it('falls back to default for invalid env', () => {
    process.env.SIGNAL_DEDUP_WINDOW_HOURS = 'not-a-number';
    const cfg = priv.getDedupConfig();
    expect(cfg.windowHours).toBe(6);
    delete process.env.SIGNAL_DEDUP_WINDOW_HOURS;
  });
});
