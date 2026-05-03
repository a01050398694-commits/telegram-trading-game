// Stage 19 — Backtest statistics aggregator + console table + JSON dump.
// Why: spec §17 requires per-symbol / per-direction / per-confidence / per-alignment stats with
//   max consecutive losses + max drawdown so we can decide the next chunk based on data.

import { writeFileSync } from 'node:fs';
import type { Signal } from '../../src/services/signalEngine.js';
import type { TradeOutcome } from './simulateTrade.js';

export interface BacktestResult {
  time: number;
  symbol: string;
  signal: Signal;
  outcome: TradeOutcome | { hit: 'skip' };
}

export interface SymbolStats {
  symbol: string;
  totalSignals: number;
  longCount: number;
  shortCount: number;
  skipCount: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  avgPnlR: number;
  totalPnlR: number;
  maxConsecutiveLosses: number;
  maxDrawdownR: number;
}

export interface BucketStats {
  count: number;
  wins: number;
  winRate: number;
  avgPnlR: number;
  totalPnlR: number;
}

export interface OverallStats {
  totalEntries: number;
  totalSkips: number;
  winRate: number;
  avgPnlR: number;
  totalPnlR: number;
  maxConsecutiveLosses: number;
  maxDrawdownR: number;
  perSymbol: SymbolStats[];
  perDirection: { long: BucketStats; short: BucketStats };
  perConfidence: Record<string, BucketStats>;
  perAlignment: Record<string, BucketStats>;
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function isEntry(r: BacktestResult): boolean {
  return r.outcome.hit !== 'skip';
}

function pnlR(r: BacktestResult): number {
  return r.outcome.hit === 'skip' ? 0 : r.outcome.pnlR;
}

function isWin(r: BacktestResult): boolean {
  return isEntry(r) && pnlR(r) > 0;
}

function isLoss(r: BacktestResult): boolean {
  return isEntry(r) && pnlR(r) < 0;
}

function emptyBucket(): BucketStats {
  return { count: 0, wins: 0, winRate: 0, avgPnlR: 0, totalPnlR: 0 };
}

function bucketAdd(bucket: BucketStats, r: BacktestResult): void {
  if (!isEntry(r)) return;
  bucket.count++;
  if (isWin(r)) bucket.wins++;
  bucket.totalPnlR += pnlR(r);
}

function bucketFinalize(bucket: BucketStats): void {
  bucket.winRate = safeDiv(bucket.wins, bucket.count);
  bucket.avgPnlR = safeDiv(bucket.totalPnlR, bucket.count);
}

function alignmentBucketKey(score: number): string {
  if (score >= 0.99) return '4/4';
  if (score >= 0.74) return '3/4';
  if (score >= 0.49) return '2/4';
  return '<2/4';
}

function computeStreaks(entries: BacktestResult[]): { maxLossStreak: number; maxDrawdownR: number } {
  // Time-ordered. Equity tracked in R units, drawdown = peak - current.
  const sorted = entries.slice().sort((a, b) => a.time - b.time);
  let lossStreak = 0;
  let maxLossStreak = 0;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of sorted) {
    if (!isEntry(r)) continue;
    equity += pnlR(r);
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (isLoss(r)) {
      lossStreak++;
      if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
    } else if (isWin(r)) {
      lossStreak = 0;
    }
  }
  return { maxLossStreak, maxDrawdownR: maxDrawdown };
}

