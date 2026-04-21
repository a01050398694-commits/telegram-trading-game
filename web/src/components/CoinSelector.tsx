import { useEffect, useMemo, useRef, useState } from 'react';
import { MARKETS, getMarket, searchMarkets, type MarketSymbol } from '../lib/markets';
import { hapticSelection } from '../utils/telegram';

type CoinSelectorProps = {
  symbol: MarketSymbol;
  onChange: (next: MarketSymbol) => void;
};

// Stage 8.0 — Binance 스타일 검색 모달.
// 헤더 밑 한 줄 버튼: 현재 심볼(₿ BTC/USDT ▾) 탭 → 풀스크린 모달 열림.
// 모달: 검색 input + 필터링된 60+ 코인 리스트. 탭하면 선택 후 닫힘.
export function CoinSelector({ symbol, onChange }: CoinSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = getMarket(symbol);

  const handlePick = (next: string) => {
    if (next !== symbol) hapticSelection();
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          setOpen(true);
        }}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-left transition-colors hover:bg-slate-800/80 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${current.color}`}>
            {current.icon}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-mono text-xs font-black tracking-tight text-white">
              {current.display}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              {current.name} · Perpetual
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
          <span>Change</span>
          <span className="text-sm">▾</span>
        </span>
      </button>

      {open && <CoinSearchModal current={symbol} onPick={handlePick} onClose={() => setOpen(false)} />}
    </>
  );
}

// -----------------------------------------------------------------------------
// 모달 — 별도 컴포넌트로 분리해 본체 가독성 확보.
// -----------------------------------------------------------------------------
function CoinSearchModal({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (symbol: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo(() => searchMarkets(query), [query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="grain glass-specular relative flex h-[78vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950/95 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="text-sm font-black tracking-tight text-white">Select Market</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-bold text-white/50 hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-white/5 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search BTC, ETH, PEPE..."
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm font-medium text-white placeholder:text-white/30 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
          />
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/30">
            <span>{results.length} / {MARKETS.length} markets</span>
            <span>Perpetual Futures</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && (
            <div className="py-10 text-center text-xs text-white/40">No markets match "{query}"</div>
          )}
          {results.map((m) => {
            const active = m.symbol === current;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => onPick(m.symbol)}
                className={`flex w-full items-center justify-between px-4 py-2.5 transition-colors ${
                  active ? 'bg-indigo-500/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${m.color}`}>
                    {m.icon}
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="font-mono text-sm font-black tracking-tight text-white">
                      {m.display}
                    </span>
                    <span className="text-[10px] font-medium text-white/40">{m.name}</span>
                  </span>
                </span>
                {active && (
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-300">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
