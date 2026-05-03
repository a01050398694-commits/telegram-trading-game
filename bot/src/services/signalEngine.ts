// Pure-function signal engine. Stage 17 C12 — multi-timeframe + structure + divergence + key-level SL/TP.
// No I/O, no async. Caller is responsible for fetching MultiTimeframeKlines and broadcasting the result.
// Why: derivatives layers (funding/OI/LSR) removed per Stage 17 v4 — Binance.US has no derivatives,
// the remaining 6 components (alignment 40 + structure 20 + momentum 15 + divergence 10 + volume 10 + key 5)
// reach 100 points without them.

import {
  computeATR,
  computeMACD,
  computeRSI,
  computeSMA,
  computePivotLevels,
  detectMarketStructure,
  detectRSIDivergence,
  detectSwingHighsLows,
  detectVolumeConfirmation,
  findNearestSupportResistance,
  type MarketStructure,
} from '../lib/ta.js';
import type { FuturesSymbol, KlineSeries, MultiTimeframeKlines } from './marketData.js';

// Stage 19 — R:R Hardening
// Why: live 03:03 BTC LONG R:R 0.14 — TP too close, SL too far. Gate blocks unprofitable signals.
const MIN_TP1_RR_RATIO = 1.0;
const MIN_TP2_RR_RATIO = 1.5;
const MAX_SL_ATR_MULT = 2.5;
const SL_ATR_FALLBACK_PCT = 0.025;

export interface RiskReward {
  rrTp1: number;
  rrTp2: number;
}

export function computeRiskReward(
  entry: number,
  stopLoss: number,
  tp1: number,
  tp2: number
): RiskReward {
  const slDistance = Math.abs(entry - stopLoss);
  if (slDistance === 0) return { rrTp1: 0, rrTp2: 0 };
  return {
    rrTp1: Math.abs(tp1 - entry) / slDistance,
    rrTp2: Math.abs(tp2 - entry) / slDistance,
  };
}

export type SignalDirection = 'long' | 'short' | 'skip';
export type Confidence = 'high' | 'medium' | 'low' | 'none';
export type TFTrend = 'bullish' | 'bearish' | 'neutral';
export type VolumeConfirmation = 'confirmed' | 'weak' | 'none';

export interface MultiTimeframeAlignment {
  m15: TFTrend;
  h1: TFTrend;
  h4: TFTrend;
  d1: TFTrend;
  alignmentScore: number;
}

export interface SignalStructure {
  trend: 'bullish' | 'bearish' | 'ranging';
  recentSwingHigh: number;
  recentSwingLow: number;
  bosDetected: boolean;
}

export interface SignalKeyLevels {
  nearestResistance: number;
  nearestSupport: number;
  pivot: number;
}

export interface Signal {
  symbol: FuturesSymbol;
  direction: SignalDirection;
  score: number;
  confidence: Confidence;
  currentPrice: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  leverage: number;
  rationale: string[];
  multiTimeframeAlignment: MultiTimeframeAlignment;
  structure: SignalStructure;
  keyLevels: SignalKeyLevels;
  divergence: { bullish: boolean; bearish: boolean };
  volumeConfirmation: VolumeConfirmation;
}

export interface BuildSignalInput {
  symbol: FuturesSymbol;
  currentPrice: number;
  klines: MultiTimeframeKlines;
}

interface TFSnapshot {
  trend: TFTrend;
  rsi: number | null;
  macdAgree: 'long' | 'short' | null;
  structure: MarketStructure;
  divergence: { bullish: boolean; bearish: boolean };
}

function evaluateTimeframe(klines: KlineSeries): TFSnapshot {
  const { closes, highs, lows } = klines;
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);
  const rsi = computeRSI(closes, 14);
  const macd = computeMACD(closes);
  const structure = detectMarketStructure(closes, highs, lows);
  const divergence = detectRSIDivergence(closes, highs, lows);

  let trend: TFTrend = 'neutral';
  if (sma50 != null && sma200 != null) {
    if (sma50 > sma200) trend = 'bullish';
    else if (sma50 < sma200) trend = 'bearish';
  }

  let macdAgree: 'long' | 'short' | null = null;
  if (macd && rsi != null) {
    if (macd.histogram > 0 && rsi > 50) macdAgree = 'long';
    else if (macd.histogram < 0 && rsi < 50) macdAgree = 'short';
  }

  return { trend, rsi, macdAgree, structure, divergence };
}

