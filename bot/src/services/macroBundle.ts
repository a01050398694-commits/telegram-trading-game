// Why: single orchestrator that runs all macro collectors in parallel with per-source timeout.
// One failed source must not block the others — safeCollect wraps each.
// Pattern reference: AskBit src/lib/chat/context-builder.ts macro inject section.
// 30-min cache for the whole bundle (some collectors have shorter internal caches).

import { safeCollect } from '../lib/safeCollect.js';
import { getMacroSnapshot, type MacroSnapshot } from './macro.js';
import { fetchFearGreedIndex, fetchFearGreedHistory, type FearGreedResult } from './fearGreed.js';
import { fetchLatestNews, type NewsItem } from './news.js';
import { fetchEtfFlow, type EtfFlowData } from './etfFlow.js';
import { fetchGlobalData, type GlobalData } from './coingecko.js';
import { fetchCorrelationMatrix, type CorrelationMatrix } from './correlation.js';
import { fetchOnchainData, type OnchainData } from './onchain.js';

export interface NewsBrief {
  title: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  source: string;
  ago: string;
}

export interface CorrelationBrief {
  btcEth: number | null;
  btcSol: number | null;
  btcXrp: number | null;
}

export interface FullMacroSnapshot {
  macro: MacroSnapshot | null;
  fearGreed: FearGreedResult | null;
  fearGreedHistory7d: number[] | null;
  news: NewsBrief[];
  etfFlow: EtfFlowData | null;
  global: GlobalData | null;
  correlation: CorrelationBrief | null;
  onchain: OnchainData | null;
  collectedSources: string[];
  failedSources: string[];
  fetchedAt: number;
}

const TTL_MS = 30 * 60_000;
let cached: FullMacroSnapshot | null = null;

function getTimeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function extractCoinPairs(matrix: CorrelationMatrix | null): CorrelationBrief | null {
  if (!matrix) return null;
  const find = (a: string, b: string): number | null => {
    for (const p of matrix.pairs) {
      if (
        (p.symbolA === a && p.symbolB === b) ||
        (p.symbolA === b && p.symbolB === a)
      ) {
        return p.correlation;
      }
    }
    return null;
  };
  return {
    btcEth: find('BTCUSDT', 'ETHUSDT'),
    btcSol: find('BTCUSDT', 'SOLUSDT'),
    btcXrp: find('BTCUSDT', 'XRPUSDT'),
  };
}

export async function getFullMacroSnapshot(): Promise<FullMacroSnapshot> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const [macro, fgi, fgiHist, news, etf, global, corr, onchain] = await Promise.all([
    safeCollect('macro', getMacroSnapshot, 12000),
    safeCollect('fgi', fetchFearGreedIndex, 5000),
    safeCollect('fgi-hist', () => fetchFearGreedHistory(7).then((arr) => arr.map((x) => x.value)), 5000),
    safeCollect('news', fetchLatestNews, 8000),
    safeCollect('etf', fetchEtfFlow, 8000),
    safeCollect('global', fetchGlobalData, 8000),
    safeCollect('correlation', fetchCorrelationMatrix, 15000),
    safeCollect('onchain', fetchOnchainData, 5000),
  ]);

  const newsBrief: NewsBrief[] = (news.data ?? []).slice(0, 5).map((n: NewsItem) => ({
    title: n.title,
    sentiment: n.sentiment,
    source: n.source,
    ago: getTimeAgo(n.publishedAt),
  }));

  const allResults = [macro, fgi, fgiHist, news, etf, global, corr, onchain];
  const collectedSources = allResults.filter((r) => r.data !== null).map((r) => r.source);
  const failedSources = allResults.filter((r) => r.data === null).map((r) => r.source);

  cached = {
    macro: macro.data,
    fearGreed: fgi.data,
    fearGreedHistory7d: fgiHist.data,
    news: newsBrief,
    etfFlow: etf.data,
    global: global.data,
    correlation: extractCoinPairs(corr.data),
    onchain: onchain.data,
    collectedSources,
    failedSources,
    fetchedAt: Date.now(),
  };

  console.log(
    `[macroBundle] collected=${collectedSources.length}/8 failed=${failedSources.join(',') || 'none'}`
  );
  return cached;
}
