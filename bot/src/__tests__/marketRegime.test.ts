// Stage 20 — Market Regime detection + filter unit tests.

import { describe, it, expect } from 'vitest';
import { detectRegime, applyRegimeFilter } from '../services/marketRegime.js';
import type { FullMacroSnapshot } from '../services/macroBundle.js';

function macroFixture(opts: {
  dxy?: number | null;
  fgi?: number | null;
  btcD?: number | null;
}): FullMacroSnapshot {
  return {
    macro: opts.dxy === undefined
      ? null
      : {
          vix: null,
          dxy: opts.dxy,
          us10y: null,
          usdKrw: null,
          wti: null,
          fedRate: null,
          cpi: null,
          unemployment: null,
          gdpGrowth: null,
          fetchedAt: Date.now(),
        },
    fearGreed: opts.fgi == null ? null : { value: opts.fgi, label: 'test', timestamp: '' },
    fearGreedHistory7d: null,
    news: [],
    etfFlow: null,
    global: opts.btcD == null
      ? null
      : { btcDominance: opts.btcD, totalMcap: 0, mcapDelta: 0 },
    correlation: null,
    onchain: null,
    collectedSources: [],
    failedSources: [],
    fetchedAt: Date.now(),
  };
}

describe('detectRegime (Stage 20)', () => {
  it('returns risk-off when DXY>105 and FGI<25', () => {
    expect(detectRegime(macroFixture({ dxy: 106, fgi: 20, btcD: 55 }))).toBe('risk-off');
  });

  it('returns risk-on when DXY<100 and FGI>65', () => {
    expect(detectRegime(macroFixture({ dxy: 99, fgi: 70, btcD: 55 }))).toBe('risk-on');
  });

  it('returns btc-strong when BTC.D > 60', () => {
    expect(detectRegime(macroFixture({ btcD: 62 }))).toBe('btc-strong');
  });

  it('returns alt-strong when BTC.D < 50', () => {
    expect(detectRegime(macroFixture({ btcD: 48 }))).toBe('alt-strong');
  });

  it('returns neutral when no extremes', () => {
    expect(detectRegime(macroFixture({ dxy: 102, fgi: 50, btcD: 55 }))).toBe('neutral');
  });

  it('returns neutral when macro is null', () => {
    expect(detectRegime(null)).toBe('neutral');
  });
});

describe('applyRegimeFilter (Stage 20)', () => {
  it('suppresses alt long in btc-strong regime', () => {
    const d = applyRegimeFilter('SOLUSDT', 'long', 'btc-strong');
    expect(d.shouldSkip).toBe(true);
    expect(d.reason).toContain('alt long suppressed');
  });

  it('does not suppress BTC long in btc-strong regime', () => {
    const d = applyRegimeFilter('BTCUSDT', 'long', 'btc-strong');
    expect(d.shouldSkip).toBe(false);
  });

  it('suppresses all long in risk-off regime', () => {
    const d = applyRegimeFilter('BTCUSDT', 'long', 'risk-off');
    expect(d.shouldSkip).toBe(true);
  });

  it('suppresses alt short in alt-strong regime', () => {
    const d = applyRegimeFilter('ETHUSDT', 'short', 'alt-strong');
    expect(d.shouldSkip).toBe(true);
  });

  it('does not interfere with skip direction', () => {
    const d = applyRegimeFilter('BTCUSDT', 'skip', 'risk-off');
    expect(d.shouldSkip).toBe(false);
  });
});
