// Why: BTC.D (dominance), total mcap, mcap delta — key macro narrative drivers.
// Source: AskBit src/lib/chat/collectors/coingecko.ts (read-only reference). vs_currency krw → usd; trending optional.
// 10-min cache because global stats don't move tick-to-tick.

export interface TrendingCoin {
  name: string;
  symbol: string;
  rank: number;
  priceChange24h?: number | undefined;
}

export interface GlobalData {
  btcDominance: number;
  totalMcap: number;
  mcapDelta: number;
}

interface CacheEntry<T> {
  value: T | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 8000;

let trendingCache: CacheEntry<TrendingCoin[]> | null = null;
let globalCache: CacheEntry<GlobalData> | null = null;

export async function fetchTrendingCoins(): Promise<TrendingCoin[]> {
  if (trendingCache && Date.now() < trendingCache.expiresAt) {
    return trendingCache.value ?? [];
  }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      trendingCache = { value: [], expiresAt: Date.now() + CACHE_TTL_MS };
      return [];
    }
    const json = (await res.json()) as {
      coins?: Array<{
        item: {
          name: string;
          symbol: string;
          score: number;
          data?: { price_change_percentage_24h?: { usd?: number } };
        };
      }>;
    };
    const coins = (json.coins ?? []).slice(0, 7);
    const mapped: TrendingCoin[] = coins.map((c, i) => ({
      name: c.item.name,
      symbol: c.item.symbol?.toUpperCase() ?? '',
      rank: i + 1,
      priceChange24h: c.item.data?.price_change_percentage_24h?.usd,
    }));
    trendingCache = { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
    return mapped;
  } catch {
    trendingCache = { value: [], expiresAt: Date.now() + CACHE_TTL_MS };
    return [];
  }
}

export async function fetchGlobalData(): Promise<GlobalData | null> {
  if (globalCache && Date.now() < globalCache.expiresAt) {
    return globalCache.value;
  }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      globalCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const json = (await res.json()) as {
      data?: {
        market_cap_percentage?: { btc?: number };
        total_market_cap?: { usd?: number };
        market_cap_change_percentage_24h_usd?: number;
      };
    };
    const data = json.data;
    if (!data) {
      globalCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const btcDominance = data.market_cap_percentage?.btc;
    const totalMcap = data.total_market_cap?.usd;
    const mcapDelta = data.market_cap_change_percentage_24h_usd;
    if (
      typeof btcDominance !== 'number' ||
      typeof totalMcap !== 'number' ||
      typeof mcapDelta !== 'number'
    ) {
      globalCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const result: GlobalData = { btcDominance, totalMcap, mcapDelta };
    globalCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch {
    globalCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}
