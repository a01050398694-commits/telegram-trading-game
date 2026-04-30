import { useEffect, useState } from 'react';

// 바이낸스 선물/현물 시세 훅.
// - REST: 초기 히스토리 200개 캔들 (1분봉)
// - WS:   실시간 kline tick — 동일한 t(open time) 캔들을 매번 갱신, 다음 분이 되면 새 캔들 append
// 소비 컴포넌트는 history.setData + ticking.update 를 조합해 라이트차트에 흘려넣는다.

export type Candle = {
  time: number; // UTC seconds — lightweight-charts UTCTimestamp 호환
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Direction = 'up' | 'down' | 'idle';

export type Stats24h = {
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
};

export type BinanceFeed = {
  symbol: string;
  history: Candle[];           // 초기 로드 후 불변 (chart.setData 용)
  ticking: Candle | null;      // 매 틱 바뀌는 최신 캔들 (chart.update 용)
  price: number | null;        // ticking.close 와 동일 — 편의용
  direction: Direction;        // 이전 틱 대비 상승/하락
  status: 'loading' | 'live' | 'error';
  stats24h: Stats24h | null;
};

// Stage 8.14 — Binance '선물(Futures)' API 로 전면 교체.
// 현물 (api.binance.com/api/v3) 에는 PEPE, SHIB 등 '1000PEPE' 프리픽스 심볼이 없어 404 를 내뱉는다.
// USDT-M Perpetual 엔드포인트 (fapi.binance.com) + WS (fstream.binance.com) 로 이동해
// 전 종목 차트가 뜨도록 통일한다.
const REST_BASE = 'https://fapi.binance.com/fapi/v1/klines';
const WS_BASE = 'wss://fstream.binance.com/ws';

// Binance /api/v3/klines 응답은 고정 길이 12-tuple.
// noUncheckedIndexedAccess 설정 때문에 ...rest 스프레드를 쓰면 모든 인덱스가 undefined 가 섞임.
type BinanceRestRow = [
  number, // 0 openTime (ms)
  string, // 1 open
  string, // 2 high
  string, // 3 low
  string, // 4 close
  string, // 5 volume
  number, // 6 closeTime
  string, // 7 quoteVolume
  number, // 8 trades
  string, // 9 takerBuyBase
  string, // 10 takerBuyQuote
  string, // 11 ignore
];

type BinanceKlinePayload = {
  e: 'kline';
  k: {
    t: number; // open time (ms)
    o: string;
    h: string;
    l: string;
    c: string;
    x: boolean; // kline closed
  };
};

function parseRestRow(row: BinanceRestRow): Candle {
  return {
    time: Math.floor(row[0] / 1000),
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
  };
}

export function useBinanceFeed(symbol: string = 'btcusdt', interval: string = '1m'): BinanceFeed {
  const [history, setHistory] = useState<Candle[]>([]);
  const [ticking, setTicking] = useState<Candle | null>(null);
  // Stage 15.10 — price/direction 을 별도 aggTrade WS 기반으로 분리.
  //   · kline_1m: 1초당 1번 push → 차트 그릴 때만 사용
  //   · aggTrade: 매 체결마다 push (초당 5-50회) → 호가창처럼 빠른 가격 깜빡 표시
  // RAF throttle 로 60fps 까지만 setState — React 성능 + 텔레그램 WebView CPU 보호.
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>('idle');
  const [status, setStatus] = useState<BinanceFeed['status']>('loading');
  const [stats24h, setStats24h] = useState<Stats24h | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol.toUpperCase()}`,
        );
        if (!res.ok) return;
        const d = (await res.json()) as {
          priceChange: string;
          priceChangePercent: string;
          highPrice: string;
          lowPrice: string;
          volume: string;
        };
        if (cancelled) return;
        setStats24h({
          priceChange: parseFloat(d.priceChange),
          priceChangePercent: parseFloat(d.priceChangePercent),
          high: parseFloat(d.highPrice),
          low: parseFloat(d.lowPrice),
          volume: parseFloat(d.volume),
        });
      } catch (err) {
        console.error('[binance] 24h stats failed', err);
      }
    };
    fetchStats();
    const id = window.setInterval(fetchStats, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoff = 1000;
    // Stage 15.6 — silent stale 감지용. 브라우저 WS API 는 ping/pong 자동 처리 안 하고
    // 모바일 WebView / 캐리어 NAT 가 침묵 종료해도 onclose 가 안 불리는 사고가 빈번.
    // ws.onmessage / ws.onopen 에서 갱신, 5초 interval 로 stale > 15s 감지 → 강제 reconnect.
    let lastMessageAt = Date.now();

    const loadHistory = async () => {
      try {
        const url = `${REST_BASE}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=200`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
        const rows = (await res.json()) as BinanceRestRow[];
        if (cancelled) return;
        const parsed = rows.map(parseRestRow);
        setHistory(parsed);
        const last = parsed[parsed.length - 1];
        if (last) {
          setTicking(last);
        }
      } catch (err) {
        console.error('[binance] history load failed', err);
        if (!cancelled) setStatus('error');
      }
    };

    const connectWs = () => {
      if (cancelled) return;
      const url = `${WS_BASE}/${symbol.toLowerCase()}@kline_${interval}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        backoff = 1000;
        setStatus('live');
        lastMessageAt = Date.now();
      };

      // Stage 15.10 — kline 은 차트만 갱신. price/direction 은 별도 aggTrade WS 가 담당.
      ws.onmessage = (evt) => {
        lastMessageAt = Date.now();
        try {
          const payload = JSON.parse(evt.data) as BinanceKlinePayload;
          if (payload.e !== 'kline') return;
          const k = payload.k;
          const candle: Candle = {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
          };
          setTicking(candle);
        } catch (err) {
          console.error('[binance] parse error', err);
        }
      };

      ws.onerror = () => {
        // onerror 다음 onclose 가 항상 뒤따라 온다 — 재연결은 onclose 에서 처리.
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus('error');
        reconnectTimer = window.setTimeout(() => {
          backoff = Math.min(backoff * 2, 30_000);
          connectWs();
        }, backoff);
      };
    };

    // Stage 15.5 — Telegram WebView 가 background 갔다 복귀할 때 ws 끊긴 채 timer 가
    // throttle/suspend 돼 가격이 정지하는 사고 방지. visibility visible 시 즉시 재연결.
    // Stage 15.7 — '좀비 WS' 회피. Telegram WebView 는 background 에서 socket 을 silently kill
    // 하는데 readyState 는 1(OPEN) 그대로 남는 사고가 빈번. readyState 만 보고 skip 하면
    // 영원히 정지. lastMessageAt 가 5s 이상 stale 이면 좀비로 판단해 강제 재연결.
    const onVisibility = (): void => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      const isAlive =
        ws !== null &&
        ws.readyState === WebSocket.OPEN &&
        Date.now() - lastMessageAt < 5_000;
      if (isAlive) return;

      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      lastMessageAt = Date.now();
      backoff = 1000;
      connectWs();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Stage 15.6 — silent stale 감지 + 강제 reconnect.
    // kline 1m 은 매 100ms tick 으로 close 갱신 → 15초 무응답이면 무조건 끊긴 것.
    const staleCheckId = window.setInterval(() => {
      if (cancelled) return;
      if (Date.now() - lastMessageAt < 15_000) return;
      console.warn('[binance] kline feed stale > 15s, forcing reconnect');
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      lastMessageAt = Date.now();
      backoff = 1000;
      connectWs();
    }, 5000);

    loadHistory().then(() => {
      if (!cancelled) connectWs();
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(staleCheckId);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol, interval]);

  // Stage 15.10 — trade WS: 매 체결마다 last trade price push. 바이낸스 앱의 호가창
  // 같은 빠른 가격 깜빡 효과 구현. RAF throttle 로 setState 빈도를 60fps 로 cap.
  // Stage 15.11 — @aggTrade 는 fstream 에서 handshake 만 통과하고 데이터 0 — '@trade' 만
  // 정상 동작 (실측 BTC 12msg/s). 단순 trade stream 으로 전환.
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let backoff = 1000;
    let lastMessageAt = Date.now();
    let prev: number | null = null;
    let pending: number | null = null;
    let rafId: number | null = null;

    const flush = (): void => {
      rafId = null;
      if (pending === null) return;
      const p = pending;
      pending = null;
      setLivePrice(p);
      if (prev !== null) {
        if (p > prev) setDirection('up');
        else if (p < prev) setDirection('down');
      }
      prev = p;
    };

    // Stage 15.12 — '진짜 호가창처럼' 빠른 변동을 위해 @bookTicker 로 전환.
    //   · @trade: 1~12 msg/s (체결 빈도)
    //   · @bookTicker: 100~150 msg/s (best bid/ask 변동마다)
    // RAF 가 60fps 로 cap 하므로 React/CPU 부담 없이 화면이 진짜 휙휙 변함.
    // mark price = (bestBid + bestAsk) / 2 — 바이낸스 앱 표시 방식과 동일.
    const connect = (): void => {
      if (cancelled) return;
      ws = new WebSocket(`${WS_BASE}/${symbol.toLowerCase()}@bookTicker`);

      ws.onopen = () => {
        backoff = 1000;
        lastMessageAt = Date.now();
      };

      ws.onmessage = (evt) => {
        lastMessageAt = Date.now();
        try {
          const data = JSON.parse(evt.data) as { e?: string; b: string; a: string };
          // fstream futures bookTicker 는 e:'bookTicker' 보장 — 다른 stream 혼입 시 무시.
          if (data.e !== undefined && data.e !== 'bookTicker') return;
          const bid = parseFloat(data.b);
          const ask = parseFloat(data.a);
          if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;
          pending = (bid + ask) / 2;
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } catch {
          // 다음 메시지에서 자연 복구
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        reconnectTimer = window.setTimeout(() => {
          backoff = Math.min(backoff * 2, 30_000);
          connect();
        }, backoff);
      };
    };

    const onVisibility = (): void => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      const isAlive =
        ws !== null && ws.readyState === WebSocket.OPEN && Date.now() - lastMessageAt < 5_000;
      if (isAlive) return;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      lastMessageAt = Date.now();
      backoff = 1000;
      connect();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const staleCheckId = window.setInterval(() => {
      if (cancelled) return;
      if (Date.now() - lastMessageAt < 15_000) return;
      console.warn('[binance] trade feed stale > 15s, forcing reconnect');
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      lastMessageAt = Date.now();
      backoff = 1000;
      connect();
    }, 5000);

    connect();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(staleCheckId);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol]);

  return {
    symbol,
    history,
    ticking,
    // Stage 15.10 — aggTrade 가 아직 첫 trade 받기 전엔 livePrice null → ticking.close 폴백.
    price: livePrice ?? ticking?.close ?? null,
    direction,
    status,
    stats24h,
  };
}
