// Stage 20.3 — Mid-level trader, modern, scannable plan formatter.
// Why prior version felt cramped:
//   - Multi-TF row was one long inline parenthetical (m15:bullish h1:bearish ...) → unreadable.
//   - No section breaks → key facts blur together.
//   - Raw jargon (BOS, alignment, Macro) without visual cues.
// Fix: numbered sections, modern emoji per block, ▲▼➡ arrows for TF trend, separator bars,
//   short labels (Trend / Structure / Momentum / Macro), single-line key:value where possible.

import type {
  Signal,
  TFTrend,
  MultiTimeframeAlignment,
  SignalStructure,
} from './signalEngine.js';
import type { FullMacroSnapshot } from './macroBundle.js';

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━';

interface TradePlanOptions {
  generatedAt?: number;
  macro?: FullMacroSnapshot | null;
  nextTickMinutes?: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatUtc(timestamp: number): string {
  const d = new Date(timestamp);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hh}:${mm} UTC`;
}

function formatUsd(price: number): string {
  if (!Number.isFinite(price)) return '$—';
  const abs = Math.abs(price);
  let decimals: number;
  if (abs >= 100) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else decimals = 6;
  const fixed = price.toFixed(decimals);
  const trimmed = fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
  const [intPart, decPart] = trimmed.split('.');
  const withCommas = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${withCommas}${decPart ? '.' + decPart : ''}`;
}

function formatPctSigned(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function arrow(t: TFTrend): string {
  if (t === 'bullish') return '▲';
  if (t === 'bearish') return '▼';
  return '➡';
}

function tfRow(tf: MultiTimeframeAlignment): string {
  return `15m ${arrow(tf.m15)}   1h ${arrow(tf.h1)}   4h ${arrow(tf.h4)}   1d ${arrow(tf.d1)}`;
}

function alignedCount(tf: MultiTimeframeAlignment, direction: 'long' | 'short' | 'skip'): number {
  if (direction === 'skip') {
    // For skips, report dominant-side count for readability.
    const trends = [tf.m15, tf.h1, tf.h4, tf.d1];
    const bull = trends.filter((t) => t === 'bullish').length;
    const bear = trends.filter((t) => t === 'bearish').length;
    return Math.max(bull, bear);
  }
  const want = direction === 'long' ? 'bullish' : 'bearish';
  return [tf.m15, tf.h1, tf.h4, tf.d1].filter((t) => t === want).length;
}

function structureLabel(s: SignalStructure): string {
  const trend = s.trend === 'ranging' ? 'sideways' : s.trend;
  const bos = s.bosDetected ? 'breakout confirmed' : 'no breakout';
  return `${trend} · ${bos}`;
}

function fgiLabel(value: number): string {
  if (value < 25) return 'extreme fear';
  if (value < 45) return 'fear';
  if (value > 75) return 'extreme greed';
  if (value > 55) return 'greed';
  return 'neutral';
}

interface MacroLines {
  fgi: string | null;
  btcD: string | null;
  dxy: string | null;
}

function macroLines(macro?: FullMacroSnapshot | null): MacroLines {
  const out: MacroLines = { fgi: null, btcD: null, dxy: null };
  if (!macro) return out;
  const fgi = macro.fearGreed?.value;
  if (typeof fgi === 'number') out.fgi = `FGI ${fgi} · ${fgiLabel(fgi)}`;
  const btcD = macro.global?.btcDominance;
  if (typeof btcD === 'number') out.btcD = `BTC.D ${btcD.toFixed(1)}%`;
  const dxy = macro.macro?.dxy;
  if (typeof dxy === 'number') out.dxy = `DXY ${dxy.toFixed(2)}`;
  return out;
}

// extract momentum from signal.rationale (Stage 18 layered text)
function extractMomentumLine(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('momentum '));
  if (!m) return null;
  // raw: "momentum 1h RSI=46, MACD=short"
  return m.replace(/^momentum\s+/, '');
}

// ─── main ───────────────────────────────────────────────────────────────────

export function formatTradePlan(signal: Signal, options: TradePlanOptions = {}): string {
  const now = options.generatedAt ?? Date.now();
  const ts = formatUtc(now);
  const nextMin = options.nextTickMinutes ?? 83;
  const macro = options.macro ?? null;

  if (signal.direction === 'skip') {
    return formatHoldPlan(signal, ts, macro, nextMin);
  }
  return formatEntryPlan(signal, ts, macro);
}

