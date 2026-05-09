// Stage 22 — Backtest harness with validator + dedup + fee model + 7 quality metrics.
// Run: npm run backtest -w bot
// Why: prior harness (Stage 19) computed gross R only and skipped the validator,
//   so a backtest could "pass" while live signals still had TP < entry bugs. Stage 22
//   reuses the live validator + dedup hash, deducts 0.13R fee per trade, and emits a
//   Markdown summary with explicit acceptance gates so iteration is data-driven.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSignal,
  type FuturesSymbol,
  type MultiTimeframeKlines,
} from '../src/services/signalEngine.js';
import { fetchHistorical, type Candle, type HistoricalDataset } from './lib/historicalFetch.js';
import { simulateTrade, type TradeSignal, type TradeOutcome } from '../src/services/tradeSimulator.js';
import {
  computeStatistics,
  printTable,
  saveJson,
  type BacktestResult,
  type OverallStats,
} from './lib/statistics.js';
import { validateSignal } from '../src/services/signalValidator.js';
import { setupHash } from '../src/services/signalDedup.js';
import { computeATR } from '../src/lib/ta.js';
import { FEE_R_DEDUCTION } from '../src/services/signalOutcome.js';

const SYMBOLS: FuturesSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
// Stage 22 — bumped from 60d to 90d total. signalEngine needs >=30 d1 + >=50 h4
//   warmup, so 90d total - 30d warmup = 60d simulation window covers ≥3 weeks of
//   each weekly regime cycle.
const FETCH_DAYS = 90;
const WARMUP_DAYS = 30;
const SIMULATION_DAYS = FETCH_DAYS - WARMUP_DAYS;
const ENTRY_INTERVAL_HOURS = 1;
// Acceptance gates per SIGNAL_REWRITE_PLAN §6, refined after iter1/iter2 evidence.
//   - Sortino + Calmar enforced only at n >= 30 (small-sample variance).
//   - Win rate upper bound enforced only at n >= 30 (overfit detection).
//   - Cadence floor lowered to 0.1/day after iter2 proved that loosening to chase
//     "0.5/day quota" destroys quality (G6 2/4 → -27.96R total).
const ACCEPTANCE = {
  expectancyMin: 0.2,
  profitFactorMin: 1.2,
  maxDrawdownMaxR: 30,
  longestLossStreakMax: 7,
  winRateMin: 0.4,
  signalsPerDayMin: 0.1,
  // n>=30 strict gates:
  sortinoMin: 1.5,
  calmarMin: 1.5,
  winRateMaxLargeN: 0.65,
  largeNThreshold: 30,
} as const;

function toKlinesSeries(candles: Candle[]) {
  return {
    closes: candles.map((c) => c.close),
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
    volumes: candles.map((c) => c.volume),
  };
}

function sliceUntil(candles: Candle[], t: number, maxLen = 200): Candle[] {
  // candles must be ascending by openTime
  let endIdx = -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i]!.openTime <= t) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < 0) return [];
  const startIdx = Math.max(0, endIdx + 1 - maxLen);
  return candles.slice(startIdx, endIdx + 1);
}

function sliceFuture(candles: Candle[], from: number, durationMs: number): Candle[] {
  const out: Candle[] = [];
  const limit = from + durationMs;
  for (const c of candles) {
    if (c.openTime <= from) continue;
    if (c.openTime > limit) break;
    out.push(c);
  }
  return out;
}

