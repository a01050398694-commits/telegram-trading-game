// Stage 20 — English trade-plan formatter (Stage 20.1 patch).
// Why: external trader critique flagged AI persona ("looks juicy", "vibe is bullish") as unfit for
//   actual execution. Replaces commentary with a structured plan: entry/SL/TP1+weight/TP2+weight,
//   cancel conditions, scenario-based handling. No AI fluff.
// Why English: the @Trader_club community is mostly non-Korean (handover §12 GOTCHA #6).
//   KST timestamp kept because the operator and most active members are KST-based.

import type { Signal } from './signalEngine.js';

const KST_TZ = 'Asia/Seoul';

function formatKST(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-GB', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatPrice(price: number): string {
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

interface TradePlanOptions {
  generatedAt?: number;
}

export function formatTradePlan(signal: Signal, options: TradePlanOptions = {}): string {
  const now = options.generatedAt ?? Date.now();
  const timeStr = formatKST(now);

  if (signal.direction === 'skip') {
    return formatHoldPlan(signal, timeStr);
  }
  return formatEntryPlan(signal, timeStr);
}

function formatEntryPlan(signal: Signal, timeStr: string): string {
  const directionLabel = signal.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
  const slDist = Math.abs(signal.entry - signal.stopLoss);
  const tp1Dist = Math.abs(signal.tp1 - signal.entry);
  const tp2Dist = Math.abs(signal.tp2 - signal.entry);
  const slPct = signal.entry > 0 ? (slDist / signal.entry) * 100 : 0;
  const rr1 = slDist > 0 ? tp1Dist / slDist : 0;
  const rr2 = slDist > 0 ? tp2Dist / slDist : 0;

  // Why: alts on high-vol setups → take more off at TP1 to derisk; BTC and stable setups split evenly.
  const isAlt = signal.symbol !== 'BTCUSDT';
  const isHighVol = slPct > 2.0;
  const tp1Weight = isAlt && isHighVol ? 70 : 50;
  const tp2Weight = 100 - tp1Weight;

  const sign = signal.direction === 'long' ? 1 : -1;
  const tp1Pct = signal.entry > 0 ? (tp1Dist / signal.entry) * 100 * sign : 0;
  const tp2Pct = signal.entry > 0 ? (tp2Dist / signal.entry) * 100 * sign : 0;

  const cancelTime = 'Void if not filled within 30 minutes';
  const invalidPrice =
    signal.direction === 'long' ? signal.entry * 0.997 : signal.entry * 1.003;
  const cancelPrice =
    signal.direction === 'long'
      ? `Void if no 15m close above ${formatPrice(invalidPrice)}`
      : `Void if no 15m close below ${formatPrice(invalidPrice)}`;

  return [
    `${directionLabel} ${signal.symbol}`,
    `📅 ${timeStr} KST`,
    ``,
    `Entry: ${formatPrice(signal.entry)}`,
    `Stop Loss: ${formatPrice(signal.stopLoss)} (${formatPct(-slPct)})`,
    `TP1: ${formatPrice(signal.tp1)} (${formatPct(tp1Pct)}) — size ${tp1Weight}%`,
    `TP2: ${formatPrice(signal.tp2)} (${formatPct(tp2Pct)}) — size ${tp2Weight}%`,
    ``,
    `R:R: TP1 ${rr1.toFixed(2)}R · TP2 ${rr2.toFixed(2)}R`,
    `Leverage: ${signal.leverage}x (confidence: ${signal.confidence})`,
    ``,
    `📌 Cancel conditions:`,
    `  • ${cancelTime}`,
    `  • ${cancelPrice}`,
    ``,
    `📋 Scenario plan:`,
    `  • TP1 hit → move SL to entry (break-even), close ${tp1Weight}%, let remaining ${tp2Weight}% target TP2`,
    `  • SL hit → close 100%`,
    `  • 24h no reaction → consider trimming half (no auto-close)`,
    `  • 48h not filled → close 100% (timeout)`,
    ``,
    `🔍 Basis: ${signal.rationale.slice(0, 3).join(' · ')}`,
  ].join('\n');
}

function formatHoldPlan(signal: Signal, timeStr: string): string {
  return [
    `⏸ HOLD ${signal.symbol}`,
    `📅 ${timeStr} KST`,
    ``,
    `Price: ${formatPrice(signal.currentPrice)}`,
    `Reason: ${signal.rationale.slice(0, 2).join(' · ')}`,
    ``,
    `No entry — holding off until next tick.`,
  ].join('\n');
}
