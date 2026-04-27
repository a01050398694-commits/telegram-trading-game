import { useState } from 'react';
import {
  formatMoney,
  formatUSD,
  liquidationPrice,
  distanceToLiquidation,
  calcPnl,
} from '../lib/format';
import { hapticImpact, hapticSelection } from '../utils/telegram';

export type Side = 'long' | 'short';

export type Position = {
  side: Side;
  entryPrice: number;
  size: number;
  leverage: number;
};

type ActionPanelProps = {
  position: Position | null;
  markPrice: number | null;
  balance: number;
  pending?: boolean;
  errorMessage?: string | null;
  disabled?: boolean;
  onOpen: (args: { side: Side; size: number; leverage: number }) => void;
  onClose: () => void;
};

const LEVERAGE_PRESETS = [1, 5, 10, 25, 50, 100, 125] as const;
const SIZE_PRESETS = [25, 50, 75, 100] as const;

// 프로급 주문 패널. 포지션 존재 시 CLOSE 전용, 없으면 풀 주문 인터페이스.
// 레버리지/사이즈 선택 → 양방향 청산가 프리뷰 → LONG/SHORT 원클릭.
export function ActionPanel({
  position,
  markPrice,
  balance,
  pending = false,
  errorMessage = null,
  disabled = false,
  onOpen,
  onClose,
}: ActionPanelProps) {
  const [leverage, setLeverage] = useState(10);
  const [sizePct, setSizePct] = useState(10);

  const size = Math.floor((balance * sizePct) / 100);
  const leverageColor =
    leverage >= 100
      ? 'text-rose-400'
      : leverage >= 50
        ? 'text-orange-400'
        : leverage >= 20
          ? 'text-amber-400'
          : 'text-emerald-400';

  if (position && markPrice !== null) {
    const liq = liquidationPrice(position.side, position.entryPrice, position.leverage);
    const dist = distanceToLiquidation(position.side, markPrice, liq);
    const pnl = calcPnl(
      position.side,
      position.entryPrice,
      markPrice,
      position.size,
      position.leverage,
    );
    const pnlPct = (pnl / position.size) * 100;
    const pnlColor = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : 'text-slate-300';
    const sideBg =
      position.side === 'long'
        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
        : 'bg-rose-500/15 border-rose-500/40 text-rose-400';
    const dangerClass =
      dist < 5 ? 'text-rose-400' : dist < 15 ? 'text-amber-400' : 'text-slate-300';

    return (
      <div className="w-full space-y-2">
        <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
          <div className="flex items-center justify-between">
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-black uppercase tracking-widest ${sideBg}`}
            >
              {position.side} · {position.leverage}x
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-white/50">
              Entry ${formatUSD(position.entryPrice)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">PnL</div>
              <div className={`font-mono text-base font-black tabular-nums ${pnlColor}`}>
                {pnl > 0 ? '+' : ''}
                {formatMoney(pnl)}
              </div>
              <div className={`font-mono text-[10px] font-bold tabular-nums ${pnlColor}`}>
                {pnl > 0 ? '+' : ''}
                {pnlPct.toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Liq. Price</div>
              <div className="font-mono text-base font-black tabular-nums text-white">
                ${formatUSD(liq)}
              </div>
              <div className={`font-mono text-[10px] font-bold tabular-nums ${dangerClass}`}>
                {dist.toFixed(2)}% away
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-white/5 pt-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
            <span>Margin </span>
            <span className="font-mono text-white/60 tabular-nums normal-case">{formatMoney(position.size)}</span>
            <span> · Notional </span>
            <span className="font-mono text-white/60 tabular-nums normal-case">{formatMoney(position.size * position.leverage)}</span>
          </div>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            hapticImpact('medium');
            onClose();
          }}
          className="relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-600 to-slate-800 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),_0_4px_14px_rgba(0,0,0,0.45)] transition-all duration-100 hover:brightness-110 active:scale-[0.97] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:cursor-wait disabled:from-slate-700/60 disabled:to-slate-800/60"
        >
          <span className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/15 to-transparent" />
          <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
            {pending ? 'Closing…' : 'Close Position'}
          </span>
        </button>
        {errorMessage && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  const longLiq =
    markPrice !== null ? liquidationPrice('long', markPrice, leverage) : null;
  const shortLiq =
    markPrice !== null ? liquidationPrice('short', markPrice, leverage) : null;
  const isLoadingPrice = markPrice === null;
  const canOpen = markPrice !== null && size > 0 && balance > 0 && !pending && !disabled;

  return (
    <div className="w-full space-y-2">
      <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            Leverage
          </span>
          <span className={`font-mono text-lg font-black tabular-nums ${leverageColor}`}>{leverage}x</span>
        </div>

        <input
          type="range"
          min={1}
          max={125}
          step={1}
          value={leverage}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (next !== leverage) hapticSelection();
            setLeverage(next);
          }}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-amber-400"
          style={{
            background: `linear-gradient(to right, rgb(251 191 36) 0%, rgb(251 191 36) ${
              ((leverage - 1) / 124) * 100
            }%, rgb(30 41 59) ${((leverage - 1) / 124) * 100}%, rgb(30 41 59) 100%)`,
          }}
        />

        <div className="mt-2 grid grid-cols-7 gap-1">
          {LEVERAGE_PRESETS.map((lev) => (
            <button
              key={lev}
              type="button"
              onClick={() => {
                if (lev !== leverage) hapticSelection();
                setLeverage(lev);
              }}
              className={`rounded-md py-1 text-[10px] font-bold transition-colors ${
                leverage === lev
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            Margin
          </span>
          <span className="font-mono text-sm font-black tabular-nums text-white">{formatMoney(size)}</span>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1">
          {SIZE_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                if (pct !== sizePct) hapticSelection();
                setSizePct(pct);
              }}
              className={`rounded-md py-1.5 text-[11px] font-bold transition-colors ${
                sizePct === pct
                  ? 'bg-white/10 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {pct === 100 ? 'MAX' : `${pct}%`}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/30">
          <span>Notional</span>
          <span className="font-mono tabular-nums text-white/60">
            {formatMoney(size * leverage)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => {
            hapticImpact('heavy');
            onOpen({ side: 'long', size, leverage });
          }}
          className="group relative flex flex-col items-stretch overflow-hidden rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-3 py-3 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),_inset_0_-1px_1px_rgba(0,0,0,0.25),_0_6px_18px_rgba(16,185,129,0.4)] transition-all duration-100 hover:brightness-110 active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),_0_1px_2px_rgba(16,185,129,0.2)] disabled:cursor-not-allowed disabled:from-emerald-700/40 disabled:to-emerald-800/40 disabled:shadow-none"
        >
          {/* 상단 specular 광택 — 물리 버튼 하이라이트 */}
          <span className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/25 to-transparent" />
          <span className="relative text-[11px] font-black uppercase tracking-widest text-white/85">
            Long / Buy
          </span>
          <span className="relative mt-0.5 font-mono text-xl font-black leading-none tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
            {pending ? '…' : isLoadingPrice ? 'Loading...' : '▲ LONG'}
          </span>
          <span className="relative mt-2 font-mono text-[10px] font-semibold text-white/70">
            Liq. ${longLiq !== null ? formatUSD(longLiq) : '--'}
          </span>
        </button>

        <button
          type="button"
          disabled={!canOpen}
          onClick={() => {
            hapticImpact('heavy');
            onOpen({ side: 'short', size, leverage });
          }}
          className="group relative flex flex-col items-stretch overflow-hidden rounded-xl bg-gradient-to-b from-rose-400 to-rose-600 px-3 py-3 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),_inset_0_-1px_1px_rgba(0,0,0,0.25),_0_6px_18px_rgba(244,63,94,0.4)] transition-all duration-100 hover:brightness-110 active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),_0_1px_2px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:from-rose-700/40 disabled:to-rose-800/40 disabled:shadow-none"
        >
          <span className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/25 to-transparent" />
          <span className="relative text-[11px] font-black uppercase tracking-widest text-white/85">
            Short / Sell
          </span>
          <span className="relative mt-0.5 font-mono text-xl font-black leading-none tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
            {pending ? '…' : isLoadingPrice ? 'Loading...' : '▼ SHORT'}
          </span>
          <span className="relative mt-2 font-mono text-[10px] font-semibold text-white/70">
            Liq. ${shortLiq !== null ? formatUSD(shortLiq) : '--'}
          </span>
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
