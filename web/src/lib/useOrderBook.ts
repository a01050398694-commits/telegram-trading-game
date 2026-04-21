import { useEffect, useState } from 'react';

// Stage 7.5 — 바이낸스 호가창 실시간 훅.
// depth<levels>@100ms 스트림: 100ms 마다 상위 10 Bid / 10 Ask 스냅샷 전달.
// 공식: wss://stream.binance.com:9443/ws/<symbol>@depth<levels>@100ms
// 별도 depthUpdate 병합 로직이 필요없어 MVP 구현에 이상적.

export type DepthLevel = {
  price: number;
  qty: number;
  // 총 notional(깊이 바 길이 계산에 필요) — price * qty.
  total: number;
};

export type OrderBookFeed = {
  bids: DepthLevel[]; // 가격 내림차순 (가장 높은 bid 위쪽)
  asks: DepthLevel[]; // 가격 오름차순 (가장 낮은 ask 위쪽)
  status: 'loading' | 'live' | 'error';
  maxTotal: number; // 깊이 바 정규화에 사용 (bids+asks 중 최대 total)
};

type DepthSnapshot = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

const WS_BASE = 'wss://stream.binance.com:9443/ws';
const LEVELS = 10;

function normalize(raw: [string, string][], descending: boolean): DepthLevel[] {
  const parsed = raw
    .map(([p, q]) => {
      const price = parseFloat(p);
      const qty = parseFloat(q);
      return { price, qty, total: price * qty };
    })
    .filter((l) => l.qty > 0)
    .slice(0, LEVELS);
  // Binance 는 이미 정렬해서 주지만, 방어적으로 한 번 더.
  parsed.sort((a, b) => (descending ? b.price - a.price : a.price - b.price));
  return parsed;
}

export function useOrderBook(symbol: string): OrderBookFeed {
  const [bids, setBids] = useState<DepthLevel[]>([]);
  const [asks, setAsks] = useState<DepthLevel[]>([]);
  const [status, setStatus] = useState<OrderBookFeed['status']>('loading');

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoff = 1000;

    // 심볼 전환 시 이전 코인 호가가 화면에 남는 것을 막기 위해 즉시 리셋.
    // 첫 tick 이 도착하기 전에 ETH 탭을 눌러도 BTC 가격이 보이는 사고 차단.
    setBids([]);
    setAsks([]);
    setStatus('loading');

    const connect = () => {
      if (cancelled) return;
      const url = `${WS_BASE}/${symbol.toLowerCase()}@depth${LEVELS}@100ms`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        backoff = 1000;
        setStatus('live');
      };

      ws.onmessage = (evt) => {
        try {
          const snap = JSON.parse(evt.data) as DepthSnapshot;
          setBids(normalize(snap.bids, true));
          setAsks(normalize(snap.asks, false));
        } catch (err) {
          console.error('[depth] parse error', err);
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

  // 깊이 바 정규화 — bids+asks 중 최대 total 을 기준으로 바 너비 계산.
  const maxTotal = Math.max(
    ...bids.map((b) => b.total),
    ...asks.map((a) => a.total),
    1,
  );

  return { bids, asks, status, maxTotal };
}
