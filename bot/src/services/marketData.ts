// Bybit v5 REST collectors with 60s TTL cache. Free public APIs.
// Why: Render Oregon hits HTTP 451 on Binance (api.binance.com Spot AND fapi).
// Bybit (Singapore) serves US IPs and exposes funding / OI / long-short on the same v5 surface.

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
 * Daily klines for a symbol. Returns oldest-first arrays (Bybit returns newest-first; we reverse).
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
    // Bybit v5 spot kline. Interval mapping: 1d → 'D'.
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=D&limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[marketData] klines ${symbol} HTTP ${res.status}`);
      setCached<KlineSeries | null>(key, null);
      return null;
    }

    const json = (await res.json()) as {
      retCode?: number;
      retMsg?: string;
      result?: { list?: string[][] };
    };
    if (json.retCode !== 0) {
      console.warn(`[marketData] klines ${symbol} retCode=${json.retCode} msg=${json.retMsg}`);
      setCached<KlineSeries | null>(key, null);
      return null;
    }

    const list = json.result?.list;
    if (!Array.isArray(list) || list.length === 0) {
      setCached<KlineSeries | null>(key, null);
      return null;
    }

    // Bybit kline row: [start, open, high, low, close, volume, turnover] — newest-first.
    // Reverse for chronological (oldest-first) consumption.
    const rows = list.slice().reverse();

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
 * Latest funding rate, current open interest, and 5-min global long/short account ratio.
 * 3 Bybit linear endpoints fanned out via Promise.all. Each field is null on per-endpoint failure.
 * Caches under key `fundingoi:${symbol}` for 60s.
 *
 * longShortRatio is computed as buyRatio / sellRatio (matches Binance convention).
 */
export async function fetchFundingAndOI(symbol: FuturesSymbol): Promise<FundingAndOI | null> {
  const key = `fundingoi:${symbol}`;
  const cached = getCached<FundingAndOI | null>(key);
  if (cached !== undefined) return cached;

  try {
    const [tickersRes, oiRes, ratioRes] = await Promise.all([
      fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).catch((e) => {
        console.warn(`[marketData] tickers ${symbol} threw:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
      fetch(
        `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=5min&limit=1`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      ).catch((e) => {
        console.warn(`[marketData] openInterest ${symbol} threw:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
      fetch(
        `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=5min&limit=1`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      ).catch((e) => {
        console.warn(`[marketData] accountRatio ${symbol} threw:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
    ]);

    let fundingRate: number | null = null;
    if (tickersRes && tickersRes.ok) {
      try {
        const json = (await tickersRes.json()) as {
          retCode?: number;
          result?: { list?: Array<{ fundingRate?: string }> };
        };
        if (json.retCode === 0) {
          const raw = json.result?.list?.[0]?.fundingRate;
          if (raw !== undefined) {
            const parsed = parseFloat(raw);
            if (Number.isFinite(parsed)) fundingRate = parsed;
          }
        } else {
          console.warn(`[marketData] tickers ${symbol} retCode=${json.retCode}`);
        }
      } catch { /* leave null */ }
    }

    let openInterest: number | null = null;
    if (oiRes && oiRes.ok) {
      try {
        const json = (await oiRes.json()) as {
          retCode?: number;
          result?: { list?: Array<{ openInterest?: string }> };
        };
        if (json.retCode === 0) {
          const raw = json.result?.list?.[0]?.openInterest;
          if (raw !== undefined) {
            const parsed = parseFloat(raw);
            if (Number.isFinite(parsed)) openInterest = parsed;
          }
        } else {
          console.warn(`[marketData] openInterest ${symbol} retCode=${json.retCode}`);
        }
      } catch { /* leave null */ }
    }

    let longShortRatio: number | null = null;
    if (ratioRes && ratioRes.ok) {
      try {
        const json = (await ratioRes.json()) as {
          retCode?: number;
          result?: { list?: Array<{ buyRatio?: string; sellRatio?: string }> };
        };
        if (json.retCode === 0) {
          const buy = json.result?.list?.[0]?.buyRatio;
          const sell = json.result?.list?.[0]?.sellRatio;
          if (buy !== undefined && sell !== undefined) {
            const buyN = parseFloat(buy);
            const sellN = parseFloat(sell);
            if (Number.isFinite(buyN) && Number.isFinite(sellN) && sellN > 0) {
              longShortRatio = buyN / sellN;
            }
          }
        } else {
          console.warn(`[marketData] accountRatio ${symbol} retCode=${json.retCode}`);
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
