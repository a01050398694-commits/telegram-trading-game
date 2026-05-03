// Stage 20.2 — US-trader-style trade plan formatter.
// Why: prior version was "허술해 보임" + Korean-leaning (DD/MM date, KST tz, trailing zeros).
//   Aligning with how Bybit/Binance/TradingView signals look in US trader rooms:
//   - UTC timestamp (ISO + month name), no KST.
//   - Comma-separated USD with $ prefix, no trailing zeros.
//   - Visual structure (separator bars, aligned key:value, sectioned blocks).
//   - Macro context inline (FGI, BTC.D) when available so HOLD has actionable color.
//   - Entry signals carry explicit trigger + invalidation + scenario plan (R:R, fees, expiry).

import type { Signal } from './signalEngine.js';
import type { FullMacroSnapshot } from './macroBundle.js';

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━';

interface TradePlanOptions {
  generatedAt?: number;
  macro?: FullMacroSnapshot | null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatUtc(timestamp: number): string {
  // e.g. "May 3, 2026 · 05:02 UTC"
  const d = new Date(timestamp);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hh}:${mm} UTC`;
}

function formatUsd(price: number): string {
  // $78,403  /  $2,304  /  $83.75  /  $1.2624 — strip trailing zeros, keep precision floor.
  if (!Number.isFinite(price)) return '$—';
  const abs = Math.abs(price);
  let decimals: number;
  if (abs >= 100) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else decimals = 6;
  const fixed = price.toFixed(decimals);
  // strip trailing zeros after a real decimal point
  const trimmed = fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
  // comma-thousands on the integer portion
  const [intPart, decPart] = trimmed.split('.');
  const withCommas = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${withCommas}${decPart ? '.' + decPart : ''}`;
}

function formatPctSigned(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function pad(label: string, width = 12): string {
  return label.length >= width ? label : label + ' '.repeat(width - label.length);
}

function macroLine(macro?: FullMacroSnapshot | null): string | null {
  if (!macro) return null;
  const parts: string[] = [];
  const fgi = macro.fearGreed?.value;
  if (typeof fgi === 'number') {
    let label = 'neutral';
    if (fgi < 25) label = 'extreme fear';
    else if (fgi < 45) label = 'fear';
    else if (fgi > 75) label = 'extreme greed';
    else if (fgi > 55) label = 'greed';
    parts.push(`FGI ${fgi} (${label})`);
  }
  const btcD = macro.global?.btcDominance;
  if (typeof btcD === 'number') {
    parts.push(`BTC.D ${btcD.toFixed(1)}%`);
  }
  const dxy = macro.macro?.dxy;
  if (typeof dxy === 'number') {
    parts.push(`DXY ${dxy.toFixed(2)}`);
  }
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

// Parse signal.rationale (positional Stage 18 evidence layers) into displayable bits.
function extractAlignment(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('alignment '));
  return m ? m.replace(/^alignment\s+/, '') : null;
}
function extractStructure(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('structure '));
  return m ? m.replace(/^structure\s+/, '') : null;
}
function extractMomentum(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('momentum '));
  return m ? m.replace(/^momentum\s+/, '') : null;
}
function extractDivergence(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('divergence '));
  return m ? m.replace(/^divergence\s+/, '') : null;
}
function extractKeyLevels(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('keyLevels '));
  return m ? m.replace(/^keyLevels\s+/, '') : null;
}
function extractRR(rationale: string[]): string | null {
  const m = rationale.find((r) => r.startsWith('riskReward '));
  return m ? m.replace(/^riskReward\s+/, '') : null;
}

// ─── main ───────────────────────────────────────────────────────────────────

export function formatTradePlan(signal: Signal, options: TradePlanOptions = {}): string {
  const now = options.generatedAt ?? Date.now();
  const ts = formatUtc(now);

  if (signal.direction === 'skip') {
    return formatHoldPlan(signal, ts, options.macro ?? null);
  }
  return formatEntryPlan(signal, ts, options.macro ?? null);
}

