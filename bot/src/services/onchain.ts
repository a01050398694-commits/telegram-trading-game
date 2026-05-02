// Why: hash rate, mempool, block time give a "is the network healthy" signal.
// Source: AskBit src/lib/chat/collectors/onchain.ts (read-only reference, ported verbatim).
// 10-min cache.

export interface OnchainData {
  hashRate: string;
  difficulty: string;
  mempoolSize: number;
  avgBlockTime: number;
}

export interface BlockchairStats {
  chain: string;
  hashrate24h?: string;
  difficulty?: number;
  mempoolTransactions?: number;
  largestTransaction24h: { hash: string; valueUsd: number } | null;
  medianTransactionFee?: number;
  avgBlockSize?: number;
}

interface CacheEntry<T> {
  value: T | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 5000;

let onchainCache: CacheEntry<OnchainData> | null = null;
const blockchairCache = new Map<string, CacheEntry<BlockchairStats>>();

export async function fetchOnchainData(): Promise<OnchainData | null> {
  if (onchainCache && Date.now() < onchainCache.expiresAt) return onchainCache.value;
  try {
    const res = await fetch('https://api.blockchain.info/stats', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      onchainCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const data = (await res.json()) as {
      hash_rate?: number;
      difficulty?: number;
      n_tx_total_mem_pool?: number;
      minutes_between_blocks?: number;
    };
    if (
      typeof data.hash_rate !== 'number' ||
      typeof data.difficulty !== 'number' ||
      typeof data.n_tx_total_mem_pool !== 'number' ||
      typeof data.minutes_between_blocks !== 'number'
    ) {
      onchainCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }
    const result: OnchainData = {
      hashRate: (data.hash_rate / 1e9).toFixed(2) + ' EH/s',
      difficulty: (data.difficulty / 1e12).toFixed(2) + 'T',
      mempoolSize: data.n_tx_total_mem_pool,
      avgBlockTime: Math.round(data.minutes_between_blocks * 60),
    };
    onchainCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch {
    onchainCache = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}

export async function fetchBlockchairStats(
  chain: 'bitcoin' | 'ethereum'
): Promise<BlockchairStats | null> {
  const cached = blockchairCache.get(chain);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  try {
    const res = await fetch(`https://api.blockchair.com/${chain}/stats`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      blockchairCache.set(chain, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }
    const json = (await res.json()) as {
      data?: {
        hashrate_24h?: number | string;
        difficulty?: number;
        mempool_transactions?: number;
        median_transaction_fee_24h?: number;
        average_block_size_24h?: number;
        largest_transaction_24h?: { hash?: string; value_usd?: number };
      };
    };
    const d = json.data;
    if (!d) {
      blockchairCache.set(chain, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const largest =
      d.largest_transaction_24h &&
      typeof d.largest_transaction_24h.hash === 'string' &&
      typeof d.largest_transaction_24h.value_usd === 'number'
        ? {
            hash: d.largest_transaction_24h.hash,
            valueUsd: d.largest_transaction_24h.value_usd,
          }
        : null;

    const stats: BlockchairStats = { chain, largestTransaction24h: largest };
    if (d.hashrate_24h != null) stats.hashrate24h = String(d.hashrate_24h);
    if (typeof d.difficulty === 'number') stats.difficulty = d.difficulty;
    if (typeof d.mempool_transactions === 'number') stats.mempoolTransactions = d.mempool_transactions;
    if (typeof d.median_transaction_fee_24h === 'number') {
      stats.medianTransactionFee = d.median_transaction_fee_24h;
    }
    if (typeof d.average_block_size_24h === 'number') stats.avgBlockSize = d.average_block_size_24h;

    blockchairCache.set(chain, { value: stats, expiresAt: Date.now() + CACHE_TTL_MS });
    return stats;
  } catch {
    blockchairCache.set(chain, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}
