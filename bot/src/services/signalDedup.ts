// Stage 22 — Setup-hash dedup with rolling time window.
// Why: 5 broadcast signals on 2026-05-06 had identical H4 structure (swingHigh
//   $79,143.40 / swingLow $78,230.48) firing within 2h22m. The hash anchors to that
//   structure (NOT to the live entry price) because:
//     1. The same H4 swing window produces the same trade setup, even if currentPrice
//        drifts $200-$400 across ticks.
//     2. Price-based hashes fragment with tick noise — a 25 bps bucket at $80k = $200,
//        which is one candle's range; nearby entries miss the same bucket and slip
//        through dedup.
//     3. Structure changes when a new swing forms or BOS occurs — that IS a new setup
//        and should be allowed to broadcast.

import { createSupabase } from '../db/supabase.js';
import type { Signal } from './signalEngine.js';

const supabase = createSupabase();

const DEFAULT_DEDUP_WINDOW_HOURS = 6;

function getDedupConfig(): { windowHours: number } {
  const winRaw = process.env.SIGNAL_DEDUP_WINDOW_HOURS;
  const win = winRaw ? Number(winRaw) : DEFAULT_DEDUP_WINDOW_HOURS;
  return {
    windowHours: Number.isFinite(win) && win > 0 ? win : DEFAULT_DEDUP_WINDOW_HOURS,
  };
}

/**
 * Stable, deterministic hash of the economically-distinct setup.
 * Format: SYM|DIR|swingHigh|swingLow
 * Why: see file header. Structure is the right grain — entry/SL/TP are derived
 *   from it, so anchoring on structure naturally catches all setups born from the
 *   same H4 swing window without fragmenting on price noise.
 */
export function setupHash(s: Signal): string {
  const swH = s.structure.recentSwingHigh.toFixed(2);
  const swL = s.structure.recentSwingLow.toFixed(2);
  return `${s.symbol}|${s.direction}|${swH}|${swL}`;
}

export interface DedupCheckResult {
  isDuplicate: boolean;
  hash: string;
  windowHours: number;
  matchedAt?: string;
}

/**
 * Returns isDuplicate=true if a signal with the same setup_hash was broadcast (status
 * IN ('open','closed')) within the dedup window. Skipped/deduped/invalid rows do NOT
 * count — they didn't actually go to the channel.
 */
export async function checkDuplicate(s: Signal): Promise<DedupCheckResult> {
  const cfg = getDedupConfig();
  const hash = setupHash(s);
  const cutoff = new Date(Date.now() - cfg.windowHours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('id, broadcast_at')
    .eq('setup_hash', hash)
    .gte('broadcast_at', cutoff)
    .in('status', ['open', 'closed'])
    .order('broadcast_at', { ascending: false })
    .limit(1);
  if (error) {
    // Why: never silently allow on DB failure — that would re-introduce the bug we
    //   just fixed. Treat error as "uncertain" → caller decides (signalCron treats
    //   uncertain as block, log, and skip this tick).
    console.warn('[signalDedup] check failed:', error.message);
    return { isDuplicate: true, hash, windowHours: cfg.windowHours };
  }
  if (data && data.length > 0) {
    return {
      isDuplicate: true,
      hash,
      windowHours: cfg.windowHours,
      matchedAt: data[0]!.broadcast_at as string,
    };
  }
  return { isDuplicate: false, hash, windowHours: cfg.windowHours };
}

// Test-only exports for unit testing the bucketing logic without DB.
export const __test__ = { getDedupConfig };
