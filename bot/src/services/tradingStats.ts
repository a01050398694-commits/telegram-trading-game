// Stage 20 — Performance aggregator over signal_outcomes.
// Why: /stats command + dailyReport + monthlyReport all share the same aggregation logic;
//   keep it DB-agnostic so it can be unit-tested without supabase mocks.

import { createSupabase } from '../db/supabase.js';

const supabase = createSupabase();

export interface OutcomeRow {
  symbol: string;
  direction: 'long' | 'short';
  status: 'open' | 'closed';
  hit: 'tp1' | 'tp2' | 'sl' | 'timeout' | null;
  pnl_r_net: number | null;
  broadcast_at: string;
}

export interface SymbolBucket {
  symbol: string;
  entries: number;
  wins: number;
  winRate: number;
  avgPnlR: number;
  totalPnlR: number;
}

export interface DirectionBucket {
  count: number;
  wins: number;
  winRate: number;
  avgPnlR: number;
}

export interface PerformanceStats {
  windowDays: number;
  totalSignals: number;
  closedSignals: number;
  openSignals: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  avgPnlR: number;
  totalPnlR: number;
  maxConsecutiveLosses: number;
  maxDrawdownR: number;
  perSymbol: SymbolBucket[];
  perDirection: { long: DirectionBucket; short: DirectionBucket };
  monthlyReturns: Array<{ month: string; netPnlR: number; entries: number }>;
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function emptyDirectionBucket(): DirectionBucket {
  return { count: 0, wins: 0, winRate: 0, avgPnlR: 0 };
}

export function computeStatsFromRows(
  rows: OutcomeRow[],
  windowDays: number
): PerformanceStats {
  const closed = rows.filter((r) => r.status === 'closed' && typeof r.pnl_r_net === 'number');
  const open = rows.filter((r) => r.status === 'open');

  const wins = closed.filter((r) => (r.pnl_r_net ?? 0) > 0).length;
  const losses = closed.filter((r) => (r.pnl_r_net ?? 0) < 0).length;
  const timeouts = closed.filter((r) => r.hit === 'timeout').length;
  const totalPnlR = closed.reduce((sum, r) => sum + (r.pnl_r_net ?? 0), 0);

  // Time-ordered streak + drawdown.
  const sorted = closed.slice().sort((a, b) => a.broadcast_at.localeCompare(b.broadcast_at));
  let lossStreak = 0;
  let maxLossStreak = 0;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of sorted) {
    const r_net = r.pnl_r_net ?? 0;
    equity += r_net;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (r_net < 0) {
      lossStreak++;
      if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
    } else if (r_net > 0) {
      lossStreak = 0;
    }
  }

  // Per-symbol.
  const symbolMap = new Map<string, OutcomeRow[]>();
  for (const r of closed) {
    const list = symbolMap.get(r.symbol) ?? [];
    list.push(r);
    symbolMap.set(r.symbol, list);
  }
  const perSymbol: SymbolBucket[] = [];
  for (const [symbol, list] of symbolMap.entries()) {
    const w = list.filter((r) => (r.pnl_r_net ?? 0) > 0).length;
    const total = list.reduce((sum, r) => sum + (r.pnl_r_net ?? 0), 0);
    perSymbol.push({
      symbol,
      entries: list.length,
      wins: w,
      winRate: safeDiv(w, list.length),
      avgPnlR: safeDiv(total, list.length),
      totalPnlR: total,
    });
  }
  perSymbol.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Per-direction.
  const longRows = closed.filter((r) => r.direction === 'long');
  const shortRows = closed.filter((r) => r.direction === 'short');
  const perDirection = {
    long: longRows.length === 0
      ? emptyDirectionBucket()
      : {
          count: longRows.length,
          wins: longRows.filter((r) => (r.pnl_r_net ?? 0) > 0).length,
          winRate: safeDiv(
            longRows.filter((r) => (r.pnl_r_net ?? 0) > 0).length,
            longRows.length
          ),
          avgPnlR: safeDiv(
            longRows.reduce((s, r) => s + (r.pnl_r_net ?? 0), 0),
            longRows.length
          ),
        },
    short: shortRows.length === 0
      ? emptyDirectionBucket()
      : {
          count: shortRows.length,
          wins: shortRows.filter((r) => (r.pnl_r_net ?? 0) > 0).length,
          winRate: safeDiv(
            shortRows.filter((r) => (r.pnl_r_net ?? 0) > 0).length,
            shortRows.length
          ),
          avgPnlR: safeDiv(
            shortRows.reduce((s, r) => s + (r.pnl_r_net ?? 0), 0),
            shortRows.length
          ),
        },
  };

