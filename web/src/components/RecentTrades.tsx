import { useRecentTrades } from '../lib/useRecentTrades';
import { formatUSD } from '../lib/format';

// Stage 7.5 Bugfix — 2컬럼 모바일 쓰임에 맞춘 컴팩트 체결 목록.
// 10행 → 5행, Time 간결화(분:초), text-[9px].

type RecentTradesProps = {
  symbol: string;
  rows?: number;
};

export function RecentTrades({ symbol, rows = 5 }: RecentTradesProps) {
  const { trades, status } = useRecentTrades(symbol);

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-2 text-[10px]">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="font-black uppercase tracking-[0.25em] text-white/40">
          Trades
        </span>
        <span
          className={`h-1 w-1 rounded-full ${
            status === 'live'
              ? 'bg-emerald-400 animate-pulse'
              : status === 'loading'
                ? 'bg-amber-400'
                : 'bg-rose-500'
          }`}
        />
      </div>

      <div className="grid grid-cols-3 px-1 pb-0.5 text-[9px] font-black uppercase tracking-wider text-white/30">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex flex-col">
        {trades.slice(0, rows).map((t) => {
          const isBuy = t.aggressor === 'buy';
          const color = isBuy ? 'text-[var(--color-accent-long)]' : 'text-[var(--color-accent-short)]';
          const glow = isBuy
            ? 'drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]'
            : 'drop-shadow-[0_0_4px_rgba(251,113,133,0.4)]';
          const d = new Date(t.time);
          const mm = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          return (
            <div
              key={t.id}
              className="grid grid-cols-3 items-center px-1 py-1 font-mono leading-tight"
            >
              <span className={`font-bold tabular-nums ${color} ${glow}`}>
                {formatUSD(t.price)}
              </span>
              <span className="text-right font-semibold tabular-nums text-white/70">
                {t.qty.toFixed(3)}
              </span>
              <span className="text-right tabular-nums text-white/30">
                {mm}:{ss}
              </span>
            </div>
          );
        })}
        {trades.length === 0 && (
          <div className="px-1 py-2 text-center text-white/30">…</div>
        )}
      </div>
    </div>
  );
}
