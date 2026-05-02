// Pure-function signal engine. Takes pre-fetched indicators + funding/FGI, emits a structured Signal.
// No I/O, no async — caller is responsible for fetching data and broadcasting the result.

import type { TAIndicators } from '../lib/ta.js';
import type { FuturesSymbol } from './marketData.js';

export type SignalDirection = 'long' | 'short' | 'skip';

export interface Signal {
  symbol: FuturesSymbol;
  direction: SignalDirection;
  score: number;
  currentPrice: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rationale: string[];
  leverage: number;
}

export interface BuildSignalInput {
  symbol: FuturesSymbol;
  currentPrice: number;
  indicators: TAIndicators;
  fundingRate: number | null;
  fearGreed: number | null;
}

const SKIP_GAP = 30;

export function buildSignal(input: BuildSignalInput): Signal {
  const { symbol, currentPrice, indicators, fundingRate, fearGreed } = input;

  let longScore = 0;
  let shortScore = 0;
  const longBullets: string[] = [];
  const shortBullets: string[] = [];

  // 1) Trend (25): SMA-50 vs SMA-200.
  if (indicators.sma50 != null && indicators.sma200 != null) {
    const sma50 = indicators.sma50;
    const sma200 = indicators.sma200;
    if (sma50 > sma200) {
      longScore += 25;
      longBullets.push(`Trend: SMA-50 ${sma50.toFixed(2)} > SMA-200 ${sma200.toFixed(2)}`);
    } else if (sma200 > sma50) {
      shortScore += 25;
      shortBullets.push(`Trend: SMA-50 ${sma50.toFixed(2)} < SMA-200 ${sma200.toFixed(2)}`);
    }
  }

  // 2) RSI (20): trend-follow + mean-reversion.
  if (indicators.rsi14 != null) {
    const rsi = indicators.rsi14;
    if (rsi < 30) {
      longScore += 20;
      longBullets.push(`RSI ${rsi.toFixed(0)} — oversold (mean-reversion long)`);
    } else if (rsi > 50 && rsi < 70) {
      longScore += 15;
      longBullets.push(`RSI ${rsi.toFixed(0)} — bullish momentum`);
    } else if (rsi > 30 && rsi < 50) {
      shortScore += 15;
      shortBullets.push(`RSI ${rsi.toFixed(0)} — bearish momentum`);
    } else if (rsi > 70) {
      shortScore += 20;
      shortBullets.push(`RSI ${rsi.toFixed(0)} — overbought (mean-reversion short)`);
    }
  }

  // 3) MACD cross (20): only recent crosses count.
  if (indicators.macdCross && indicators.macdCross.crossRecent) {
    if (indicators.macdCross.crossType === 'golden') {
      longScore += 20;
      longBullets.push('MACD golden cross within 3 bars');
    } else if (indicators.macdCross.crossType === 'dead') {
      shortScore += 20;
      shortBullets.push('MACD dead cross within 3 bars');
    }
  }

  // 4) Funding (15): negative funding = shorts paying longs (long bias), positive = longs paying.
  if (fundingRate != null) {
    const fundingPct = fundingRate * 100;
    if (fundingPct < -0.01) {
      longScore += 15;
      longBullets.push(`Funding ${fundingPct.toFixed(3)}% — shorts paying`);
    } else if (fundingPct > 0.05) {
      shortScore += 15;
      shortBullets.push(`Funding ${fundingPct.toFixed(3)}% — longs paying`);
    }
  }

  // 5) FGI (20): contrarian — extreme fear → long, extreme greed → short.
  if (fearGreed != null) {
    if (fearGreed < 25) {
      longScore += 20;
      longBullets.push(`FGI ${fearGreed} — extreme fear (contrarian long)`);
    } else if (fearGreed > 75) {
      shortScore += 20;
      shortBullets.push(`FGI ${fearGreed} — extreme greed (contrarian short)`);
    }
  }

  const diff = longScore - shortScore;
  let direction: SignalDirection;
  let rationale: string[];
  let score: number;

  if (Math.abs(diff) < SKIP_GAP) {
    direction = 'skip';
    score = Math.max(longScore, shortScore);
    rationale = [`No clear edge — long ${longScore} / short ${shortScore}, gap < ${SKIP_GAP}`];
  } else if (diff > 0) {
    direction = 'long';
    score = longScore;
    rationale = longBullets.slice(0, 5);
  } else {
    direction = 'short';
    score = shortScore;
    rationale = shortBullets.slice(0, 5);
  }

  // Levels — use ATR fallback (2% of price) if TA didn't return one.
  const atr = indicators.atr14 ?? currentPrice * 0.02;

  // Score-tiered leverage. Higher conviction = more leverage allowed in the suggested setup.
  const leverage = score >= 55 ? 10 : score >= 45 ? 5 : 3;

  if (direction === 'skip') {
    return {
      symbol,
      direction,
      score,
      currentPrice,
      entry: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      rationale,
      leverage,
    };
  }

  const isLong = direction === 'long';
  const entry = isLong ? currentPrice * 1.003 : currentPrice * 0.997;
  const stopLoss = isLong ? entry - 1.5 * atr : entry + 1.5 * atr;
  const tp1 = isLong ? entry + 1.5 * atr : entry - 1.5 * atr;
  const tp2 = isLong ? entry + 3.0 * atr : entry - 3.0 * atr;

  return {
    symbol,
    direction,
    score,
    currentPrice,
    entry,
    stopLoss,
    tp1,
    tp2,
    rationale,
    leverage,
  };
}