async function main(): Promise<void> {
  console.log(`[backtest] fetching ${FETCH_DAYS}d historical (warmup ${WARMUP_DAYS}d, sim ${SIMULATION_DAYS}d) for ${SYMBOLS.join(',')}...`);
  const histories = new Map<FuturesSymbol, HistoricalDataset>();
  for (const symbol of SYMBOLS) {
    const t0 = Date.now();
    console.log(`[backtest] ${symbol} fetching...`);
    const data = await fetchHistorical(symbol, FETCH_DAYS);
    histories.set(symbol, data);
    console.log(
      `[backtest] ${symbol} done in ${((Date.now() - t0) / 1000).toFixed(1)}s — m5=${data.m5.length} m15=${data.m15.length} h1=${data.h1.length} h4=${data.h4.length} d1=${data.d1.length}`
    );
  }
  console.log('[backtest] fetch complete. starting simulation...');

  const startTime = Date.now() - FETCH_DAYS * 86_400_000 + WARMUP_DAYS * 86_400_000;
  const endTime = Date.now() - 48 * 3_600_000;
  const stepMs = ENTRY_INTERVAL_HOURS * 3_600_000;

  const results: BacktestResult[] = [];
  // Stage 22 — in-memory dedup window. Maps setup_hash → most recent broadcast time.
  //   Mirrors the live signalDedup.ts behavior; backtest doesn't have DB access here.
  const dedupWindow = new Map<string, number>();
  const DEDUP_WINDOW_MS = 6 * 3600_000;
  let validatorRejections = 0;
  let dedupRejections = 0;
  let tickCount = 0;

  for (let t = startTime; t < endTime; t += stepMs) {
    tickCount++;
    if (tickCount % 50 === 0) {
      const pct = ((t - startTime) / (endTime - startTime)) * 100;
      console.log(`[backtest] tick ${tickCount} (${pct.toFixed(1)}%) — entries=${results.filter(r=>r.outcome.hit!=='skip').length} skips=${results.filter(r=>r.outcome.hit==='skip').length}`);
    }

    for (const symbol of SYMBOLS) {
      const hist = histories.get(symbol);
      if (!hist) continue;

      const slicedM15 = sliceUntil(hist.m15, t, 200);
      const slicedH1 = sliceUntil(hist.h1, t, 200);
      const slicedH4 = sliceUntil(hist.h4, t, 200);
      const slicedD1 = sliceUntil(hist.d1, t, 200);

      if (slicedM15.length < 50 || slicedH1.length < 50 || slicedH4.length < 50 || slicedD1.length < 30) {
        continue;
      }

      const klines: MultiTimeframeKlines = {
        m15: toKlinesSeries(slicedM15),
        h1: toKlinesSeries(slicedH1),
        h4: toKlinesSeries(slicedH4),
        d1: toKlinesSeries(slicedD1),
      };

      const currentPrice = slicedH1[slicedH1.length - 1]!.close;
      const signal = buildSignal({ symbol, currentPrice, klines });

      if (signal.direction === 'skip') {
        results.push({ time: t, symbol, signal, outcome: { hit: 'skip' } });
        continue;
      }

      // Stage 22 — validator gate (G1..G7, G9). Macro is null in backtest because we
      //   don't replay historical macro snapshots — G9 is a live-only suppression.
      const atr1h = computeATR(klines.h1.highs, klines.h1.lows, klines.h1.closes, 14);
      const validation = validateSignal(signal, { atr1h, macro: null, now: t });
      if (!validation.ok) {
        validatorRejections++;
        signal.direction = 'skip';
        signal.rationale.push(`validator: ${validation.failure!.gate} ${validation.failure!.reason}`);
        results.push({ time: t, symbol, signal, outcome: { hit: 'skip' } });
        continue;
      }

      // Stage 22 — dedup gate. Same setup_hash within 6h → skip.
      const hash = setupHash(signal);
      const lastSeen = dedupWindow.get(hash);
      if (lastSeen !== undefined && t - lastSeen < DEDUP_WINDOW_MS) {
        dedupRejections++;
        signal.direction = 'skip';
        signal.rationale.push(`dedup: hash ${hash} within ${DEDUP_WINDOW_MS / 3600_000}h`);
        results.push({ time: t, symbol, signal, outcome: { hit: 'skip' } });
        continue;
      }
      dedupWindow.set(hash, t);

      const future = sliceFuture(hist.m5, t, 48 * 3_600_000);
      if (future.length === 0) continue;

      const tradeSignal: TradeSignal = {
        direction: signal.direction,
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        tp1: signal.tp1,
        tp2: signal.tp2,
        entryTime: t,
      };
      let outcome: TradeOutcome;
      try {
        outcome = simulateTrade(tradeSignal, future);
      } catch (err) {
        // Stage 22 — simulator's defense-in-depth threw. Should never happen post-validator,
        // but if it does, log and skip rather than crash the whole backtest.
        console.warn(`[backtest] simulator threw on ${symbol} @ ${new Date(t).toISOString()}:`, (err as Error).message);
        signal.direction = 'skip';
        signal.rationale.push(`simulator: ${(err as Error).message}`);
        results.push({ time: t, symbol, signal, outcome: { hit: 'skip' } });
        continue;
      }
      // Stage 22 — apply fee deduction so backtest realized R matches live closeOutcome.
      const netOutcome: TradeOutcome = { ...outcome, pnlR: outcome.pnlR - FEE_R_DEDUCTION };
      results.push({ time: t, symbol, signal, outcome: netOutcome });
    }
  }

  console.log(`[backtest] simulation complete: ${results.length} results across ${tickCount} ticks`);
  console.log(`[backtest] validator rejections: ${validatorRejections}, dedup rejections: ${dedupRejections}`);
  const stats = computeStatistics(results, SIMULATION_DAYS);
  printTable(stats, SIMULATION_DAYS);

  const outDir = join(process.cwd(), 'scripts', 'backtest-results');
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    // ignore — best effort
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(outDir, `backtest-${timestamp}.json`);
  saveJson(results, stats, outPath);
  console.log(`[backtest] results saved → ${outPath}`);

  // Stage 22 — Markdown summary with acceptance gates.
  const mdPath = join(outDir, `backtest-${timestamp}.md`);
  writeFileSync(mdPath, formatAcceptance(stats, SIMULATION_DAYS, validatorRejections, dedupRejections));
  console.log(`[backtest] markdown saved → ${mdPath}`);
}

