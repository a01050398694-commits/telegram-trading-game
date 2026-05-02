// Smoke test for Chunk 3: signalEngine + AI commentary.
// Run: npm run smoke:signal -w bot
// Hits live Binance Futures + alternative.me + (optionally) OpenAI for the commentary call.
// Requires OPENAI_API_KEY in env for the AI step (otherwise plain fallback prints).

import {
  fetchKlines,
  fetchFundingAndOI,
  type FuturesSymbol,
} from '../src/services/marketData.js';
import { fetchFearGreed } from '../src/services/fearGreed.js';
import { computeAllIndicators } from '../src/cron/signalCron.js';
import { buildSignal, type Signal } from '../src/services/signalEngine.js';
import { getSignalCommentary } from '../src/services/ai.js';
import { env } from '../src/env.js';

const SYMBOLS: FuturesSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

async function main(): Promise<void> {
  console.log(`[smoke-signal] start (SIGNAL_CRON_DRY_RUN=${env.SIGNAL_CRON_DRY_RUN})\n`);

  const fgi = await fetchFearGreed();
  const fgiValue = fgi?.value ?? null;
  console.log(`[fgi] value=${fgiValue} label=${fgi?.label ?? 'null'}\n`);

  const signals: Signal[] = [];
  for (const sym of SYMBOLS) {
    const klines = await fetchKlines(sym, 200);
    if (!klines) {
      console.log(`[${sym}] fetchKlines null — skipping`);
      continue;
    }
    const fundingOI = await fetchFundingAndOI(sym);
    const lastClose = klines.closes.at(-1) ?? 0;
    const indicators = computeAllIndicators(klines.closes, klines.highs, klines.lows, sym);

    const signal = buildSignal({
      symbol: sym,
      currentPrice: lastClose,
      indicators,
      fundingRate: fundingOI?.fundingRate ?? null,
      fearGreed: fgiValue,
    });

    signals.push(signal);

    console.log(`[signal:${sym}]`);
    console.log(`  direction = ${signal.direction}`);
    console.log(`  score     = ${signal.score}`);
    console.log(`  current   = ${signal.currentPrice}`);
    console.log(`  entry     = ${signal.entry}`);
    console.log(`  stopLoss  = ${signal.stopLoss}`);
    console.log(`  tp1       = ${signal.tp1}`);
    console.log(`  tp2       = ${signal.tp2}`);
    console.log(`  rationale = ${JSON.stringify(signal.rationale)}\n`);
  }

  // Pick first non-skip signal for the AI commentary; if all skipped, force-build a 'long' for demo.
  const nonSkip = signals.find((s) => s.direction !== 'skip');
  const target: Signal =
    nonSkip ??
    (signals[0]
      ? { ...signals[0], direction: 'long', entry: signals[0].currentPrice * 1.003, stopLoss: signals[0].currentPrice * 0.97, tp1: signals[0].currentPrice * 1.03, tp2: signals[0].currentPrice * 1.06, rationale: ['demo: forced long for AI commentary smoke'] }
      : { symbol: 'BTCUSDT', direction: 'long', score: 0, currentPrice: 70000, entry: 70210, stopLoss: 68000, tp1: 72000, tp2: 74000, rationale: ['demo'] });

  console.log(`[ai] requesting commentary for ${target.direction} ${target.symbol}...`);
  const commentary = await getSignalCommentary({
    symbol: target.symbol,
    direction: target.direction,
    currentPrice: target.currentPrice,
    entry: target.entry,
    stopLoss: target.stopLoss,
    tp1: target.tp1,
    tp2: target.tp2,
    rationale: target.rationale,
  });
  console.log('\n[ai] commentary:\n');
  console.log(commentary);

  console.log('\n[smoke-signal] done.');
}

main().catch((err) => {
  console.error('[smoke-signal] error:', err);
  process.exit(1);
});
