import { useEffect, useState } from 'react';

// Stage 7.5 — 최근 체결 스트림 훅.
// 공식: wss://stream.binance.com:9443/ws/<symbol>@trade
// payload: { e:"trade", p:"price", q:"qty", T:timestamp, m:boolean(buyer is maker → 매도체결) }
// m=true 이면 매수자가 maker — 즉 taker 는 매도자 → price 하락 유발 → 빨강.
// m=false 이면 taker 가 매수자 → 초록.

export type TradeTick = {
  id: number; // e(event time) + T 기반 수신 순 인덱스
  price: number;
  qty: number;
  time: number; // ms
  aggressor: 'buy' | 'sell';
};

type TradePayload = {
  e: 'trade';
  T: number;
  t: number; // trade id
  p: string;
  q: string;
  m: boolean;
};

const WS_BASE = 'wss://stream.binance.com:9443/ws';
const KEEP = 30;

export function useRecentTrades(symbol: string): {
  trades: TradeTick[];
  status: 'loading' | 'live' | 'error';
} {
  const [trades, setTrades] = useState<TradeTick[]>([]);
  const [status, setStatus] = useState<'loading' | 'live' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoff = 1000;

    // 심볼 변경 시 기존 리스트 초기화 — 전 코인 체결이 새 코인 리스트에 잔류하지 않도록.
    setTrades([]);
    setStatus('loading');

    const connect = () => {
      if (cancelled) return;
      const url = `${WS_BASE}/${symbol.toLowerCase()}@trade`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        backoff = 1000;
        setStatus('live');
      };

      ws.onmessage = (evt) => {
        try {
          const p = JSON.parse(evt.data) as TradePayload;
          if (p.e !== 'trade') return;
          const tick: TradeTick = {
            id: p.t,
            price: parseFloat(p.p),
            qty: parseFloat(p.q),
            time: p.T,
            aggressor: p.m ? 'sell' : 'buy',
          };
          setTrades((prev) => {
            const next = [tick, ...prev];
            return next.length > KEEP ? next.slice(0, KEEP) : next;
          });
        } catch (err) {
          console.error('[trades] parse error', err);
        }
      };

      ws.onerror = () => {
        /* onclose 에서 재연결 */
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus('error');
        reconnectTimer = window.setTimeout(() => {
          backoff = Math.min(backoff * 2, 30_000);
          connect();
        }, backoff);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol]);

  return { trades, status };
}
