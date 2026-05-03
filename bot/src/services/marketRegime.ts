// Stage 20 — Market Regime Filter (BTC.D + DXY + FGI driven).
// Why: Stage 19 backtest showed SHORT 13.9% vs LONG 42.5% — algorithm ignored macro trend.
//   Suppress alt-LONG in btc-strong, alt-SHORT in alt-strong, all-LONG in risk-off, all-SHORT in risk-on.

import type { FullMacroSnapshot } from './macroBundle.js';

export type MarketRegime =
  | 'btc-strong'
  | 'alt-strong'
  | 'risk-off'
  | 'risk-on'
  | 'neutral';

export interface RegimeFilterDecision {
  regime: MarketRegime;
  shouldSkip: boolean;
  reason: string;
}

export function detectRegime(macro: FullMacroSnapshot | null): MarketRegime {
  if (!macro) return 'neutral';

  const btcD = macro.global?.btcDominance ?? null;
  const dxy = macro.macro?.dxy ?? null;
  const fgi = macro.fearGreed?.value ?? null;

  if (dxy != null && dxy > 105 && fgi != null && fgi < 25) return 'risk-off';
  if (dxy != null && dxy < 100 && fgi != null && fgi > 65) return 'risk-on';
  if (btcD != null && btcD > 60) return 'btc-strong';
  if (btcD != null && btcD < 50) return 'alt-strong';
  return 'neutral';
}

export function applyRegimeFilter(
  symbol: string,
  direction: 'long' | 'short' | 'skip',
  regime: MarketRegime
): RegimeFilterDecision {
  if (direction === 'skip') {
    return { regime, shouldSkip: false, reason: 'already skip' };
  }
  const isAlt = symbol !== 'BTCUSDT';

  switch (regime) {
    case 'risk-off':
      if (direction === 'long') {
        return {
          regime,
          shouldSkip: true,
          reason: 'risk-off regime, long suppressed (DXY>105 + FGI<25)',
        };
      }
      break;
    case 'risk-on':
      if (direction === 'short') {
        return {
          regime,
          shouldSkip: true,
          reason: 'risk-on regime, short suppressed (DXY<100 + FGI>65)',
        };
      }
      break;
    case 'btc-strong':
      if (isAlt && direction === 'long') {
        return {
          regime,
          shouldSkip: true,
          reason: 'BTC dominance >60%, alt long suppressed',
        };
      }
      break;
    case 'alt-strong':
      if (isAlt && direction === 'short') {
        return {
          regime,
          shouldSkip: true,
          reason: 'BTC dominance <50%, alt short suppressed',
        };
      }
      break;
    case 'neutral':
      break;
  }
  return { regime, shouldSkip: false, reason: `regime ${regime} OK` };
}
