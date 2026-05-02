// Why: Pearson correlation tells whether alts move with BTC or independently.
// High BTC↔alt correlation = no edge in alt-specific play. Low = decoupled.
// Source: AskBit src/lib/chat/collectors/correlation.ts (read-only reference).
// Modified: Upbit→Binance.US (US-licensed, no 451), 4 symbols only (BTC/ETH/SOL/XRP).
// 30-min cache (daily candles change once per day).

export interface CorrelationPair {
  symbolA: string;
  symbolB: string;
  correlation: number;
}

export interface CorrelationMatrix {
  pairs: CorrelationPair[];
  topCorrelated: CorrelationPair[];
  topAntiCorrelated: CorrelationPair[];
  btcDominanceCorrelations: CorrelationPair[];
  computedAt: string;
}

export const CORRELATION_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

interface CacheEntry {
  value: CorrelationMatrix | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 5000;
let cache: CacheEntry | null = null;

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i] ?? 0;
    sumY += y[i] ?? 0;
  }
  const mx = sumX / n;
  const my = sumY / n;

  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - mx;
    const dy = (y[i] ?? 0) - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }

  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return 0;
  return num / denom;
}

async function fetchCandles(symbol: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=1d&limit=30`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const candles = (await res.json()) as unknown[][];
    if (!Array.isArray(candles) || candles.length < 2) return null;
    // Binance returns chronological (oldest first) — no reverse needed.
    const closes: number[] = [];
    for (const row of candles) {
      const close = parseFloat(String(row[4] ?? ''));
      if (Number.isFinite(close)) closes.push(close);
    }
    return closes.length >= 2 ? closes : null;
  } catch {
    return null;
  }
}

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrix | null> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  try {
    const priceMap = new Map<string, number[]>();

    const results = await Promise.allSettled(
      CORRELATION_SYMBOLS.map((sym) => fetchCandles(sym).then((data) => ({ sym, data })))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.data) {
        priceMap.set(result.value.sym, result.value.data);
      }
    }

    const symbols = Array.from(priceMap.keys());
    if (symbols.length < 2) {
      cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }

    const pairs: CorrelationPair[] = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symA = symbols[i]!;
        const symB = symbols[j]!;
        const a = priceMap.get(symA)!;
        const b = priceMap.get(symB)!;
        const corr = pearson(a, b);
        pairs.push({ symbolA: symA, symbolB: symB, correlation: corr });
      }
    }

    pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    const topCorrelated = pairs
      .filter((p) => p.correlation > 0 && p.correlation < 1.0)
      .slice(0, 5);

    const topAntiCorrelated = pairs
      .filter((p) => p.correlation < 0)
      .sort((a, b) => a.correlation - b.correlation)
      .slice(0, 5);

    const btcDominanceCorrelations = pairs
      .filter((p) => p.symbolA === 'BTCUSDT')
      .sort((a, b) => b.correlation - a.correlation);

    const matrix: CorrelationMatrix = {
      pairs,
      topCorrelated,
      topAntiCorrelated,
      btcDominanceCorrelations,
      computedAt: new Date().toISOString(),
    };
    cache = { value: matrix, expiresAt: Date.now() + CACHE_TTL_MS };
    return matrix;
  } catch (e) {
    console.warn('[correlation] threw:', e instanceof Error ? e.message : String(e));
    cache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}
