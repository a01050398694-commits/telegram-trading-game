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

// ===== Stage 17 C12 — multi-TF / structure / divergence helpers =====

export interface SwingPoint {
  index: number;
  value: number;
}

export interface SwingPoints {
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
}

export interface MarketStructure {
  trend: 'bullish' | 'bearish' | 'ranging';
  recentSwingHigh: number;
  recentSwingLow: number;
  bosDetected: boolean;
}

export interface KeyLevels {
  nearestResistance: number;
  nearestSupport: number;
}

/**
 * Detect swing highs/lows by lookback comparison: a swing high is a bar whose
 * `high` strictly exceeds the highs of the `lookback` bars on either side. Mirror for lows.
 * Why: structure-based analysis (HH/HL, LH/LL) needs discrete pivots, not raw highs.
 */
export function detectSwingHighsLows(
  highs: number[],
  lows: number[],
  lookback = 5
): SwingPoints {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  const n = Math.min(highs.length, lows.length);

  for (let i = lookback; i < n - lookback; i++) {
    const h = highs[i]!;
    let isSwingHigh = true;
    for (let j = 1; j <= lookback && isSwingHigh; j++) {
      if (highs[i - j]! >= h || highs[i + j]! >= h) isSwingHigh = false;
    }
    if (isSwingHigh) swingHighs.push({ index: i, value: h });

    const l = lows[i]!;
    let isSwingLow = true;
    for (let j = 1; j <= lookback && isSwingLow; j++) {
      if (lows[i - j]! <= l || lows[i + j]! <= l) isSwingLow = false;
    }
    if (isSwingLow) swingLows.push({ index: i, value: l });
  }

  return { swingHighs, swingLows };
}

/**
 * Determine market structure from the last 2 swing highs and lows.
 * Bullish = HH+HL, Bearish = LH+LL, otherwise Ranging.
 * BOS (break of structure) = current close beyond the most recent swing in the trend direction.
 */
export function detectMarketStructure(
  closes: number[],
  highs: number[],
  lows: number[],
  lookback = 5
): MarketStructure {
  const swings = detectSwingHighsLows(highs, lows, lookback);
  const sh = swings.swingHighs;
  const sl = swings.swingLows;

  const recentSwingHigh =
    sh.length > 0 ? sh[sh.length - 1]!.value : highs.length > 0 ? Math.max(...highs) : 0;
  const recentSwingLow =
    sl.length > 0 ? sl[sl.length - 1]!.value : lows.length > 0 ? Math.min(...lows) : 0;

  if (sh.length < 2 || sl.length < 2) {
    return { trend: 'ranging', recentSwingHigh, recentSwingLow, bosDetected: false };
  }

  const lastHigh = sh[sh.length - 1]!.value;
  const prevHigh = sh[sh.length - 2]!.value;
  const lastLow = sl[sl.length - 1]!.value;
  const prevLow = sl[sl.length - 2]!.value;

  const hh = lastHigh > prevHigh;
  const hl = lastLow > prevLow;
  const lh = lastHigh < prevHigh;
  const ll = lastLow < prevLow;

  let trend: 'bullish' | 'bearish' | 'ranging';
  if (hh && hl) trend = 'bullish';
  else if (lh && ll) trend = 'bearish';
  else trend = 'ranging';

  const lastClose = closes[closes.length - 1] ?? 0;
  const bosDetected =
    (trend === 'bullish' && lastClose > recentSwingHigh) ||
    (trend === 'bearish' && lastClose < recentSwingLow);

  return { trend, recentSwingHigh, recentSwingLow, bosDetected };
}

/**
 * RSI series — same Wilder smoothing as computeRSI but emits one value per bar
 * (null for the warm-up window).
 */
export function computeRSISeries(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = closes.map(() => null);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) result[period] = 100;
  else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) result[i] = 100;
    else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

