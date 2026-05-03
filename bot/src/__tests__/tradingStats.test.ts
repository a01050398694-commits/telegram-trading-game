// Stage 20 — tradingStats aggregation unit tests.
// Why: stats power /stats + dailyReport + monthlyReport. Wrong aggregation = wrong CTO decisions.
//   Test the pure computeStatsFromRows function (no DB) so the math is locked.

import { describe, it, expect } from 'vitest';
import { computeStatsFromRows, type OutcomeRow } from '../services/tradingStats.js';

function row(opts: Partial<OutcomeRow> & { broadcast_at: string }): OutcomeRow {
  return {
    symbol: 'BTCUSDT',
    direction: 'long',
    status: 'closed',
    hit: 'tp1',
    pnl_r_net: 1.5,
    ...opts,
  };
}

describe('computeStatsFromRows (Stage 20)', () => {
  it('returns zeros for empty data with no NaN', () => {
    const stats = computeStatsFromRows([], 30);
    expect(stats.totalSignals).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.avgPnlR).toBe(0);
    expect(stats.totalPnlR).toBe(0);
    expect(stats.maxConsecutiveLosses).toBe(0);
    expect(stats.maxDrawdownR).toBe(0);
    expect(Number.isFinite(stats.winRate)).toBe(true);
  });

  it('calculates win rate correctly (2 wins / 2 losses → 50%)', () => {
    const rows: OutcomeRow[] = [
      row({ broadcast_at: '2026-04-01T00:00:00Z', pnl_r_net: 2 }),
      row({ broadcast_at: '2026-04-02T00:00:00Z', pnl_r_net: -1 }),
      row({ broadcast_at: '2026-04-03T00:00:00Z', pnl_r_net: 1.5 }),
      row({ broadcast_at: '2026-04-04T00:00:00Z', pnl_r_net: -1 }),
    ];
    const stats = computeStatsFromRows(rows, 30);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(2);
    expect(stats.winRate).toBe(0.5);
    expect(stats.totalPnlR).toBeCloseTo(1.5, 2);
  });

  it('tracks max consecutive loss streak (W,L,L,L,W → 3)', () => {
    const rows: OutcomeRow[] = [
      row({ broadcast_at: '2026-04-01T00:00:00Z', pnl_r_net: 1 }),
      row({ broadcast_at: '2026-04-02T00:00:00Z', pnl_r_net: -1 }),
      row({ broadcast_at: '2026-04-03T00:00:00Z', pnl_r_net: -1 }),
      row({ broadcast_at: '2026-04-04T00:00:00Z', pnl_r_net: -1 }),
      row({ broadcast_at: '2026-04-05T00:00:00Z', pnl_r_net: 2 }),
    ];
    const stats = computeStatsFromRows(rows, 30);
    expect(stats.maxConsecutiveLosses).toBe(3);
  });

  it('groups per-symbol correctly', () => {
    const rows: OutcomeRow[] = [
      row({ symbol: 'BTCUSDT', broadcast_at: '2026-04-01T00:00:00Z', pnl_r_net: 2 }),
      row({ symbol: 'ETHUSDT', broadcast_at: '2026-04-02T00:00:00Z', pnl_r_net: -1 }),
      row({ symbol: 'BTCUSDT', broadcast_at: '2026-04-03T00:00:00Z', pnl_r_net: 1 }),
    ];
    const stats = computeStatsFromRows(rows, 30);
    expect(stats.perSymbol).toHaveLength(2);
    const btc = stats.perSymbol.find((s) => s.symbol === 'BTCUSDT');
    const eth = stats.perSymbol.find((s) => s.symbol === 'ETHUSDT');
    expect(btc?.entries).toBe(2);
    expect(btc?.winRate).toBe(1.0);
    expect(eth?.winRate).toBe(0.0);
  });

  it('groups per-direction correctly', () => {
    const rows: OutcomeRow[] = [
      row({ direction: 'long', broadcast_at: '2026-04-01T00:00:00Z', pnl_r_net: 2 }),
      row({ direction: 'long', broadcast_at: '2026-04-02T00:00:00Z', pnl_r_net: -1 }),
      row({ direction: 'short', broadcast_at: '2026-04-03T00:00:00Z', pnl_r_net: 1.5 }),
    ];
    const stats = computeStatsFromRows(rows, 30);
    expect(stats.perDirection.long.count).toBe(2);
    expect(stats.perDirection.long.winRate).toBe(0.5);
    expect(stats.perDirection.short.count).toBe(1);
    expect(stats.perDirection.short.winRate).toBe(1.0);
  });

  it('counts open signals separately from closed', () => {
    const rows: OutcomeRow[] = [
      row({ broadcast_at: '2026-04-01T00:00:00Z', pnl_r_net: 1 }),
      { ...row({ broadcast_at: '2026-04-02T00:00:00Z' }), status: 'open', pnl_r_net: null, hit: null },
    ];
    const stats = computeStatsFromRows(rows, 30);
    expect(stats.totalSignals).toBe(2);
    expect(stats.closedSignals).toBe(1);
    expect(stats.openSignals).toBe(1);
  });

  it('groups monthly returns by YYYY-MM', () => {
    const rows: OutcomeRow[] = [
      row({ broadcast_at: '2026-03-15T00:00:00Z', pnl_r_net: 2 }),
      row({ broadcast_at: '2026-03-20T00:00:00Z', pnl_r_net: -1 }),
      row({ broadcast_at: '2026-04-05T00:00:00Z', pnl_r_net: 1.5 }),
    ];
    const stats = computeStatsFromRows(rows, 90);
    expect(stats.monthlyReturns).toHaveLength(2);
    expect(stats.monthlyReturns[0]?.month).toBe('2026-03');
    expect(stats.monthlyReturns[0]?.netPnlR).toBeCloseTo(1, 2);
    expect(stats.monthlyReturns[1]?.month).toBe('2026-04');
  });
});
