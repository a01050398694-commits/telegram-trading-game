import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

// 바이낸스 현물 @ticker 스트림은 매초 rolling 24h ticker를 보낸다.
// 필드 참고: https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-ticker-streams
interface BinanceTickerMessage {
  e: string;   // event type
  E: number;   // event time
  s: string;   // symbol (대문자, 예: "BTCUSDT")
  c: string;   // current close price
  p: string;   // price change
  P: string;   // price change percent
}

export interface PriceUpdate {
  symbol: string;   // 소문자 정규화. ex) "btcusdt"
  price: number;    // 현재가
  timestamp: number;
}

// 재연결 백오프 — 네트워크 끊김/바이낸스 서버 재시작 대응.
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;

// EventEmitter 기반 브로드캐스트. 이벤트명: 'price'
// 수신자: trading engine(청산 감시), 향후 web 클라이언트(via socket.io 등).
export class BinancePriceFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectMs = BASE_RECONNECT_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closedIntentionally = false;

  constructor(private readonly symbols: string[]) {
    super();
    if (symbols.length === 0) {
      throw new Error('BinancePriceFeed requires at least one symbol');
    }
  }

  start(): void {
    this.closedIntentionally = false;
    this.connect();
  }

  stop(): void {
    this.closedIntentionally = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    // combined stream: /stream?streams=btcusdt@ticker/ethusdt@ticker
    const streams = this.symbols.map((s) => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://data-stream.binance.vision/stream?streams=${streams}`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      console.log(`[binance] connected (${this.symbols.length} symbols)`);
      this.reconnectMs = BASE_RECONNECT_MS;
    });

    ws.on('message', (data) => {
      try {
        const raw = JSON.parse(data.toString());
        const payload = raw.data ?? raw; // combined stream은 { stream, data } 래핑
        const msg = payload as BinanceTickerMessage;
        if (!msg.s || !msg.c) return;

        const update: PriceUpdate = {
          symbol: msg.s.toLowerCase(),
          price: Number(msg.c),
          timestamp: msg.E ?? Date.now(),
        };
        this.emit('price', update);
      } catch (err) {
        // 파싱 실패는 비정상 메시지 하나일 뿐 — 연결은 유지.
        console.error('[binance] parse error:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('[binance] ws error:', err.message);
    });

    ws.on('close', (code) => {
      this.ws = null;
      if (this.closedIntentionally) return;

      // exponential backoff, 30초 상한
      const delay = this.reconnectMs;
      this.reconnectMs = Math.min(this.reconnectMs * 2, MAX_RECONNECT_MS);
      console.warn(`[binance] closed (code=${code}), reconnect in ${delay}ms`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }
}

// -------------------------------------------------------------
// CLI 모드: Step 2 Verification 용도
//   실행: `npx tsx src/services/binance.ts btcusdt ethusdt`
//   env 파일 불필요. 시세가 콘솔에 찍히면 연결 정상.
// -------------------------------------------------------------
const isMain = (() => {
  try {
    // ESM에서 이 파일이 직접 실행됐는지 판단
    const entry = process.argv[1]?.replace(/\\/g, '/');
    return Boolean(entry && import.meta.url.endsWith(entry.split('/').pop() ?? ''));
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const symbols = argv.length > 0 ? argv : ['btcusdt'];
  const feed = new BinancePriceFeed(symbols);
  feed.on('price', (u: PriceUpdate) => {
    console.log(`[price] ${u.symbol.toUpperCase()} $${u.price.toFixed(2)}`);
  });
  feed.start();

  process.on('SIGINT', () => {
    feed.stop();
    process.exit(0);
  });
}