function formatHoldPlan(
  signal: Signal,
  ts: string,
  macro: FullMacroSnapshot | null,
  nextMin: number
): string {
  const tf = signal.multiTimeframeAlignment;
  const aligned = alignedCount(tf, 'skip');
  const momentum = extractMomentumLine(signal.rationale);
  const m = macroLines(macro);
  const macroParts = [m.fgi, m.btcD, m.dxy].filter(Boolean).join(' · ');

  const lines: string[] = [];
  lines.push(`⏸ HOLD ${signal.symbol}`);
  lines.push(`🕐 ${ts}`);
  lines.push(`💰 ${formatUsd(signal.currentPrice)}`);
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`1️⃣ Trend (4 timeframes)`);
  lines.push(`   ${tfRow(tf)}`);
  lines.push(`   Alignment: ${aligned}/4`);
  lines.push('');
  lines.push(`2️⃣ Structure`);
  lines.push(
    `   Range  ${formatUsd(signal.structure.recentSwingLow)} — ${formatUsd(signal.structure.recentSwingHigh)}`
  );
  lines.push(`   ${structureLabel(signal.structure)}`);
  if (momentum) {
    lines.push('');
    lines.push(`3️⃣ Momentum`);
    lines.push(`   ${momentum}`);
  }
  if (macroParts) {
    lines.push('');
    lines.push(`${momentum ? '4️⃣' : '3️⃣'} Macro`);
    lines.push(`   ${macroParts}`);
  }
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`🚫 Skip — mixed signals, no clean edge.`);
  lines.push(`⏰ Next check in ~${nextMin} min.`);

  return lines.join('\n');
}

function formatEntryPlan(
  signal: Signal,
  ts: string,
  macro: FullMacroSnapshot | null
): string {
  const directionLabel = signal.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
  const slDist = Math.abs(signal.entry - signal.stopLoss);
  const tp1Dist = Math.abs(signal.tp1 - signal.entry);
  const tp2Dist = Math.abs(signal.tp2 - signal.entry);
  const slPct = signal.entry > 0 ? (slDist / signal.entry) * 100 : 0;
  const rr1 = slDist > 0 ? tp1Dist / slDist : 0;
  const rr2 = slDist > 0 ? tp2Dist / slDist : 0;

  const isAlt = signal.symbol !== 'BTCUSDT';
  const isHighVol = slPct > 2.0;
  const tp1Weight = isAlt && isHighVol ? 70 : 50;
  const tp2Weight = 100 - tp1Weight;

  const sign = signal.direction === 'long' ? 1 : -1;
  const tp1Pct = signal.entry > 0 ? (tp1Dist / signal.entry) * 100 * sign : 0;
  const tp2Pct = signal.entry > 0 ? (tp2Dist / signal.entry) * 100 * sign : 0;

  const triggerPrice =
    signal.direction === 'long' ? signal.entry * 1.001 : signal.entry * 0.999;
  const triggerStr =
    signal.direction === 'long'
      ? `15m close above ${formatUsd(triggerPrice)}`
      : `15m close below ${formatUsd(triggerPrice)}`;
  const invalidStr =
    signal.direction === 'long'
      ? `${formatUsd(signal.stopLoss)} break (15m close)`
      : `${formatUsd(signal.stopLoss)} reclaim (15m close)`;

  const tf = signal.multiTimeframeAlignment;
  const aligned = alignedCount(tf, signal.direction);
  const m = macroLines(macro);
  const macroParts = [m.fgi, m.btcD, m.dxy].filter(Boolean).join(' · ');

  const lines: string[] = [];
  lines.push(`${directionLabel} ${signal.symbol}`);
  lines.push(`🕐 ${ts}`);
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`💰 Entry      ${formatUsd(signal.entry)}`);
  lines.push(`🛑 Stop loss  ${formatUsd(signal.stopLoss)}  (${formatPctSigned(-slPct)})`);
  lines.push(
    `🎯 Target 1   ${formatUsd(signal.tp1)}  (${formatPctSigned(tp1Pct)} · ${rr1.toFixed(2)}R · ${tp1Weight}%)`
  );
  lines.push(
    `🎯 Target 2   ${formatUsd(signal.tp2)}  (${formatPctSigned(tp2Pct)} · ${rr2.toFixed(2)}R · ${tp2Weight}%)`
  );
  lines.push(`🎚️ Leverage   ${signal.leverage}× · ${signal.confidence} confidence`);
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`1️⃣ Trend (4 timeframes)`);
  lines.push(`   ${tfRow(tf)}`);
  lines.push(`   Alignment: ${aligned}/4 with ${signal.direction.toUpperCase()}`);
  lines.push('');
  lines.push(`2️⃣ Structure`);
  lines.push(
    `   Range  ${formatUsd(signal.structure.recentSwingLow)} — ${formatUsd(signal.structure.recentSwingHigh)}`
  );
  lines.push(`   ${structureLabel(signal.structure)}`);
  if (macroParts) {
    lines.push('');
    lines.push(`3️⃣ Macro`);
    lines.push(`   ${macroParts}`);
  }
  lines.push('');
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`📌 Trigger`);
  lines.push(`   Enter on ${triggerStr}`);
  lines.push('');
  lines.push(`🚫 Invalidate`);
  lines.push(`   ${invalidStr}`);
  lines.push(`   Or no fill within 30 min`);
  lines.push('');
  lines.push(`📋 Playbook`);
  lines.push(`   • TP1 hit  → move stop to entry, ride remainder to TP2`);
  lines.push(`   • Stop hit → close 100%`);
  lines.push(`   • 24h flat → consider trim`);
  lines.push(`   • 48h no fill → cancel`);

  return lines.join('\n');
}
