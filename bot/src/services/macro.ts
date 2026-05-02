// Why: macro context (DXY/US10Y/VIX/USD-KRW/WTI + FRED) for signal commentary.
// Source: AskBit src/lib/chat/collectors/macro.ts (read-only reference). Stocks (KOSPI/KOSDAQ/NASDAQ/S&P/Gold) excluded per Stage 17 v4.
// 10-min cache because Yahoo/FRED data updates slowly and we tick every 30 min.

import { env } from '../env.js';

export interface MacroSnapshot {
  vix: number | null;
  dxy: number | null;
  us10y: number | null;
  usdKrw: number | null;
  wti: number | null;
  fedRate: number | null;
  cpi: number | null;
  unemployment: number | null;
  gdpGrowth: number | null;
  fetchedAt: number;
}

const TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 5000;
let cached: MacroSnapshot | null = null;

async function fetchYahoo(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      quoteSummary?: { result?: Array<{ price?: { regularMarketPrice?: { raw?: number } } }> };
    };
    const raw = json.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function fetchFred(seriesId: string, apiKey: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&api_key=${apiKey}&file_type=json`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { observations?: Array<{ value?: string }> };
    const valStr = j.observations?.[0]?.value;
    if (!valStr) return null;
    const parsed = parseFloat(valStr);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getMacroSnapshot(): Promise<MacroSnapshot> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  // Yahoo Finance — no key needed. Run in parallel.
  const [vix, dxy, us10y, usdKrw, wti] = await Promise.all([
    fetchYahoo('%5EVIX'),
    fetchYahoo('DX-Y.NYB'),
    fetchYahoo('%5ETNX'),
    fetchYahoo('KRW%3DX'),
    fetchYahoo('CL%3DF'),
  ]);

  // FRED — only if API key present.
  let fedRate: number | null = null;
  let cpi: number | null = null;
  let unemployment: number | null = null;
  let gdpGrowth: number | null = null;
  const fredKey = env.FRED_API_KEY;
  if (fredKey) {
    const [a, b, c, d] = await Promise.all([
      fetchFred('FEDFUNDS', fredKey),
      fetchFred('CPIAUCSL', fredKey),
      fetchFred('UNRATE', fredKey),
      fetchFred('A191RL1Q225SBEA', fredKey),
    ]);
    fedRate = a;
    cpi = b;
    unemployment = c;
    gdpGrowth = d;
  }

  cached = {
    vix,
    dxy,
    us10y,
    usdKrw,
    wti,
    fedRate,
    cpi,
    unemployment,
    gdpGrowth,
    fetchedAt: Date.now(),
  };
  console.log(
    `[macro] dxy=${cached.dxy} us10y=${cached.us10y} vix=${cached.vix} fedRate=${cached.fedRate}`
  );
  return cached;
}
