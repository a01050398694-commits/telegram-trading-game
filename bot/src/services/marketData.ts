// Binance.US Spot REST collector with 60s TTL cache. Free public API.
// Why: Binance.com (Spot AND fapi) returns HTTP 451 from US IPs (Render Oregon).
// Bybit blocks US too (HTTP 403). Binance.US is the US-licensed subsidiary, accepts US traffic,
// and exposes the same /api/v3/klines response shape as Binance.com.
// Stage 17 v4: derivatives layers (funding/OI/LSR) permanently dropped — Binance.US has no
// derivatives endpoints, and the new multi-TF + structure scoring covers the gap on its own.

export type FuturesSymbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT' | 'XRPUSDT';

export interface KlineSeries {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
}

export interface MultiTimeframeKlines {
  m15: KlineSeries;
  h1: KlineSeries;
  h4: KlineSeries;
  d1: KlineSeries;
}

export type KlineInterval = '15m' | '1h' | '4h' | '1d';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Module-scope TTL cache. Key = `${func}:${symbol}:${extra}`. null is also cached to dampen error spikes.
const cache = new Map<string, CacheEntry<unknown>>();

const CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number = CACHE_TTL_MS): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Klines for a symbol on a given interval. Returns oldest-first arrays (Binance.US returns oldest-first natively).
 * Caches under key `klines:${symbol}:${interval}:${limit}` for 60s.
 * Returns null on network/parse failure (never throws).
 */
export async function fetchKlines(
  symbol: FuturesSymbol,
  limit: number = 200,
  interval: KlineInterval = '1d'
): Promise<KlineSeries | null> {
  const key = `klines:${symbol}:${interval}:${limit}`;
  const cached = getCached<KlineSeries | null>(key);
  if (cached !== undefined) return cached;

  try {
    const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[marketData] klines ${symbol} ${interval} HTTP ${res.status}`);
      setCached<KlineSeries | null>(key, null);
      return null;
    }

    // Binance kline row: [openTime, open, high, low, close, volume, closeTime, ...]
    const raw = (await res.json()) as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) {
      setCached<KlineSeries | null>(key, null);
      return null;
    }

    // Defensive: explicit ascending sort by openTime even though Binance returns oldest-first.
    const rows = (raw as unknown[][]).slice().sort((a, b) => Number(a[0]) - Number(b[0]));

    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    for (const row of rows) {
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5]);
      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        setCached<KlineSeries | null>(key, null);
        return null;
      }
      highs.push(high);
      lows.push(low);
      closes.push(close);
      volumes.push(Number.isFinite(volume) ? volume : 0);
    }

    const series: KlineSeries = { closes, highs, lows, volumes };
    setCached(key, series);
    return series;
  } catch (e) {
    console.warn(`[marketData] klines ${symbol} ${interval} threw:`, e instanceof Error ? e.message : String(e));
    setCached<KlineSeries | null>(key, null);
    return null;
  }
}

/**
 * Fetch 4 timeframes (15m / 1h / 4h / 1d) in parallel for multi-TF analysis.
 * Returns null if ANY single TF fetch fails — caller treats as data-incomplete.
 */
export async function fetchMultiTimeframeKlines(
  symbol: FuturesSymbol
): Promise<MultiTimeframeKlines | null> {
  const [m15, h1, h4, d1] = await Promise.all([
    fetchKlines(symbol, 200, '15m'),
    fetchKlines(symbol, 200, '1h'),
    fetchKlines(symbol, 200, '4h'),
    fetchKlines(symbol, 200, '1d'),
  ]);
  if (!m15 || !h1 || !h4 || !d1) return null;
  return { m15, h1, h4, d1 };
}
