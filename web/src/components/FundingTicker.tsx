import { useEffect, useState } from 'react';
import { formatCountdown, useFundingRate } from '../lib/useFundingRate';

// Stage 7.5 — 퍼페츄얼 거래소 특유의 "Funding" 바.
// Binance 웹에서 차트 위에 보이는 작은 텍스트 — 프로트레이더 느낌 즉시 상승.
//
// 색상 규칙 (Binance 준수):
//   · rate > 0  → 롱이 숏에게 지불 (Long heavy) → 녹색
//   · rate < 0  → 숏이 롱에게 지불 → 빨간색

type FundingTickerProps = {
  symbol: string;
};

export function FundingTicker({ symbol }: FundingTickerProps) {
  const { rate, nextFundingTime, status } = useFundingRate(symbol);

  // 1초마다 tick — 카운트다운 갱신. 별도 WS 아니라 단순 timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pct = rate * 100; // 0.0001 → 0.0100%
  const rateColor = rate > 0 ? 'text-emerald-400' : rate < 0 ? 'text-rose-400' : 'text-slate-300';
  const countdown = nextFundingTime > 0 ? formatCountdown(nextFundingTime, now) : '--:--:--';

  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-900/60 px-3 py-1.5 font-mono text-[10px]">
      <span className="font-black uppercase tracking-[0.3em] text-white/40">
        Funding
      </span>
      <div className="flex items-center gap-3">
        <span className={`font-black tabular-nums ${rateColor}`}>
          {status === 'loading' ? '…' : `${pct >= 0 ? '+' : ''}${pct.toFixed(4)}%`}
        </span>
        <span className="font-bold uppercase tracking-wider text-white/30">
          next <span className="font-black tabular-nums text-white/70 normal-case">{countdown}</span>
        </span>
      </div>
    </div>
  );
}
