// Smoke test for marketData.ts + fearGreed.ts collectors.
// Run: npm run smoke:data -w bot
// Requires live internet (calls Binance Futures + alternative.me).

import { fetchKlines, fetchFundingAndOI, type FuturesSymbol } from '../src/services/marketData.js';
import { fetchFearGreed } from '../src/services/fearGreed.js';

const SYMBOLS: FuturesSymbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

async function main(): Promise<void> {
  console.log('[smoke-data] start\n');

  // 1) fetchKlines for all 4 symbols.
  for (const sym of SYMBOLS) {
    const t0 = Date.now();
    const series = await fetchKlines(sym, 200);
    const elapsed = Date.now() - t0;
    if (!series) {
      console.log(`[klines:${sym}] FAILED (null) elapsed=${elapsed}ms`);
      continue;
    }
    const last = series.closes[series.closes.length - 1];
    console.log(
      `[klines:${sym}] closes.length=${series.closes.length} highs.length=${series.highs.length} lows.length=${series.lows.length} lastClose=${last} elapsed=${elapsed}ms`
    );
  }

  console.log();

  // 2) fetchFundingAndOI for all 4 symbols.
  for (const sym of SYMBOLS) {
    const data = await fetchFundingAndOI(sym);
    if (!data) {
      console.log(`[funding/oi:${sym}] FAILED (null)`);
      continue;
    }
    console.log(
      `[funding/oi:${sym}] fundingRate=${data.fundingRate} openInterest=${data.openInterest} longShortRatio=${data.longShortRatio}`
    );
  }

  console.log();

  // 3) fetchFearGreed.
  const fgi = await fetchFearGreed();
  if (!fgi) {
    console.log('[fgi] FAILED (null)');
  } else {
    console.log(`[fgi] value=${fgi.value} label="${fgi.label}" timestamp=${fgi.timestamp}`);
  }

  console.log();

  // 4) Cache hit check: 2nd fetchKlines for BTCUSDT should be near-instant + same reference.
  const t1Start = Date.now();
  const first = await fetchKlines('BTCUSDT', 200);
  const t1 = Date.now() - t1Start;
  const t2Start = Date.now();
  const second = await fetchKlines('BTCUSDT', 200);
  const t2 = Date.now() - t2Start;
  const sameRef = first !== null && second !== null && first === second;
  console.log(
    `[cache] 1st call=${t1}ms (cached from earlier loop), 2nd call=${t2}ms, same reference=${sameRef}`
  );
  if (!sameRef) {
    throw new Error('cache hit failed: 2nd fetchKlines returned different object reference');
  }
  if (t2 > 50) {
    throw new Error(`cache hit failed: 2nd call too slow (${t2}ms, expected <50ms)`);
  }

  console.log('\n[smoke-data] all checks passed.');
}

main().catch((err) => {
  console.error('[smoke-data] error:', err);
  process.exit(1);
});
