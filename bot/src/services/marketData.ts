// Binance.US Spot REST collector with 60s TTL cache. Free public API.
// Why: Binance.com (Spot AND fapi) returns HTTP 451 from US IPs (Render Oregon).
// Bybit blocks US too (HTTP 403). Binance.US is the US-licensed subsidiary, accepts US traffic,
// and exposes the same /api/v3/klines response shape as Binance.com.
//
// Limitation: Binance.US has no derivatives. fetchFundingAndOI returns all-null;
// signalEngine already handles null fields by zeroing those weights.

export type FuturesSymbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT' | 'XRPUSDT';

export interface KlineSeries {
  closes: number[];
  highs: number[];
  lows: number[];
}

export interface FundingAndOI {
  fundingRate: number | null;
  openInterest: number | null;
  longShortRatio: number | null;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// Module-scope TTL cache. Key = `${func}:${symbol}:${extra}`. null is also cached to dampen error spikes.
const cache = new Map<string, CacheEntry<unknown>>();

const CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

// One-time module-load warn so the operator sees this in boot logs once, not per-tick.
console.warn('[marketData] funding/OI/LSR not available on Binance.US — signal will skip those weights');

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
 * Daily klines for a symbol. Returns oldest-first arrays (Binance.US returns oldest-first natively).
 * Caches under key `klines:${symbol}:${limit}` for 60s.
 * Returns null on network/parse failure (never throws).
 */
export async function fetchKlines(
  symbol: FuturesSymbol,
  limit: number = 200
): Promise<KlineSeries | null> {
  const key = `klines:${symbol}:${limit}`;
  const cached = getCached<KlineSeries | null>(key);
  if (cached !== undefined) return cached;

  try {
    const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[marketData] klines ${symbol} HTTP ${res.status}`);
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
    for (const row of rows) {
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        setCached<KlineSeries | null>(key, null);
        return null;
      }
      highs.push(high);
      lows.push(low);
      closes.push(close);
    }

    const series: KlineSeries = { closes, highs, lows };
    setCached(key, series);
    return series;
  } catch (e) {
    console.warn(`[marketData] klines ${symbol} threw:`, e instanceof Error ? e.message : String(e));
    setCached<KlineSeries | null>(key, null);
    return null;
  }
}

/**
 * Funding / open interest / long-short ratio.
 * Binance.US is spot-only — no derivatives endpoints. Always returns all-null.
 * Function signature preserved so signalEngine continues to compile and zero those weights.
 */
export async function fetchFundingAndOI(_symbol: FuturesSymbol): Promise<FundingAndOI | null> {
  return { fundingRate: null, openInterest: null, longShortRatio: null };
}
