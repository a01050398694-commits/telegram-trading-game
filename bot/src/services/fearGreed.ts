// alternative.me Fear & Greed Index with 1h TTL cache. Free public API.
// Pattern sourced from AskBit fear-greed.ts (read-only reference). No imports from AskBit.

export interface FearGreedResult {
  value: number;
  label: string;
  timestamp: string;
}

export interface FearGreedHistoryItem {
  value: number;
  label: string;
  timestamp: string;
  zone: 'extreme_fear' | 'extreme_greed' | null;
}

interface CacheEntry {
  value: FearGreedResult | null;
  expiresAt: number;
}

interface HistoryCacheEntry {
  value: FearGreedHistoryItem[];
  expiresAt: number;
}

let cache: CacheEntry | null = null;
const historyCache = new Map<number, HistoryCacheEntry>();

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export function getZone(value: number): 'extreme_fear' | 'extreme_greed' | null {
  if (value <= 25) return 'extreme_fear';
  if (value >= 75) return 'extreme_greed';
  return null;
}

/**
 * Fetch latest Fear & Greed Index value (0-100) from alternative.me.
 * Returns null on network/parse failure (never throws).
 * Caches under module scope for 1 hour (FGI updates once per day).
 */
export async function fetchFearGreed(): Promise<FearGreedResult | null> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.value;
  }

  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[fearGreed] HTTP ${res.status}`);
      cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }

    const json = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string; timestamp: string }>;
    };
    const d = json.data?.[0];
    if (!d) {
      cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }

    const parsed = parseInt(d.value, 10);
    if (!Number.isFinite(parsed)) {
      cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }

    const result: FearGreedResult = {
      value: parsed,
      label: d.value_classification,
      timestamp: d.timestamp,
    };
    cache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch (e) {
    console.warn('[fearGreed] threw:', e instanceof Error ? e.message : String(e));
    cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}

/**
 * Alias for fetchFearGreed — semantic naming for callers that want "the index".
 */
export const fetchFearGreedIndex = fetchFearGreed;

/**
 * Fetch last N days of Fear & Greed values for trend context.
 * Caches per `limit` for 1 hour (alternative.me updates once per day).
 */
export async function fetchFearGreedHistory(limit = 30): Promise<FearGreedHistoryItem[]> {
  const hit = historyCache.get(limit);
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  try {
    const res = await fetch(`https://api.alternative.me/fng/?limit=${limit}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      historyCache.set(limit, { value: [], expiresAt: Date.now() + CACHE_TTL_MS });
      return [];
    }
    const json = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string; timestamp: string }>;
    };
    if (!json.data) {
      historyCache.set(limit, { value: [], expiresAt: Date.now() + CACHE_TTL_MS });
      return [];
    }
    const items: FearGreedHistoryItem[] = [];
    for (const entry of json.data) {
      const value = parseInt(entry.value, 10);
      if (!Number.isFinite(value)) continue;
      items.push({
        value,
        label: entry.value_classification,
        timestamp: entry.timestamp,
        zone: getZone(value),
      });
    }
    historyCache.set(limit, { value: items, expiresAt: Date.now() + CACHE_TTL_MS });
    return items;
  } catch (e) {
    console.warn('[fearGreed:history] threw:', e instanceof Error ? e.message : String(e));
    historyCache.set(limit, { value: [], expiresAt: Date.now() + CACHE_TTL_MS });
    return [];
  }
}
