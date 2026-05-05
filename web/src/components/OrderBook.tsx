import { useEffect, useRef } from 'react';
import { useOrderBook, type DepthLevel } from '../lib/useOrderBook';
import { formatUSD } from '../lib/format';

// Stage 7.5 Bugfix — 모바일 2컬럼에 맞춘 초 컴팩트 호가창.
// · 상위 5 bid / 5 ask 만 노출 (원래 10 → 5, ActionPanel 가시성 확보)
// · Total 컬럼 제거 (Price, Qty 만)
// · text-[9px] + py-[2px] 로 세로 공간 극단 축소
// · 가격 flash 애니메이션은 유지 (유동성 느낌)

type OrderBookProps = {
  symbol: string;
  midPrice: number | null;
  rows?: number;
};

export function OrderBook({ symbol, midPrice, rows = 5 }: OrderBookProps) {
  const { bids, asks, status, maxTotal } = useOrderBook(symbol);

  const bestAsk = asks[0]?.price ?? null;
  const bestBid = bids[0]?.price ?? null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;

  const mid =
    bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : midPrice;

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-2 text-[10px]">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="font-black uppercase tracking-[0.25em] text-white/40">
          Book
        </span>
        <StatusDot status={status} />
      </div>

      <div className="grid grid-cols-2 px-1 pb-0.5 text-[9px] font-black uppercase tracking-wider text-white/30">
        <span>Price</span>
        <span className="text-right">Qty</span>
      </div>

      <div className="flex flex-col-reverse">
        {asks.slice(0, rows).map((l) => (
          <DepthRow key={`a-${l.price}`} level={l} side="ask" maxTotal={maxTotal} />
        ))}
        {asks.length === 0 && <EmptyRows side="ask" />}
      </div>

      <div className="my-1 flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-slate-800/70 px-2 py-1 font-mono text-[10px]">
        <span className="font-black tabular-nums text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.2)]">
          {mid !== null ? `$${formatUSD(mid)}` : '--'}
        </span>
        <span className="font-bold tabular-nums text-white/40">
          {spread !== null ? `${spread.toFixed(2)}` : '—'}
        </span>
      </div>

      <div className="flex flex-col">
        {bids.slice(0, rows).map((l) => (
          <DepthRow key={`b-${l.price}`} level={l} side="bid" maxTotal={maxTotal} />
        ))}
        {bids.length === 0 && <EmptyRows side="bid" />}
      </div>
    </div>
  );
}

function DepthRow({
  level,
  side,
  maxTotal,
}: {
  level: DepthLevel;
  side: 'ask' | 'bid';
  maxTotal: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prevPriceRef = useRef(level.price);

  useEffect(() => {
    if (prevPriceRef.current !== level.price && ref.current) {
      const el = ref.current;
      el.style.transition = 'background-color 80ms ease-out';
      el.style.backgroundColor =
        side === 'ask' ? 'rgba(244, 63, 94, 0.22)' : 'rgba(16, 185, 129, 0.22)';
      const t = window.setTimeout(() => {
        el.style.backgroundColor = 'transparent';
      }, 200);
      prevPriceRef.current = level.price;
      return () => window.clearTimeout(t);
    }
  }, [level.price, side]);

  const depthPct = Math.min(100, (level.total / maxTotal) * 100);
  const priceColor = side === 'ask' ? 'text-[var(--color-accent-short)]' : 'text-[var(--color-accent-long)]';
  const barColor = side === 'ask' ? 'bg-rose-500/10' : 'bg-emerald-500/10';
  // Neon glow — 빠르게 갱신되는 숫자가 물 위에 떠있는 듯한 느낌.
  const glow =
    side === 'ask'
      ? 'drop-shadow-[0_0_4px_rgba(251,113,133,0.45)]'
      : 'drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]';

  return (
    <div
      ref={ref}
      className="relative flex items-center px-1 py-1 font-mono leading-tight gap-2"
    >
      {/* Bid depth bar (left-aligned) */}
      {side === 'bid' && (
        <div
          className={`pointer-events-none ${barColor} rounded-sm flex-shrink-0`}
          style={{ width: `${depthPct}%`, minWidth: '1px', maxWidth: '40%', height: '16px' }}
          aria-hidden="true"
        />
      )}

      {/* Price and Qty (center) */}
      <div className="flex flex-1 items-center justify-between min-w-0">
        <span className={`font-bold tabular-nums ${priceColor} ${glow}`}>
          {formatUSD(level.price)}
        </span>
        <span className="text-right font-semibold text-white/70 tabular-nums text-[9px]">
          {level.qty.toFixed(3)}
        </span>
      </div>

      {/* Ask depth bar (right-aligned) */}
      {side === 'ask' && (
        <div
          className={`pointer-events-none ${barColor} rounded-sm flex-shrink-0 ml-auto`}
          style={{ width: `${depthPct}%`, minWidth: '1px', maxWidth: '40%', height: '16px' }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function EmptyRows({ side }: { side: 'ask' | 'bid' }) {
  return (
    <div className={`px-0.5 py-1 text-center text-[9px] ${side === 'ask' ? 'text-rose-500/50' : 'text-emerald-500/50'}`}>
      …
    </div>
  );
}

function StatusDot({ status }: { status: 'loading' | 'live' | 'error' }) {
  const color =
    status === 'live' ? 'bg-emerald-400 animate-pulse' : status === 'loading' ? 'bg-amber-400' : 'bg-rose-500';
  return <span className={`h-1 w-1 rounded-full ${color}`} />;
}
