// Stage 19 — paginated historical kline fetch for backtesting.
// Why: Binance.US /klines max limit per request is 1000. 30-day 5m candles = 8640 → 9 batches.
//   marketData.fetchKlines is single-batch and caches; backtest needs raw paginated history.

import type { KlineInterval } from '../../src/services/marketData.js';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface HistoricalDataset {
  m5: Candle[];
  m15: Candle[];
  h1: Candle[];
  h4: Candle[];
  d1: Candle[];
}

const INTERVAL_MS: Record<KlineInterval, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

const BINANCE_US_BASE = 'https://api.binance.us/api/v3/klines';
const BATCH_SLEEP_MS = 250;

async function fetchPaginated(
  symbol: string,
  interval: KlineInterval,
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  const intervalMs = INTERVAL_MS[interval];
  const all: Candle[] = [];
  let cursor = startTime;
  let safety = 0;
  while (cursor < endTime && safety < 200) {
    safety++;
    const url = `${BINANCE_US_BASE}?symbol=${symbol}&interval=${interval}&startTime=${cursor}&limit=1000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      throw new Error(`historical fetch failed for ${symbol} ${interval}: HTTP ${res.status}`);
    }
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const r of rows) {
      const a = r as unknown[];
      const open = parseFloat(a[1] as string);
      const high = parseFloat(a[2] as string);
      const low = parseFloat(a[3] as string);
      const close = parseFloat(a[4] as string);
      const volume = parseFloat(a[5] as string);
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        continue;
      }
      all.push({
        openTime: Number(a[0]),
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
        closeTime: Number(a[6]),
      });
    }

    const lastOpenTime = Number((rows[rows.length - 1] as unknown[])[0]);
    const nextCursor = lastOpenTime + intervalMs;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;

    await new Promise((resolve) => setTimeout(resolve, BATCH_SLEEP_MS));
  }
  return all;
}

export async function fetchHistorical(symbol: string, days: number): Promise<HistoricalDataset> {
  const now = Date.now();
  const start = now - days * 86_400_000;
  // Sequential to keep request burst gentle on Binance.US (1200/min limit, far below).
  const m5 = await fetchPaginated(symbol, '5m', start, now);
  const m15 = await fetchPaginated(symbol, '15m', start, now);
  const h1 = await fetchPaginated(symbol, '1h', start, now);
  const h4 = await fetchPaginated(symbol, '4h', start, now);
  const d1 = await fetchPaginated(symbol, '1d', start, now);
  return { m5, m15, h1, h4, d1 };
}
