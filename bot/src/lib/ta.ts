// Pure-function TA indicators. Algorithm sourced from AskBit ta-indicators.ts (read-only reference). Never imports from AskBit.

export interface TAIndicators {
  symbol: string;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  atr14: number | null;
  macdCross: {
    crossType: 'golden' | 'dead' | null;
    crossRecent: boolean;
  } | null;
  pivotLevels: {
    pivot: number;
    s1: number;
    s2: number;
    r1: number;
    r2: number;
  } | null;
  support: number | null;
  resistance: number | null;
  currentPrice: number;
  priceChange30d: number;
}

export function computeRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining periods
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const multiplier = 2 / (period + 1);
  // Seed with SMA of first `period` values
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i]! - ema) * multiplier + ema;
  }
  return ema;
}

export function computeMACD(
  closes: number[]
): { macd: number; signal: number; histogram: number } | null {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  if (ema12 == null || ema26 == null) return null;

  // Build MACD line series for signal computation
  const macdSeries: number[] = [];
  const mult12 = 2 / 13;
  const mult26 = 2 / 27;

  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

  for (let i = 26; i < closes.length; i++) {
    if (i >= 12) {
      e12 = (closes[i]! - e12) * mult12 + e12;
    }
    e26 = (closes[i]! - e26) * mult26 + e26;
    macdSeries.push(e12 - e26);
  }

  if (macdSeries.length < 9) return null;

  // Signal = 9-period EMA of MACD line
  const sigMult = 2 / 10;
  let signal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdSeries.length; i++) {
    signal = (macdSeries[i]! - signal) * sigMult + signal;
  }

  const macdValue = macdSeries[macdSeries.length - 1]!;
  return { macd: macdValue, signal, histogram: macdValue - signal };
}

/**
 * Compute Average True Range using Wilder's smoothing.
 * Requires at least period+1 data points (period TRs need period+1 candles).
 */
export function computeATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number | null {
  const len = Math.min(highs.length, lows.length, closes.length);
  if (len < period + 1) return null;

  // Compute True Range series (starts at index 1)
  const trs: number[] = [];
  for (let i = 1; i < len; i++) {
    const hl = highs[i]! - lows[i]!;
    const hpc = Math.abs(highs[i]! - closes[i - 1]!);
    const lpc = Math.abs(lows[i]! - closes[i - 1]!);
    trs.push(Math.max(hl, hpc, lpc));
  }

  if (trs.length < period) return null;

  // Seed ATR with SMA of first `period` TRs
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder's smoothing for remaining TRs
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]!) / period;
  }

  return atr;
}

/**
 * Detect MACD line crossing signal line in the last 3 bars.
 * Returns null if insufficient data for MACD computation.
 */
export function detectMACDCross(
  closes: number[]
): { crossType: 'golden' | 'dead' | null; crossRecent: boolean } | null {
  if (closes.length < 35) return null; // Need 26 + 9 minimum for MACD+signal

  // Build full MACD line series
  const mult12 = 2 / 13;
  const mult26 = 2 / 27;

  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

  const macdSeries: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    if (i >= 12) {
      e12 = (closes[i]! - e12) * mult12 + e12;
    }
    e26 = (closes[i]! - e26) * mult26 + e26;
    macdSeries.push(e12 - e26);
  }

  if (macdSeries.length < 9) return null;

  // Build signal line series
  const sigMult = 2 / 10;
  let signal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  const signalSeries: number[] = [];
  // Fill first 9 positions with NaN (no signal available)
  for (let i = 0; i < 9; i++) signalSeries.push(NaN);

  for (let i = 9; i < macdSeries.length; i++) {
    signal = (macdSeries[i]! - signal) * sigMult + signal;
    signalSeries.push(signal);
  }

  // Check last 3 bars for cross
  const len = macdSeries.length;
  if (len < 4) return { crossType: null, crossRecent: false };

  // Compute diff series (MACD - signal) for the last 4 bars
  const checkBars = Math.min(4, len);
  const diffs: number[] = [];
  for (let i = len - checkBars; i < len; i++) {
    if (isNaN(signalSeries[i]!)) {
      diffs.push(NaN);
    } else {
      diffs.push(macdSeries[i]! - signalSeries[i]!);
    }
  }

  // Look for sign changes in last 3 transitions
  for (let i = diffs.length - 1; i >= 1; i--) {
    if (isNaN(diffs[i]!) || isNaN(diffs[i - 1]!)) continue;
    const prevNeg = diffs[i - 1]! < 0;
    const currPos = diffs[i]! >= 0;
    const prevPos = diffs[i - 1]! >= 0;
    const currNeg = diffs[i]! < 0;

    if (prevNeg && currPos) {
      return { crossType: 'golden', crossRecent: true };
    }
    if (prevPos && currNeg) {
      return { crossType: 'dead', crossRecent: true };
    }
  }

  return { crossType: null, crossRecent: false };
}

/**
 * Compute standard pivot point levels from a single candle's OHLC.
 * P = (H+L+C)/3, S1 = 2P-H, R1 = 2P-L, S2 = P-(H-L), R2 = P+(H-L)
 */
export function computePivotLevels(
  high: number,
  low: number,
  close: number
): { pivot: number; s1: number; s2: number; r1: number; r2: number } {
  const pivot = (high + low + close) / 3;
  return {
    pivot,
    s1: 2 * pivot - high,
    s2: pivot - (high - low),
    r1: 2 * pivot - low,
    r2: pivot + (high - low),
  };
}
