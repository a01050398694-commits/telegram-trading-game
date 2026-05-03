// Stage 20 PATCH v2 — Cleanup orphaned open outcomes after restart.
// Why: trackSignalOutcome polls in-memory. If the process dies during the 48h window, the row
//   stays status='open' forever — distorting /stats. This cron sweeps every 1h (and on boot)
//   and force-closes anything whose broadcast_at is more than 48h old.

import { createSupabase } from '../db/supabase.js';
import { fetchKlinesWithTime, type FuturesSymbol } from '../services/marketData.js';

const supabase = createSupabase();
const FEE_R_DEDUCTION = 0.13;
const STALE_THRESHOLD_MS = 48 * 3_600_000;

interface OpenRow {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  sl_price: number;
  broadcast_at: string;
}

export async function runSignalCleanup(): Promise<{ marked: number; errors: number }> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('id, symbol, direction, entry_price, sl_price, broadcast_at')
    .eq('status', 'open')
    .lt('broadcast_at', cutoff);

  if (error) {
    console.warn('[signalCleanup] query failed:', error.message);
    return { marked: 0, errors: 1 };
  }
  const rows = (data ?? []) as OpenRow[];

  let marked = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const candles = await fetchKlinesWithTime(row.symbol as FuturesSymbol, 1, '5m');
      const lastClose =
        candles && candles.length > 0
          ? candles[candles.length - 1]!.close
          : row.entry_price;
      const slDist = Math.abs(row.entry_price - row.sl_price);
      const grossR =
        slDist > 0
          ? row.direction === 'long'
            ? (lastClose - row.entry_price) / slDist
            : (row.entry_price - lastClose) / slDist
          : 0;
      const netR = grossR - FEE_R_DEDUCTION;

      const { error: updateErr } = await supabase
        .from('signal_outcomes')
        .update({
          status: 'closed',
          hit: 'timeout',
          exit_price: lastClose,
          exit_at: new Date().toISOString(),
          duration_hours: 48,
          pnl_r_gross: grossR,
          pnl_r_net: netR,
        })
        .eq('id', row.id);
      if (updateErr) {
        errors++;
        console.warn(`[signalCleanup] update ${row.id} failed:`, updateErr.message);
      } else {
        marked++;
      }
    } catch (err) {
      errors++;
      console.warn(`[signalCleanup] row ${row.id} error:`, err);
    }
  }

  if (marked > 0 || errors > 0) {
    console.log(`[signalCleanup] marked ${marked} timeouts, ${errors} errors`);
  }
  return { marked, errors };
}
