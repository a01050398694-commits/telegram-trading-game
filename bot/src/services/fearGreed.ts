// alternative.me Fear & Greed Index with 1h TTL cache. Free public API.
// Pattern sourced from AskBit fear-greed.ts (read-only reference). No imports from AskBit.

export interface FearGreedResult {
  value: number;
  label: string;
  timestamp: string;
}

interface CacheEntry {
  value: FearGreedResult | null;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

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
  } catch {
    cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}