export function computeStatistics(results: BacktestResult[]): OverallStats {
  const entries = results.filter(isEntry);
  const skips = results.filter((r) => !isEntry(r));

  const totalEntries = entries.length;
  const totalWins = entries.filter(isWin).length;
  const totalPnlR = entries.reduce((sum, r) => sum + pnlR(r), 0);
  const overallStreaks = computeStreaks(entries);

  const symbolMap = new Map<string, BacktestResult[]>();
  for (const r of results) {
    const list = symbolMap.get(r.symbol) ?? [];
    list.push(r);
    symbolMap.set(r.symbol, list);
  }
  const perSymbol: SymbolStats[] = [];
  for (const [symbol, list] of symbolMap.entries()) {
    const symEntries = list.filter(isEntry);
    const wins = symEntries.filter(isWin).length;
    const losses = symEntries.filter(isLoss).length;
    const timeouts = symEntries.filter((r) => r.outcome.hit === 'timeout').length;
    const longCount = list.filter((r) => r.signal.direction === 'long' && isEntry(r)).length;
    const shortCount = list.filter((r) => r.signal.direction === 'short' && isEntry(r)).length;
    const skipCount = list.filter((r) => !isEntry(r)).length;
    const symPnl = symEntries.reduce((sum, r) => sum + pnlR(r), 0);
    const streaks = computeStreaks(symEntries);
    perSymbol.push({
      symbol,
      totalSignals: list.length,
      longCount,
      shortCount,
      skipCount,
      wins,
      losses,
      timeouts,
      winRate: safeDiv(wins, symEntries.length),
      avgPnlR: safeDiv(symPnl, symEntries.length),
      totalPnlR: symPnl,
      maxConsecutiveLosses: streaks.maxLossStreak,
      maxDrawdownR: streaks.maxDrawdownR,
    });
  }
  perSymbol.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const perDirection = { long: emptyBucket(), short: emptyBucket() };
  const perConfidence: Record<string, BucketStats> = {
    high: emptyBucket(),
    medium: emptyBucket(),
    low: emptyBucket(),
  };
  const perAlignment: Record<string, BucketStats> = {
    '4/4': emptyBucket(),
    '3/4': emptyBucket(),
    '2/4': emptyBucket(),
    '<2/4': emptyBucket(),
  };
  for (const r of entries) {
    if (r.signal.direction === 'long') bucketAdd(perDirection.long, r);
    else if (r.signal.direction === 'short') bucketAdd(perDirection.short, r);

    const cb = perConfidence[r.signal.confidence];
    if (cb) bucketAdd(cb, r);

    const ab = perAlignment[alignmentBucketKey(r.signal.multiTimeframeAlignment.alignmentScore)];
    if (ab) bucketAdd(ab, r);
  }
  bucketFinalize(perDirection.long);
  bucketFinalize(perDirection.short);
  for (const k of Object.keys(perConfidence)) bucketFinalize(perConfidence[k]!);
  for (const k of Object.keys(perAlignment)) bucketFinalize(perAlignment[k]!);

  return {
    totalEntries,
    totalSkips: skips.length,
    winRate: safeDiv(totalWins, totalEntries),
    avgPnlR: safeDiv(totalPnlR, totalEntries),
    totalPnlR,
    maxConsecutiveLosses: overallStreaks.maxLossStreak,
    maxDrawdownR: overallStreaks.maxDrawdownR,
    perSymbol,
    perDirection,
    perConfidence,
    perAlignment,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function rstr(n: number): string {
  return n >= 0 ? `+${n.toFixed(2)}R` : `${n.toFixed(2)}R`;
}

export function printTable(stats: OverallStats, days: number): void {
  const longCount = stats.perDirection.long.count;
  const shortCount = stats.perDirection.short.count;
  console.log(`\n=== Stage 19 Backtest — ${days} days ===`);
  console.log(`Total signals: ${stats.totalEntries + stats.totalSkips} (long ${longCount}, short ${shortCount}, skip ${stats.totalSkips})`);
  console.log(`Win rate: ${pct(stats.winRate)}`);
  console.log(`Avg pnl per trade: ${rstr(stats.avgPnlR)}`);
  console.log(`Total pnl: ${rstr(stats.totalPnlR)}`);
  console.log(`Max consecutive losses: ${stats.maxConsecutiveLosses}`);
  console.log(`Max drawdown: ${rstr(-stats.maxDrawdownR)}`);

  console.log('\n=== Per-symbol ===');
  for (const s of stats.perSymbol) {
    const entries = s.wins + s.losses + s.timeouts;
    console.log(
      `${s.symbol.padEnd(8)}  win ${pct(s.winRate).padEnd(6)} (${entries} entries / ${s.skipCount} skip)  avg ${rstr(s.avgPnlR).padEnd(8)} total ${rstr(s.totalPnlR)}  maxLoss ${s.maxConsecutiveLosses} ddown ${rstr(-s.maxDrawdownR)}`
    );
  }

  console.log('\n=== Per-direction ===');
  console.log(`long   ${pct(stats.perDirection.long.winRate).padEnd(6)} (${stats.perDirection.long.count})  avg ${rstr(stats.perDirection.long.avgPnlR)}`);
  console.log(`short  ${pct(stats.perDirection.short.winRate).padEnd(6)} (${stats.perDirection.short.count})  avg ${rstr(stats.perDirection.short.avgPnlR)}`);

  console.log('\n=== Per-confidence ===');
  for (const tier of ['high', 'medium', 'low']) {
    const b = stats.perConfidence[tier];
    if (!b) continue;
    console.log(`${tier.padEnd(6)} ${pct(b.winRate).padEnd(6)} (${b.count})  avg ${rstr(b.avgPnlR)}`);
  }

  console.log('\n=== Per-alignment ===');
  for (const key of ['4/4', '3/4', '2/4', '<2/4']) {
    const b = stats.perAlignment[key];
    if (!b) continue;
    console.log(`${key.padEnd(6)} ${pct(b.winRate).padEnd(6)} (${b.count})  avg ${rstr(b.avgPnlR)}`);
  }
  console.log('');
}

export function saveJson(results: BacktestResult[], stats: OverallStats, filePath: string): void {
  const payload = {
    generatedAt: new Date().toISOString(),
    stats,
    results,
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}