/**
 * Detect bullish/bearish RSI divergence on the last 2 swings.
 * Bullish: price LL but RSI HL. Bearish: price HH but RSI LH.
 */
export function detectRSIDivergence(
  closes: number[],
  highs: number[],
  lows: number[],
  rsiPeriod = 14,
  lookback = 5
): { bullish: boolean; bearish: boolean } {
  if (closes.length < rsiPeriod + 5) return { bullish: false, bearish: false };

  const rsiSeries = computeRSISeries(closes, rsiPeriod);
  const swings = detectSwingHighsLows(highs, lows, lookback);

  let bullish = false;
  let bearish = false;

  if (swings.swingLows.length >= 2) {
    const last = swings.swingLows[swings.swingLows.length - 1]!;
    const prev = swings.swingLows[swings.swingLows.length - 2]!;
    const rsiLast = rsiSeries[last.index];
    const rsiPrev = rsiSeries[prev.index];
    if (rsiLast != null && rsiPrev != null && last.value < prev.value && rsiLast > rsiPrev) {
      bullish = true;
    }
  }

  if (swings.swingHighs.length >= 2) {
    const last = swings.swingHighs[swings.swingHighs.length - 1]!;
    const prev = swings.swingHighs[swings.swingHighs.length - 2]!;
    const rsiLast = rsiSeries[last.index];
    const rsiPrev = rsiSeries[prev.index];
    if (rsiLast != null && rsiPrev != null && last.value > prev.value && rsiLast < rsiPrev) {
      bearish = true;
    }
  }

  return { bullish, bearish };
}

/**
 * Closest swing high above price (resistance) and closest swing low below price (support).
 * Falls back to extreme swing if no swing on the relevant side.
 */
export function findNearestSupportResistance(
  currentPrice: number,
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[]
): KeyLevels {
  let nearestResistance = Infinity;
  let nearestSupport = 0;

  for (const h of swingHighs) {
    if (h.value > currentPrice && h.value < nearestResistance) {
      nearestResistance = h.value;
    }
  }
  for (const l of swingLows) {
    if (l.value < currentPrice && l.value > nearestSupport) {
      nearestSupport = l.value;
    }
  }

  if (!Number.isFinite(nearestResistance)) {
    nearestResistance =
      swingHighs.length > 0 ? swingHighs[swingHighs.length - 1]!.value : currentPrice * 1.05;
  }
  if (nearestSupport === 0) {
    nearestSupport =
      swingLows.length > 0 ? swingLows[swingLows.length - 1]!.value : currentPrice * 0.95;
  }

  return { nearestResistance, nearestSupport };
}

/**
 * Determine whether recent volume confirms price direction.
 * Confirmed = recent 5-bar volume > 1.2× prior 10-bar avg AND price moved with the intended direction.
 * Weak = volume in line but lower ratio. None = volume falling or move opposite.
 */
export function detectVolumeConfirmation(
  closes: number[],
  volumes: number[],
  direction: 'long' | 'short' | 'skip'
): 'confirmed' | 'weak' | 'none' {
  if (direction === 'skip') return 'none';
  const n = Math.min(closes.length, volumes.length);
  if (n < 15) return 'none';

  const recentSlice = volumes.slice(n - 5, n);
  const priorSlice = volumes.slice(n - 15, n - 5);
  const recentVol = recentSlice.reduce((a, b) => a + b, 0) / 5;
  const priorVol = priorSlice.reduce((a, b) => a + b, 0) / 10;
  if (priorVol === 0) return 'none';
  const ratio = recentVol / priorVol;

  const lastClose = closes[n - 1]!;
  const fiveBack = closes[n - 6] ?? lastClose;
  const moveDir: 'long' | 'short' = lastClose > fiveBack ? 'long' : 'short';
  if (moveDir !== direction) return 'weak';

  if (ratio > 1.2) return 'confirmed';
  if (ratio > 0.85) return 'weak';
  return 'none';
}
