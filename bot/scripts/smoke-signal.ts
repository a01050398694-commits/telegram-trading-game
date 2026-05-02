// Smoke test for Stage 17 C12: multi-TF signal engine + AI commentary.
// Run: npm run smoke:signal -w bot
// Hits live Binance.US (4 timeframes) + alternative.me + (optionally) OpenAI for the commentary call.
// Requires OPENAI_API_KEY in env for the AI step (otherwise plain fallback prints).

import {
  fetchMultiTimeframeKlines,
  type FuturesSymbol,
} from '../src/services/marketData.js';
import { buildSignal, type Signal } from '../src/services/signalEngine.js';
import { getSignalCommentary } from '../src/services/ai.js';
import { getFullMacroSnapshot } from '../src/services/macroBundle.js';
import { env } from '../src/env.js';

const SYMBOLS: FuturesSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

async function main(): Promise<void> {
  console.log(`[smoke-signal] start (SIGNAL_CRON_DRY_RUN=${env.SIGNAL_CRON_DRY_RUN})\n`);

  const macro = await getFullMacroSnapshot();
  console.log(
    `[macro] collected=${macro.collectedSources.length}/8 failed=${macro.failedSources.join(',') || 'none'}\n`
  );

  const signals: Signal[] = [];
  for (const sym of SYMBOLS) {
    const mtf = await fetchMultiTimeframeKlines(sym);
    if (!mtf) {
      console.log(`[${sym}] fetchMultiTimeframeKlines null — skipping`);
      continue;
    }
    const lastClose = mtf.h1.closes.at(-1) ?? 0;

    const signal = buildSignal({
      symbol: sym,
      currentPrice: lastClose,
      klines: mtf,
    });

    signals.push(signal);

    console.log(`[signal:${sym}]`);
    console.log(`  direction   = ${signal.direction}`);
    console.log(`  confidence  = ${signal.confidence}`);
    console.log(`  score       = ${signal.score}`);
    console.log(
      `  alignment   = m15=${signal.multiTimeframeAlignment.m15} h1=${signal.multiTimeframeAlignment.h1} h4=${signal.multiTimeframeAlignment.h4} d1=${signal.multiTimeframeAlignment.d1} score=${signal.multiTimeframeAlignment.alignmentScore}`
    );
    console.log(
      `  structure   = ${signal.structure.trend} swingH=${signal.structure.recentSwingHigh.toFixed(2)} swingL=${signal.structure.recentSwingLow.toFixed(2)} bos=${signal.structure.bosDetected}`
    );
    console.log(
      `  keyLevels   = R=${signal.keyLevels.nearestResistance.toFixed(2)} S=${signal.keyLevels.nearestSupport.toFixed(2)} P=${signal.keyLevels.pivot.toFixed(2)}`
    );
    console.log(
      `  divergence  = bullish=${signal.divergence.bullish} bearish=${signal.divergence.bearish}`
    );
    console.log(`  volume      = ${signal.volumeConfirmation}`);
    console.log(
      `  entry/sl    = ${signal.entry.toFixed(2)} / ${signal.stopLoss.toFixed(2)}`
    );
    console.log(`  tp1/tp2     = ${signal.tp1.toFixed(2)} / ${signal.tp2.toFixed(2)}`);
    console.log(`  leverage    = ${signal.leverage}x`);
    console.log(`  rationale   = ${JSON.stringify(signal.rationale)}\n`);
  }

  // Pick first non-skip signal for the AI commentary; if all skipped, use first signal as-is.
  const target = signals.find((s) => s.direction !== 'skip') ?? signals[0];
  if (!target) {
    console.log('[smoke-signal] no signals built — exiting');
    return;
  }

  console.log(`[ai] requesting commentary for ${target.direction} ${target.symbol}...`);
  const commentary = await getSignalCommentary({ ...target, macro });
  console.log('\n[ai] commentary:\n');
  console.log(commentary);

  console.log('\n[smoke-signal] done.');
}

main().catch((err) => {
  console.error('[smoke-signal] error:', err);
  process.exit(1);
});
