// Why: top crypto headlines drive macro narrative. CoinTelegraph RSS primary, CoinDesk fallback.
// Source: AskBit src/lib/chat/collectors/news.ts (read-only reference). Title-based sentiment classifier added.
// 5-min cache; news doesn't move that fast inside a tick window.

export interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface CacheEntry {
  value: NewsItem[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 8000;
let cache: CacheEntry | null = null;

const POSITIVE_KEYWORDS = [
  'surge', 'rally', 'pump', 'all-time high', 'ath', 'breakout', 'soar', 'gain',
  'bullish', 'approve', 'approval', 'adopt', 'partnership', 'launch', 'upgrade',
  'inflow', 'accumulat',
];
const NEGATIVE_KEYWORDS = [
  'crash', 'dump', 'plunge', 'liquidat', 'hack', 'exploit', 'scam', 'rug',
  'bearish', 'sell-off', 'tumble', 'drop', 'fall', 'reject', 'ban', 'lawsuit',
  'fraud', 'outflow', 'sec ', 'tariff', 'fud',
];

function classifyTitle(title: string): 'positive' | 'negative' | 'neutral' {
  const lower = title.toLowerCase();
  const posHits = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  const negHits = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (posHits > negHits) return 'positive';
  if (negHits > posHits) return 'negative';
  return 'neutral';
}

function parseRss(xml: string, source: string, max = 5): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < max) {
    const itemXml = match[1] ?? '';
    const title =
      itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
      itemXml.match(/<title>(.*?)<\/title>/)?.[1] ??
      '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] ?? '';

    if (title) {
      const cleanTitle = title.trim();
      items.push({
        title: cleanTitle,
        source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        url: link.trim(),
        sentiment: classifyTitle(cleanTitle),
      });
    }
  }
  return items;
}

export async function fetchLatestNews(): Promise<NewsItem[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  try {
    const res = await fetch('https://cointelegraph.com/rss', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const text = await res.text();
      const items = parseRss(text, 'CoinTelegraph');
      if (items.length > 0) {
        cache = { value: items, expiresAt: Date.now() + CACHE_TTL_MS };
        return items;
      }
    }
  } catch (e) {
    console.warn('[news] CoinTelegraph threw:', e instanceof Error ? e.message : String(e));
  }

  try {
    const fallback = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (fallback.ok) {
      const fbText = await fallback.text();
      const items = parseRss(fbText, 'CoinDesk');
      cache = { value: items, expiresAt: Date.now() + CACHE_TTL_MS };
      return items;
    }
  } catch (e) {
    console.warn('[news] CoinDesk threw:', e instanceof Error ? e.message : String(e));
  }

  cache = { value: [], expiresAt: Date.now() + CACHE_TTL_MS };
  return [];
}
