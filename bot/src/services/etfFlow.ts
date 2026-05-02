// Why: BTC/ETH spot ETF net flow is a major driver of crypto narrative. SoSoValue primary, Farside fallback.
// Source: AskBit src/lib/chat/collectors/etf-flow.ts (read-only reference, ported verbatim).
// 1h cache because ETF data updates daily.

export interface EtfFlowData {
  btcNetFlow?: number | undefined;
  ethNetFlow?: number | undefined;
  btcTotalAum?: number | undefined;
  ethTotalAum?: number | undefined;
  lastUpdated?: string | undefined;
  source: string;
}

interface SoSoValueEntry {
  netInflow?: number;
  totalNetAssets?: number;
  date?: string;
}

interface CacheEntry {
  value: EtfFlowData;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 8000;
let cache: CacheEntry | null = null;

async function trySoSoValue(): Promise<EtfFlowData | null> {
  try {
    const [btcRes, ethRes] = await Promise.all([
      fetch('https://api.sosovalue.com/dataReportApi/etf/netFlow?etfType=BTC_SPOT', {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      }).catch(() => null),
      fetch('https://api.sosovalue.com/dataReportApi/etf/netFlow?etfType=ETH_SPOT', {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      }).catch(() => null),
    ]);

    let btcData: SoSoValueEntry | null = null;
    let ethData: SoSoValueEntry | null = null;

    if (btcRes?.ok) {
      const btcJson = (await btcRes.json()) as { data?: SoSoValueEntry[] };
      btcData = btcJson?.data?.[0] ?? null;
    }
    if (ethRes?.ok) {
      const ethJson = (await ethRes.json()) as { data?: SoSoValueEntry[] };
      ethData = ethJson?.data?.[0] ?? null;
    }

    if (!btcData && !ethData) return null;

    return {
      btcNetFlow: btcData?.netInflow,
      ethNetFlow: ethData?.netInflow,
      btcTotalAum: btcData?.totalNetAssets,
      ethTotalAum: ethData?.totalNetAssets,
      lastUpdated: btcData?.date ?? ethData?.date,
      source: 'sosovalue',
    };
  } catch {
    return null;
  }
}

function extractFarsideBtcFlow(html: string): number | undefined {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
  if (!rows) return undefined;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 3) continue;

    const lastCell = cells[cells.length - 1] ?? '';
    const text = lastCell.replace(/<[^>]+>/g, '').trim();

    const cleaned = text.replace(/[(),\s$]/g, '');
    const value = parseFloat(cleaned);
    if (!isNaN(value)) {
      return text.includes('(') ? -value : value;
    }
  }
  return undefined;
}

async function tryFarside(): Promise<EtfFlowData | null> {
  try {
    const res = await fetch('https://farside.co.uk/bitcoin-etf-flow-all-data/', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const btcNetFlow = extractFarsideBtcFlow(html);
    if (btcNetFlow === undefined) return null;

    return { btcNetFlow, source: 'farside' };
  } catch {
    return null;
  }
}

export async function fetchEtfFlow(): Promise<EtfFlowData> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  const soso = await trySoSoValue();
  if (soso) {
    cache = { value: soso, expiresAt: Date.now() + CACHE_TTL_MS };
    return soso;
  }
  console.warn('[etfFlow] SoSoValue unavailable, trying Farside');

  const farside = await tryFarside();
  if (farside) {
    cache = { value: farside, expiresAt: Date.now() + CACHE_TTL_MS };
    return farside;
  }
  console.warn('[etfFlow] both sources unavailable');

  const fallback: EtfFlowData = { source: 'unavailable' };
  cache = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
  return fallback;
}
