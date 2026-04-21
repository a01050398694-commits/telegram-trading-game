import { useEffect, useState } from 'react';

// Stage 7.5 — 퍼페츄얼 Funding Rate + 다음 정산까지 카운트다운.
//
// 출처: Binance Futures premiumIndex (fapi.binance.com) — 30초마다 REST 폴링.
// 이보다 빠른 WS 도 있지만 UX 상 30s 이면 충분하고 초당 토큰 낭비 방지.
//
// Funding 은 보통 8시간 주기 (00:00 / 08:00 / 16:00 UTC). next = lastFundingTime + 8h.

export type FundingInfo = {
  rate: number; // lastFundingRate, e.g. 0.0001 (= 0.01%)
  nextFundingTime: number; // ms epoch
  status: 'loading' | 'live' | 'error';
};

const REST_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';

type RawPremiumIndex = {
  symbol: string;
  lastFundingRate: string;
  nextFundingTime: number; // ms
};

export function useFundingRate(symbol: string): FundingInfo {
  const [rate, setRate] = useState(0);
  const [nextFundingTime, setNextFundingTime] = useState(0);
  const [status, setStatus] = useState<FundingInfo['status']>('loading');

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const url = `${REST_URL}?symbol=${symbol.toUpperCase()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`premiumIndex HTTP ${res.status}`);
        const d = (await res.json()) as RawPremiumIndex;
        if (cancelled) return;
        setRate(parseFloat(d.lastFundingRate));
        setNextFundingTime(d.nextFundingTime);
        setStatus('live');
      } catch (err) {
        console.error('[funding] fetch failed', err);
        if (!cancelled) setStatus('error');
      }
    };

    fetchOnce();
    const id = window.setInterval(fetchOnce, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol]);

  return { rate, nextFundingTime, status };
}

// 남은 시간을 "HH:MM:SS" 포맷으로. 음수면 "00:00:00".
export function formatCountdown(nextFundingTime: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor((nextFundingTime - nowMs) / 1000));
  const hh = String(Math.floor(diff / 3600)).padStart(2, '0');
  const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const ss = String(diff % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