  // Monthly returns — group by YYYY-MM of broadcast_at.
  const monthMap = new Map<string, { netPnlR: number; entries: number }>();
  for (const r of closed) {
    const ym = r.broadcast_at.slice(0, 7);
    const cur = monthMap.get(ym) ?? { netPnlR: 0, entries: 0 };
    cur.netPnlR += r.pnl_r_net ?? 0;
    cur.entries++;
    monthMap.set(ym, cur);
  }
  const monthlyReturns = Array.from(monthMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    windowDays,
    totalSignals: rows.length,
    closedSignals: closed.length,
    openSignals: open.length,
    wins,
    losses,
    timeouts,
    winRate: safeDiv(wins, closed.length),
    avgPnlR: safeDiv(totalPnlR, closed.length),
    totalPnlR,
    maxConsecutiveLosses: maxLossStreak,
    maxDrawdownR: maxDrawdown,
    perSymbol,
    perDirection,
    monthlyReturns,
  };
}

export async function computeStats(windowDays: number): Promise<PerformanceStats> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('symbol, direction, status, hit, pnl_r_net, broadcast_at')
    .gte('broadcast_at', since)
    .order('broadcast_at', { ascending: true });

  if (error) throw new Error(`computeStats query failed: ${error.message}`);
  return computeStatsFromRows((data ?? []) as OutcomeRow[], windowDays);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function rstr(n: number): string {
  return n >= 0 ? `+${n.toFixed(2)}R` : `${n.toFixed(2)}R`;
}

export function formatStatsForTelegram(stats: PerformanceStats): string {
  const lines: string[] = [];
  lines.push(`📊 *Last ${stats.windowDays}d performance*`);
  lines.push('');
  lines.push(`Total signals: ${stats.totalSignals} (closed ${stats.closedSignals} / open ${stats.openSignals})`);
  if (stats.closedSignals === 0) {
    lines.push('No closed signals yet — first 48h tracking window in progress.');
    return lines.join('\n');
  }
  lines.push(`Win rate: ${pct(stats.winRate)} (W ${stats.wins} / L ${stats.losses} / T ${stats.timeouts})`);
  lines.push(`Avg R: ${rstr(stats.avgPnlR)}`);
  lines.push(`Total R: ${rstr(stats.totalPnlR)}`);
  lines.push(`Max consecutive losses: ${stats.maxConsecutiveLosses}`);
  lines.push(`Max drawdown: ${rstr(-stats.maxDrawdownR)}`);

  if (stats.perSymbol.length > 0) {
    lines.push('');
    lines.push('*By symbol*');
    for (const s of stats.perSymbol) {
      lines.push(
        `• ${s.symbol}: ${pct(s.winRate)} (${s.entries}) · avg ${rstr(s.avgPnlR)} · total ${rstr(s.totalPnlR)}`
      );
    }
  }

  lines.push('');
  lines.push('*By direction*');
  lines.push(
    `• LONG: ${pct(stats.perDirection.long.winRate)} (${stats.perDirection.long.count}) · avg ${rstr(stats.perDirection.long.avgPnlR)}`
  );
  lines.push(
    `• SHORT: ${pct(stats.perDirection.short.winRate)} (${stats.perDirection.short.count}) · avg ${rstr(stats.perDirection.short.avgPnlR)}`
  );

  if (stats.monthlyReturns.length > 0) {
    lines.push('');
    lines.push('*Monthly net*');
    for (const m of stats.monthlyReturns) {
      lines.push(`• ${m.month}: ${rstr(m.netPnlR)} (${m.entries})`);
    }
  }

  return lines.join('\n');
}
