// Stage 22 — Macro event calendar for signal suppression.
// Why: institutional signal services suppress signals around FOMC / CPI releases because
//   intraday volatility spikes 3-5x and SL/TP hit randomly. Hardcoded calendar avoids a
//   runtime API dependency; operator reviews quarterly (calendar valid through 2026-12-31).
//
// Sources for 2026 dates:
//   FOMC: federalreserve.gov/monetarypolicy/fomccalendars.htm
//   CPI:  bls.gov/schedule/news_release/cpi.htm
//
// All times are UTC. FOMC announcements are typically at 18:00 UTC on day 2 of the 2-day meeting.
// CPI releases are typically at 12:30 UTC on the listed date.

interface MacroEvent {
  type: 'FOMC' | 'CPI';
  isoDate: string; // YYYY-MM-DD
  utcHour: number; // 0-23, hour of release in UTC
}

// Conservative, hand-curated. Operator should re-check before each quarter.
const EVENTS_2026: MacroEvent[] = [
  // FOMC 2026 (8 meetings, day-2 announcement at 18:00 UTC)
  { type: 'FOMC', isoDate: '2026-01-28', utcHour: 19 },
  { type: 'FOMC', isoDate: '2026-03-18', utcHour: 18 },
  { type: 'FOMC', isoDate: '2026-04-29', utcHour: 18 },
  { type: 'FOMC', isoDate: '2026-06-17', utcHour: 18 },
  { type: 'FOMC', isoDate: '2026-07-29', utcHour: 18 },
  { type: 'FOMC', isoDate: '2026-09-16', utcHour: 18 },
  { type: 'FOMC', isoDate: '2026-10-28', utcHour: 18 },
  { type: 'FOMC', isoDate: '2026-12-09', utcHour: 19 },
  // CPI 2026 (monthly, ~12:30 UTC on listed date — date varies, verify quarterly)
  { type: 'CPI', isoDate: '2026-01-13', utcHour: 13 },
  { type: 'CPI', isoDate: '2026-02-11', utcHour: 13 },
  { type: 'CPI', isoDate: '2026-03-11', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-04-14', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-05-12', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-06-09', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-07-14', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-08-11', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-09-09', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-10-14', utcHour: 12 },
  { type: 'CPI', isoDate: '2026-11-12', utcHour: 13 },
  { type: 'CPI', isoDate: '2026-12-09', utcHour: 13 },
];

function eventTimestampMs(e: MacroEvent): number {
  const [y, m, d] = e.isoDate.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!, e.utcHour, 0, 0, 0);
}

function isNearEvent(
  type: MacroEvent['type'],
  now: number,
  beforeMs: number,
  afterMs: number,
): { hit: boolean; eventDate?: string } {
  for (const e of EVENTS_2026) {
    if (e.type !== type) continue;
    const ts = eventTimestampMs(e);
    if (now >= ts - beforeMs && now <= ts + afterMs) {
      return { hit: true, eventDate: e.isoDate };
    }
  }
  return { hit: false };
}

export function isWithinFOMC(
  now: number,
  beforeMs: number = 2 * 3600_000,
  afterMs: number = 4 * 3600_000,
): { hit: boolean; eventDate?: string } {
  return isNearEvent('FOMC', now, beforeMs, afterMs);
}

export function isWithinCPI(
  now: number,
  beforeMs: number = 1 * 3600_000,
  afterMs: number = 2 * 3600_000,
): { hit: boolean; eventDate?: string } {
  return isNearEvent('CPI', now, beforeMs, afterMs);
}

// Stage 22.1 (production tuning, 2026-05-10): weekend window disabled for retail
//   crypto targeting. Stage 22 borrowed Fri 22:00 UTC → Sun 16:00 UTC from
//   institutional FX desks where weekend liquidity dries up. Crypto is 24/7 with
//   meaningfully active weekend volume (Binance Sat 24h volume routinely 60-80%
//   of weekday). Korean retail (the primary audience) is OFF work weekends → that
//   is the audience's PRIMARY engagement window. Killing all weekend signals to
//   chase a marginal liquidity quality bump is exactly backwards for this product.
//   FOMC / CPI / BTC.D suppressions remain — those are actual macro risk windows.
//   Set SIGNAL_BLOCK_WEEKEND=true env to re-enable the institutional behavior.
export function isWeekendWindow(now: number): boolean {
  if (process.env.SIGNAL_BLOCK_WEEKEND !== 'true') return false;
  const d = new Date(now);
  const dow = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = d.getUTCHours();
  if (dow === 6) return true; // all of Saturday UTC
  if (dow === 5 && hour >= 22) return true; // Fri after 22:00 UTC
  if (dow === 0 && hour < 16) return true; // Sun before 16:00 UTC
  return false;
}

// Test-only export — lets unit tests verify the calendar without re-deriving dates.
export const __test__ = { EVENTS_2026, eventTimestampMs };