function formatHoldPlan(signal: Signal, ts: string, macro: FullMacroSnapshot | null): string {
  const align = extractAlignment(signal.rationale);
  const structure = extractStructure(signal.rationale);
  const momentum = extractMomentum(signal.rationale);
  const divergence = extractDivergence(signal.rationale);
  const macroStr = macroLine(macro);

  const lines: string[] = [];
  lines.push(`⏸ HOLD ${signal.symbol} — ${ts}`);
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`${pad('Price')}${formatUsd(signal.currentPrice)}`);
  if (align) lines.push(`${pad('Multi-TF')}${align}`);
  if (structure) lines.push(`${pad('Structure')}${structure}`);
  if (momentum) lines.push(`${pad('Momentum')}${momentum}`);
  if (divergence) lines.push(`${pad('Divergence')}${divergence}`);
  if (macroStr) lines.push(`${pad('Macro')}${macroStr}`);
  lines.push('');
  lines.push('→ Skipping. No clean edge. Wait for next tick.');

  return lines.join('\n');
}

function formatEntryPlan(signal: Signal, ts: string, macro: FullMacroSnapshot | null): string {
  const directionLabel = signal.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
  const slDist = Math.abs(signal.entry - signal.stopLoss);
  const tp1Dist = Math.abs(signal.tp1 - signal.entry);
  const tp2Dist = Math.abs(signal.tp2 - signal.entry);
  const slPct = signal.entry > 0 ? (slDist / signal.entry) * 100 : 0;
  const rr1 = slDist > 0 ? tp1Dist / slDist : 0;
  const rr2 = slDist > 0 ? tp2Dist / slDist : 0;

  // Why: alts on high-vol setups → take more off at TP1 to derisk.
  const isAlt = signal.symbol !== 'BTCUSDT';
  const isHighVol = slPct > 2.0;
  const tp1Weight = isAlt && isHighVol ? 70 : 50;
  const tp2Weight = 100 - tp1Weight;

  const sign = signal.direction === 'long' ? 1 : -1;
  const tp1Pct = signal.entry > 0 ? (tp1Dist / signal.entry) * 100 * sign : 0;
  const tp2Pct = signal.entry > 0 ? (tp2Dist / signal.entry) * 100 * sign : 0;

  // Trigger: filled if 15m close beyond a small confirmation buffer.
  const triggerPrice =
    signal.direction === 'long' ? signal.entry * 1.001 : signal.entry * 0.999;
  const triggerStr =
    signal.direction === 'long'
      ? `Filled if 15m closes above ${formatUsd(triggerPrice)}`
      : `Filled if 15m closes below ${formatUsd(triggerPrice)}`;
  const invalidStr =
    signal.direction === 'long'
      ? `${formatUsd(signal.stopLoss)} break (15m close)`
      : `${formatUsd(signal.stopLoss)} reclaim (15m close)`;

  const align = extractAlignment(signal.rationale);
  const structure = extractStructure(signal.rationale);
  const macroStr = macroLine(macro);

  const lines: string[] = [];
  lines.push(`${directionLabel} ${signal.symbol} — ${ts}`);
  lines.push(SEPARATOR);
  lines.push('');
  lines.push(`${pad('Entry')}${formatUsd(signal.entry)}`);
  lines.push(`${pad('Stop Loss')}${formatUsd(signal.stopLoss)}  (${formatPctSigned(-slPct)})`);
  lines.push(
    `${pad('Target 1')}${formatUsd(signal.tp1)}  (${formatPctSigned(tp1Pct)} · ${rr1.toFixed(2)}R · close ${tp1Weight}%)`
  );
  lines.push(
    `${pad('Target 2')}${formatUsd(signal.tp2)}  (${formatPctSigned(tp2Pct)} · ${rr2.toFixed(2)}R · close ${tp2Weight}%)`
  );
  lines.push(`${pad('Leverage')}${signal.leverage}× (${signal.confidence} confidence)`);
  lines.push('');
  if (align) lines.push(`${pad('Multi-TF')}${align}`);
  if (structure) lines.push(`${pad('Structure')}${structure}`);
  if (macroStr) lines.push(`${pad('Macro')}${macroStr}`);
  lines.push('');
  lines.push('Trigger:');
  lines.push(`  ${triggerStr}`);
  lines.push('Invalidate:');
  lines.push(`  ${invalidStr}`);
  lines.push('  Void if not filled within 30 min');
  lines.push('');
  lines.push('Scenario plan:');
  lines.push(`  • TP1 hit  → SL to break-even, ride remainder to TP2`);
  lines.push(`  • SL hit   → close 100%`);
  lines.push(`  • 24h flat → consider trim`);
  lines.push(`  • 48h none → close (timeout)`);

  return lines.join('\n');
}
