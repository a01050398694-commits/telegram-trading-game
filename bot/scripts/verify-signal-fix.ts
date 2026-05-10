// One-off verification that Stage 22 dropInProgress + bumped fetch limit produce
// a usable closed-bar series for SMA200. Run after the 2026-05-10 broadcast blackout fix.
//
// Run: npx tsx bot/scripts/verify-signal-fix.ts

import {
  fetchMultiTimeframeKlines,
  dropInProgress,
  type FuturesSymbol,
} from '../src/services/marketData.js';
import { buildSignal } from '../src/services/signalEngine.js';
import { computeSMA, computeATR } from '../src/lib/ta.js';
import { validateSignal } from '../src/services/signalValidator.js';

const SYMBOLS: FuturesSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

async function main(): Promise<void> {
  let allOk = true;
  for (const sym of SYMBOLS) {
    const mtf = await fetchMultiTimeframeKlines(sym);
    if (!mtf) {
      console.log(`[${sym}] fetchMultiTimeframeKlines null — likely Binance.US 451`);
      allOk = false;
      continue;
    }
    const closed = {
      m15: dropInProgress(mtf.m15),
      h1: dropInProgress(mtf.h1),
      h4: dropInProgress(mtf.h4),
      d1: dropInProgress(mtf.d1),
    };
    const lens = {
      m15: closed.m15.closes.length,
      h1: closed.h1.closes.length,
      h4: closed.h4.closes.length,
      d1: closed.d1.closes.length,
    };
    const sma200 = {
      m15: computeSMA(closed.m15.closes, 200),
      h1: computeSMA(closed.h1.closes, 200),
      h4: computeSMA(closed.h4.closes, 200),
      d1: computeSMA(closed.d1.closes, 200),
    };
    const allSma200Ok =
      sma200.m15 != null && sma200.h1 != null && sma200.h4 != null && sma200.d1 != null;
    if (!allSma200Ok) allOk = false;

    const lastClose = mtf.h1.closes.at(-1) ?? 0;
    const signal = buildSignal({ symbol: sym, currentPrice: lastClose, klines: closed });
    const atr1h = computeATR(closed.h1.highs, closed.h1.lows, closed.h1.closes, 14);
    const validation = signal.direction === 'skip'
      ? { ok: true as const }
      : validateSignal(signal, { atr1h, macro: null, now: Date.now() });
    const validatorTag = signal.direction === 'skip'
      ? 'n/a'
      : validation.ok
        ? 'PASS_ALL_GATES → would broadcast'
        : `FAIL ${validation.failure?.gate} (${validation.failure?.reason})`;

    console.log(
      `[${sym}] closed=m15:${lens.m15} h1:${lens.h1} h4:${lens.h4} d1:${lens.d1} | sma200ok=${allSma200Ok} | dir=${signal.direction} score=${signal.score} alignment=m15:${signal.multiTimeframeAlignment.m15} h1:${signal.multiTimeframeAlignment.h1} h4:${signal.multiTimeframeAlignment.h4} d1:${signal.multiTimeframeAlignment.d1} vol=${signal.volumeConfirmation} | validator=${validatorTag}`,
    );
  }
  if (!allOk) {
    console.error('\n[verify-signal-fix] FAILED — at least one symbol has SMA200 null after dropInProgress');
    process.exit(1);
  }
  console.log('\n[verify-signal-fix] OK — every symbol has >=200 closed bars after dropInProgress and SMA200 resolves on every TF');
}

main().catch((err) => {
  console.error('[verify-signal-fix] threw:', err);
  process.exit(1);
});