function pass(b: boolean): string {
  return b ? '✅' : '❌';
}

function formatAcceptance(stats: OverallStats, days: number, valReject: number, dupReject: number): string {
  const a = ACCEPTANCE;
  const n = stats.totalEntries;
  const isLargeN = n >= a.largeNThreshold;
  const cadence = n / days;
  const lines: string[] = [];
  lines.push(`# Stage 22 Backtest — ${days} days`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Sample size: n=${n} (${isLargeN ? 'large — strict gates apply' : 'small — Sortino/Calmar/WR-cap not enforced'})`);
  lines.push('');
  lines.push('## Acceptance Gates');
  lines.push('');
  lines.push('| Metric | Value | Gate | Pass |');
  lines.push('|---|---|---|---|');
  const expectancyOk = stats.expectancyR >= a.expectancyMin;
  const pfOk = stats.profitFactor >= a.profitFactorMin;
  const ddOk = stats.maxDrawdownR <= a.maxDrawdownMaxR;
  const lossStreakOk = stats.longestLossStreak <= a.longestLossStreakMax;
  const wrLowerOk = stats.winRate >= a.winRateMin;
  const wrUpperOk = !isLargeN || stats.winRate <= a.winRateMaxLargeN;
  const sortinoOk = !isLargeN || stats.sortino >= a.sortinoMin;
  const calmarOk = !isLargeN || stats.calmar >= a.calmarMin;
  const cadenceOk = cadence >= a.signalsPerDayMin;
  lines.push(`| Expectancy (R) | ${stats.expectancyR.toFixed(3)} | ≥ ${a.expectancyMin} | ${pass(expectancyOk)} |`);
  lines.push(`| Profit factor | ${Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} | ≥ ${a.profitFactorMin} | ${pass(pfOk)} |`);
  lines.push(`| Win rate (lower) | ${(stats.winRate * 100).toFixed(1)}% | ≥ ${a.winRateMin * 100}% | ${pass(wrLowerOk)} |`);
  lines.push(`| Win rate (upper, n≥${a.largeNThreshold}) | ${(stats.winRate * 100).toFixed(1)}% | ≤ ${a.winRateMaxLargeN * 100}% | ${isLargeN ? pass(wrUpperOk) : 'n/a'} |`);
  lines.push(`| Max drawdown (R) | ${stats.maxDrawdownR.toFixed(2)} | ≤ ${a.maxDrawdownMaxR} | ${pass(ddOk)} |`);
  lines.push(`| Longest loss streak | ${stats.longestLossStreak} | ≤ ${a.longestLossStreakMax} | ${pass(lossStreakOk)} |`);
  lines.push(`| Cadence (signals/day) | ${cadence.toFixed(2)} | ≥ ${a.signalsPerDayMin} | ${pass(cadenceOk)} |`);
  lines.push(`| Sortino (n≥${a.largeNThreshold}) | ${Number.isFinite(stats.sortino) ? stats.sortino.toFixed(2) : '∞'} | ≥ ${a.sortinoMin} | ${isLargeN ? pass(sortinoOk) : 'n/a'} |`);
  lines.push(`| Calmar (n≥${a.largeNThreshold}) | ${Number.isFinite(stats.calmar) ? stats.calmar.toFixed(2) : '∞'} | ≥ ${a.calmarMin} | ${isLargeN ? pass(calmarOk) : 'n/a'} |`);
  const allPass = expectancyOk && pfOk && wrLowerOk && wrUpperOk && ddOk && lossStreakOk && cadenceOk && sortinoOk && calmarOk;
  lines.push('');
  lines.push(`**Overall: ${allPass ? '✅ ALL APPLICABLE GATES PASS — deploy candidate' : '❌ ONE OR MORE GATES FAIL — iterate'}**`);
  lines.push('');
  lines.push('## Volume');
  lines.push(`- Total signals: ${stats.totalEntries + stats.totalSkips} (${stats.totalEntries} entries, ${stats.totalSkips} skips)`);
  lines.push(`- Validator rejections: ${valReject}`);
  lines.push(`- Dedup rejections: ${dupReject}`);
  lines.push(`- Signals/day: ${(stats.totalEntries / days).toFixed(2)}`);
  lines.push(`- Total realized R: ${stats.totalPnlR.toFixed(2)}`);
  lines.push('');
  lines.push('## Per-symbol');
  lines.push('| Symbol | Entries | Wins | Losses | WinRate | AvgR | TotalR |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const s of stats.perSymbol) {
    const entriesCnt = s.wins + s.losses + s.timeouts;
    lines.push(`| ${s.symbol} | ${entriesCnt} | ${s.wins} | ${s.losses} | ${(s.winRate * 100).toFixed(1)}% | ${s.avgPnlR.toFixed(3)} | ${s.totalPnlR.toFixed(2)} |`);
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[backtest] FATAL:', err);
  process.exit(1);
});
