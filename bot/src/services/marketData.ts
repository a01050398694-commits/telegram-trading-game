// Binance Futures REST collectors with 60s TTL cache. Free public APIs.
// Pattern sourced from AskBit binance-futures.ts (read-only reference). No imports from AskBit.

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

// Module-scope TTL cache. Key = `${func}:${symbol}:${extra}`. Value = result (null is also cached to dampen error spikes).
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
 * Daily klines for a futures symbol. Returns oldest-first arrays.
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
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
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
  } catch {
    // Cache the failure briefly to avoid hammering the API on outage.
    setCached<KlineSeries | null>(key, null);
    return null;
  }
}

/**
 * Funding rate (last), open interest (current), global long/short account ratio (last 5m).
 * 3 endpoints fanned out via Promise.all. Each field is null on per-endpoint failure.
 * Caches under key `fundingoi:${symbol}` for 60s.
 */
export async function fetchFundingAndOI(symbol: FuturesSymbol): Promise<FundingAndOI | null> {
  const key = `fundingoi:${symbol}`;
  const cached = getCached<FundingAndOI | null>(key);
  if (cached !== undefined) return cached;

  try {
    const [fundingRes, oiRes, ratioRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).catch(() => null),
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).catch(() => null),
      fetch(
        `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      ).catch(() => null),
    ]);

    let fundingRate: number | null = null;
    if (fundingRes && fundingRes.ok) {
      try {
        const arr = (await fundingRes.json()) as Array<{ fundingRate?: string }>;
        const raw = arr[0]?.fundingRate;
        if (raw !== undefined) {
          const parsed = parseFloat(raw);
          if (Number.isFinite(parsed)) fundingRate = parsed;
        }
      } catch { /* leave null */ }
    }

    let openInterest: number | null = null;
    if (oiRes && oiRes.ok) {
      try {
        const obj = (await oiRes.json()) as { openInterest?: string };
        if (obj.openInterest !== undefined) {
          const parsed = parseFloat(obj.openInterest);
          if (Number.isFinite(parsed)) openInterest = parsed;
        }
      } catch { /* leave null */ }
    }

    let longShortRatio: number | null = null;
    if (ratioRes && ratioRes.ok) {
      try {
        const arr = (await ratioRes.json()) as Array<{ longShortRatio?: string }>;
        const raw = arr[0]?.longShortRatio;
        if (raw !== undefined) {
          const parsed = parseFloat(raw);
          if (Number.isFinite(parsed)) longShortRatio = parsed;
        }
      } catch { /* leave null */ }
    }

    const result: FundingAndOI = { fundingRate, openInterest, longShortRatio };
    setCached(key, result);
    return result;
  } catch {
    setCached<FundingAndOI | null>(key, null);
    return null;
  }
}
