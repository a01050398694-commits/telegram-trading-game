// Why: cross-source price verification (Binance.US ↔ CoinGecko) catches stale or manipulated quotes.
// Source: AskBit src/lib/chat/collectors/verified-price.ts (read-only reference). Upbit removed (KR-only); USD-native.
// 5-min cache.

import { safeCollect } from '../lib/safeCollect.js';

export interface VerifiedPrice {
  symbol: string;
  priceUSD: number;
  sources: { name: string; priceUSD: number }[];
  deviationPercent: number;
  isReliable: boolean;
  sourceCount: number;
}

const DEVIATION_THRESHOLD = 2;
const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 5000;

interface CacheEntry {
  value: VerifiedPrice | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const COINGECKO_ID_MAP: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  XRPUSDT: 'ripple',
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function maxDeviation(prices: number[], med: number): number {
  if (med === 0) return 0;
  let max = 0;
  for (const p of prices) {
    const dev = (Math.abs(p - med) / med) * 100;
    if (dev > max) max = dev;
  }
  return max;
}

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: string };
    if (typeof data.price !== 'string') return null;
    const parsed = parseFloat(data.price);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoPrice(symbol: string): Promise<number | null> {
  const coingeckoId = COINGECKO_ID_MAP[symbol];
  if (!coingeckoId) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const price = data[coingeckoId]?.usd;
    return typeof price === 'number' && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

export async function getVerifiedPrice(symbol: string): Promise<VerifiedPrice | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  const [binanceResult, coingeckoResult] = await Promise.all([
    safeCollect('binance', () => fetchBinancePrice(symbol), FETCH_TIMEOUT_MS),
    safeCollect('coingecko', () => fetchCoinGeckoPrice(symbol), FETCH_TIMEOUT_MS),
  ]);

  const sources: { name: string; priceUSD: number }[] = [];
  if (binanceResult.data != null) sources.push({ name: 'Binance.US', priceUSD: binanceResult.data });
  if (coingeckoResult.data != null) sources.push({ name: 'CoinGecko', priceUSD: coingeckoResult.data });

  if (sources.length === 0) {
    cache.set(symbol, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  const prices = sources.map((s) => s.priceUSD);
  const med = median(prices);
  const dev = maxDeviation(prices, med);
  const isReliable = dev < DEVIATION_THRESHOLD && sources.length >= 2;

  const result: VerifiedPrice = {
    symbol,
    priceUSD: med,
    sources,
    deviationPercent: Math.round(dev * 100) / 100,
    isReliable,
    sourceCount: sources.length,
  };
  cache.set(symbol, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
