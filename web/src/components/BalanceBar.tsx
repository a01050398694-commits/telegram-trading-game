import { formatMoney } from '../lib/format';

type BalanceBarProps = {
  balance: number;
  pnl: number;
  hasPosition: boolean;
};

// Stage 7.8 — Typography hierarchy: Equity/PnL 은 font-black 대형, 레이블은 text-white/40.
export function BalanceBar({ balance, pnl, hasPosition }: BalanceBarProps) {
  const basis = balance - pnl;
  const pnlPct = basis > 0 ? (pnl / basis) * 100 : 0;
  const color =
    pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : 'text-white/60';

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/80 px-3 py-2">
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
          Equity
        </div>
        <div className="font-mono text-sm font-black tabular-nums text-white">
          {formatMoney(balance)}
          <span className="ml-1 text-[10px] font-bold text-white/30">USD</span>
        </div>
      </div>
      {hasPosition ? (
        <div className="text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
            Unrealized
          </div>
          <div className={`font-mono text-sm font-black tabular-nums ${color}`}>
            {pnl > 0 ? '+' : ''}
            {formatMoney(pnl)}
            <span className="ml-1 text-[10px] font-bold">
              ({pnl > 0 ? '+' : ''}
              {pnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>
      ) : (
        <div className="text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
            Status
          </div>
          <div className="font-mono text-xs font-bold text-white/60">No Position</div>
        </div>
      )}
    </div>
  );
}
