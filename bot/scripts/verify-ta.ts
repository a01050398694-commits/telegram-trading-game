// Offline verification harness for bot/src/lib/ta.ts.
// Run: npm run verify:ta -w bot
// Hardcoded 50-day BTC daily candle series (uptrend → pullback → recovery).

import {
  computeRSI,
  computeSMA,
  computeEMA,
  computeMACD,
  computeATR,
  detectMACDCross,
  computePivotLevels,
} from '../src/lib/ta.js';

const closes: number[] = [
  60000, 60500, 61200, 61800, 62500, 63100, 63800, 64200, 65000, 65500,
  66200, 66800, 67500, 68100, 68800, 69200, 70100, 69500, 68800, 67900,
  67000, 66200, 65500, 64800, 64200, 63800, 63500, 63800, 64500, 65200,
  66000, 66800, 67500, 68200, 69000, 69800, 70500, 71200, 70800, 70200,
  69500, 68800, 68200, 68500, 69200, 69800, 70500, 71200, 71800, 72500,
];

const highs: number[] = closes.map((c) => c + 400);
const lows: number[] = closes.map((c) => c - 400);

const lastIdx = closes.length - 1;
const lastClose = closes[lastIdx]!;
const lastHigh = highs[lastIdx]!;
const lastLow = lows[lastIdx]!;

console.log(`[verify-ta] series length=${closes.length}, last close=${lastClose}, last high=${lastHigh}, last low=${lastLow}\n`);

const rsi = computeRSI(closes, 14);
console.log('[RSI(14)]    ', rsi);

const sma20 = computeSMA(closes, 20);
console.log('[SMA(20)]    ', sma20);

const ema12 = computeEMA(closes, 12);
console.log('[EMA(12)]    ', ema12);

const macd = computeMACD(closes);
console.log('[MACD]       ', macd);

const atr = computeATR(highs, lows, closes, 14);
console.log('[ATR(14)]    ', atr);

const cross = detectMACDCross(closes);
console.log('[MACD Cross] ', cross);

const pivot = computePivotLevels(lastHigh, lastLow, lastClose);
console.log('[Pivot]      ', pivot);

// Inline assertions — fail loud on obvious bugs.
if (rsi === null || rsi < 0 || rsi > 100) {
  throw new Error(`RSI out of [0,100]: ${rsi}`);
}
if (atr === null || atr <= 0) {
  throw new Error(`ATR not positive: ${atr}`);
}
if (pivot.pivot < lastLow || pivot.pivot > lastHigh) {
  throw new Error(`pivot ${pivot.pivot} not between low ${lastLow} and high ${lastHigh}`);
}
if (macd === null || !Number.isFinite(macd.macd) || !Number.isFinite(macd.signal)) {
  throw new Error(`MACD not finite: ${JSON.stringify(macd)}`);
}

console.log('\n[verify-ta] all assertions passed.');
