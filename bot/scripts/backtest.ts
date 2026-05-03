// Stage 19 — Backtest harness for R:R Hardening verification.
// Run: npm run backtest -w bot
// Why: validate that the Gate + SL cap actually improve realized R, not just look good in code.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSignal,
  type FuturesSymbol,
  type MultiTimeframeKlines,
} from '../src/services/signalEngine.js';
import { fetchHistorical, type Candle, type HistoricalDataset } from './lib/historicalFetch.js';
import { simulateTrade, type TradeSignal } from '../src/services/tradeSimulator.js';
import {
  computeStatistics,
  printTable,
  saveJson,
  type BacktestResult,
} from './lib/statistics.js';

const SYMBOLS: FuturesSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
// Why: signalEngine needs >=30 d1 candles + >=50 h4 candles for warmup. Fetch 60d total,
// reserve first 30d as warmup so the 30d simulation window has full TA depth.
const FETCH_DAYS = 60;
const WARMUP_DAYS = 30;
const SIMULATION_DAYS = FETCH_DAYS - WARMUP_DAYS;
const ENTRY_INTERVAL_HOURS = 1;

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
  let tickCount = 0;

  for (let t = startTime; t < endTime; t += stepMs) {
    tickCount++;
    if (tickCount % 50 === 0) {
      const pct = ((t - startTime) / (endTime - startTime)) * 100;
      console.log(`[backtest] tick ${tickCount} (${pct.toFixed(1)}%) — results so far: ${results.length}`);
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
      const outcome = simulateTrade(tradeSignal, future);
      results.push({ time: t, symbol, signal, outcome });
    }
  }

  console.log(`[backtest] simulation complete: ${results.length} results across ${tickCount} ticks`);
  const stats = computeStatistics(results);
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
}

main().catch((err) => {
  console.error('[backtest] FATAL:', err);
  process.exit(1);
});