function pickDominant(trends: TFTrend[]): { dominant: 'bullish' | 'bearish' | null; count: number } {
  let bullish = 0;
  let bearish = 0;
  for (const t of trends) {
    if (t === 'bullish') bullish++;
    else if (t === 'bearish') bearish++;
  }
  if (bullish === bearish) return { dominant: null, count: 0 };
  return bullish > bearish
    ? { dominant: 'bullish', count: bullish }
    : { dominant: 'bearish', count: bearish };
}

export function buildSignal(input: BuildSignalInput): Signal {
  const { symbol, currentPrice, klines } = input;

  const tfM15 = evaluateTimeframe(klines.m15);
  const tfH1 = evaluateTimeframe(klines.h1);
  const tfH4 = evaluateTimeframe(klines.h4);
  const tfD1 = evaluateTimeframe(klines.d1);

  const trends: TFTrend[] = [tfM15.trend, tfH1.trend, tfH4.trend, tfD1.trend];
  const { dominant, count } = pickDominant(trends);

  // a. Multi-TF alignment (40 max).
  let alignmentPoints = 0;
  let alignmentScore = 0.25;
  if (count === 4) {
    alignmentPoints = 40;
    alignmentScore = 1.0;
  } else if (count === 3) {
    alignmentPoints = 25;
    alignmentScore = 0.75;
  } else if (count === 2) {
    alignmentPoints = 10;
    alignmentScore = 0.5;
  }

  // b. Structure (20 max) — clean trend on 1h + 4h matching dominant.
  let structurePoints = 0;
  if (dominant) {
    const h1Match = tfH1.structure.trend === dominant;
    const h4Match = tfH4.structure.trend === dominant;
    if (h1Match && h4Match) structurePoints = 20;
    else if (h1Match || h4Match) structurePoints = 10;
    else if (tfH1.structure.trend === 'ranging' && tfH4.structure.trend === 'ranging') {
      structurePoints = 5;
    }
  }

  // c. Momentum (15 max) — RSI + MACD agree on 1h or 4h.
  const intent: 'long' | 'short' | null =
    dominant === 'bullish' ? 'long' : dominant === 'bearish' ? 'short' : null;
  let momentumPoints = 0;
  if (intent) {
    const h1Agree = tfH1.macdAgree === intent;
    const h4Agree = tfH4.macdAgree === intent;
    if (h1Agree && h4Agree) momentumPoints = 15;
    else if (h1Agree || h4Agree) momentumPoints = 8;
  }

  // d. Divergence bonus (10) — H1 or H4 divergence in line with dominant.
  let divergencePoints = 0;
  if (dominant === 'bullish' && (tfH1.divergence.bullish || tfH4.divergence.bullish)) {
    divergencePoints = 10;
  } else if (dominant === 'bearish' && (tfH1.divergence.bearish || tfH4.divergence.bearish)) {
    divergencePoints = 10;
  }

  // e. Volume (10 max) — 1h volume confirms move direction.
  const volumeConfirm = detectVolumeConfirmation(
    klines.h1.closes,
    klines.h1.volumes,
    intent ?? 'skip'
  );
  let volumePoints = 0;
  if (volumeConfirm === 'confirmed') volumePoints = 10;
  else if (volumeConfirm === 'weak') volumePoints = 5;

  // f. Key level proximity (5 max) — price near major S/R aligning with direction.
  const swings4h = detectSwingHighsLows(klines.h4.highs, klines.h4.lows);
  const keyLevels = findNearestSupportResistance(
    currentPrice,
    swings4h.swingHighs,
    swings4h.swingLows
  );
  let keyLevelPoints = 0;
  if (dominant === 'bullish' && currentPrice > 0) {
    const distSupport = (currentPrice - keyLevels.nearestSupport) / currentPrice;
    if (distSupport >= 0 && distSupport < 0.02) keyLevelPoints = 5;
  } else if (dominant === 'bearish' && currentPrice > 0) {
    const distResistance = (keyLevels.nearestResistance - currentPrice) / currentPrice;
    if (distResistance >= 0 && distResistance < 0.02) keyLevelPoints = 5;
  }

  const totalScore =
    alignmentPoints +
    structurePoints +
    momentumPoints +
    divergencePoints +
    volumePoints +
    keyLevelPoints;

  // Direction: skip when alignment too low or no clear winner.
  let direction: SignalDirection;
  if (alignmentScore < 0.4 || !dominant) {
    direction = 'skip';
  } else if (totalScore >= 30) {
    direction = dominant === 'bullish' ? 'long' : 'short';
  } else {
    direction = 'skip';
  }

  // Confidence tiers — Stage 20: Stage 19 backtest produced only 2 high-confidence signals
  //   under the old 75/55/30 thresholds. Loosened to 65/45/30 so 'high' becomes meaningfully populated.
  let confidence: Confidence;
  if (totalScore >= 65) confidence = 'high';
  else if (totalScore >= 45) confidence = 'medium';
  else if (totalScore >= 30) confidence = 'low';
  else confidence = 'none';

  // Daily pivot from the most recently closed day candle.
  const dHighs = klines.d1.highs;
  const dLows = klines.d1.lows;
  const dCloses = klines.d1.closes;
  let pivot = currentPrice;
  const lastDayIdx = dHighs.length - 2;
  if (
    lastDayIdx >= 0 &&
    dHighs[lastDayIdx] != null &&
    dLows[lastDayIdx] != null &&
    dCloses[lastDayIdx] != null
  ) {
    const lvl = computePivotLevels(dHighs[lastDayIdx]!, dLows[lastDayIdx]!, dCloses[lastDayIdx]!);
    pivot = lvl.pivot;
  }

  // ATR-based volatility for leverage cap.
  const atr1h = computeATR(klines.h1.highs, klines.h1.lows, klines.h1.closes, 14);
  const atrPct = atr1h != null && currentPrice > 0 ? (atr1h / currentPrice) * 100 : 1.5;

  // Entry/SL/TP — based on H4 swings + nearest key levels.
  const recentSwingHigh = tfH4.structure.recentSwingHigh;
  const recentSwingLow = tfH4.structure.recentSwingLow;
  let entry = 0;
  let stopLoss = 0;
  let tp1 = 0;
  let tp2 = 0;
  if (direction === 'long') {
    entry = currentPrice;
    stopLoss = recentSwingLow * 0.997;
    tp1 = keyLevels.nearestResistance;
    const deeperResistances = swings4h.swingHighs
      .map((s) => s.value)
      .filter((v) => v > tp1)
      .sort((a, b) => a - b);
    tp2 = deeperResistances[0] ?? tp1 * 1.03;
  } else if (direction === 'short') {
    entry = currentPrice;
    stopLoss = recentSwingHigh * 1.003;
    tp1 = keyLevels.nearestSupport;
    const deeperSupports = swings4h.swingLows
      .map((s) => s.value)
      .filter((v) => v < tp1)
      .sort((a, b) => b - a);
    tp2 = deeperSupports[0] ?? tp1 * 0.97;
  }

  // Stage 19 R:R Hardening — SL distance cap + R:R Gate.
  // Why: H4 swings are sometimes very far (BTC 78k entry, swing-low 74.6k → SL -4.7%, TP +0.7%).
  //   Cap SL at ATR×2.5 (or 2.5% if ATR missing), then reject any signal where TP is too close.
  let rrTp1 = 0;
  let rrTp2 = 0;
  if (direction === 'long' || direction === 'short') {
    const slDistance = Math.abs(entry - stopLoss);
    const maxSlDistance = atr1h != null && atr1h > 0
      ? atr1h * MAX_SL_ATR_MULT
      : entry * SL_ATR_FALLBACK_PCT;

    if (slDistance > maxSlDistance) {
      stopLoss = direction === 'long'
        ? entry - maxSlDistance
        : entry + maxSlDistance;
    }

    const finalSlDistance = Math.abs(entry - stopLoss);
    if (finalSlDistance > 0) {
      rrTp1 = Math.abs(tp1 - entry) / finalSlDistance;
      rrTp2 = Math.abs(tp2 - entry) / finalSlDistance;
    }

    if (rrTp1 < MIN_TP1_RR_RATIO || rrTp2 < MIN_TP2_RR_RATIO) {
      direction = 'skip';
    }
  }

  // Leverage — confidence + ATR cap. Stage 20: alt symbols capped at 60% of BTC leverage
  //   (SOL 10.3% win rate in Stage 19 → cut size, not signal frequency).
  const isAlt = symbol !== 'BTCUSDT';
  const altCap = isAlt ? 0.6 : 1.0;
  let leverage = 0;
  if (confidence === 'high') leverage = atrPct > 3 ? 5 : 10;
  else if (confidence === 'medium') leverage = atrPct > 3 ? 3 : 5;
  else if (confidence === 'low') leverage = atrPct > 3 ? 1 : 3;
  if (leverage > 0) leverage = Math.max(1, Math.floor(leverage * altCap));

  // Stage 18 T4 — rationale as structured evidence layers (one line per layer, always emitted
  //   so the LLM can pick 2-3 from a known set). Score calc above is unchanged.
  const tfStr = `m15:${tfM15.trend} h1:${tfH1.trend} h4:${tfH4.trend} d1:${tfD1.trend}`;
  const intentTrend: 'bullish' | 'bearish' | null =
    direction === 'long' ? 'bullish' : direction === 'short' ? 'bearish' : null;
  const alignedCount = intentTrend
    ? [tfM15.trend, tfH1.trend, tfH4.trend, tfD1.trend].filter((t) => t === intentTrend).length
    : count;

  const rationale: string[] = [];
  rationale.push(
    `alignment ${alignedCount}/4 (${tfStr}, score=${alignmentScore.toFixed(2)})`
  );
  rationale.push(
    `structure ${tfH4.structure.trend}, swingHigh=${recentSwingHigh.toFixed(2)}, swingLow=${recentSwingLow.toFixed(2)}, BOS=${tfH4.structure.bosDetected}`
  );
  if (tfH1.rsi != null) {
    rationale.push(`momentum 1h RSI=${tfH1.rsi.toFixed(0)}, MACD=${tfH1.macdAgree ?? 'neutral'}`);
  }
  const divDir = tfH1.divergence.bullish || tfH4.divergence.bullish
    ? 'bullish'
    : tfH1.divergence.bearish || tfH4.divergence.bearish
      ? 'bearish'
      : null;
  if (divDir) {
    rationale.push(`divergence ${divDir} on h1/h4`);
  }
  rationale.push(
    `keyLevels nearestSupport=${keyLevels.nearestSupport.toFixed(2)}, nearestResistance=${keyLevels.nearestResistance.toFixed(2)}, pivot=${pivot.toFixed(2)}`
  );
  rationale.push(`volume ${volumeConfirm}`);

  // Stage 19 — R:R evidence layer (always recorded, even on skip — explains WHY skipping).
  if (rrTp1 > 0 || rrTp2 > 0) {
    const slPct = entry > 0 ? (Math.abs(entry - stopLoss) / entry) * 100 : 0;
    rationale.push(
      `riskReward TP1=${rrTp1.toFixed(2)}R TP2=${rrTp2.toFixed(2)}R, slDist=${slPct.toFixed(2)}%`
    );
  } else if (direction === 'skip') {
    rationale.push('riskReward N/A (skip)');
  }

  return {
    symbol,
    direction,
    score: totalScore,
    confidence,
    currentPrice,
    entry,
    stopLoss,
    tp1,
    tp2,
    leverage,
    rationale,
    multiTimeframeAlignment: {
      m15: tfM15.trend,
      h1: tfH1.trend,
      h4: tfH4.trend,
      d1: tfD1.trend,
      alignmentScore,
    },
    structure: {
      trend: tfH4.structure.trend,
      recentSwingHigh,
      recentSwingLow,
      bosDetected: tfH4.structure.bosDetected,
    },
    keyLevels: {
      nearestResistance: keyLevels.nearestResistance,
      nearestSupport: keyLevels.nearestSupport,
      pivot,
    },
    divergence: {
      bullish: tfH1.divergence.bullish || tfH4.divergence.bullish,
      bearish: tfH1.divergence.bearish || tfH4.divergence.bearish,
    },
    volumeConfirmation: volumeConfirm,
  };
}
