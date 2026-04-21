// Stage 8.0: 60+ Binance Perpetual 심볼 카탈로그.
// 서버 env.MARKET_SYMBOLS 의 부분집합이 실시간 청산 감시 대상.
// 프론트는 전체 목록을 검색 모달로 노출 (WebSocket 은 사용자가 선택한 1종만 구독).

export type MarketMeta = {
  symbol: string;   // "btcusdt"
  display: string;  // "BTC/USDT"
  ticker: string;   // "BTC"
  name: string;     // "Bitcoin"
  icon: string;     // 1글자 뱃지
  color: string;    // Tailwind color 조합
};

// 팔레트 — 6색 로테이션으로 뱃지 컬러 자동 할당.
const PALETTE = [
  'bg-amber-500/15 text-amber-400',
  'bg-indigo-500/15 text-indigo-300',
  'bg-emerald-500/15 text-emerald-300',
  'bg-rose-500/15 text-rose-300',
  'bg-sky-500/15 text-sky-300',
  'bg-violet-500/15 text-violet-300',
] as const;

type Seed = Omit<MarketMeta, 'color' | 'symbol' | 'display'> & { ticker: string };

// Binance USDT-M Perpetual 상위 거래량 60종. 아이콘은 유니코드 1글자.
const SEEDS: readonly Seed[] = [
  { ticker: 'BTC', name: 'Bitcoin', icon: '₿' },
  { ticker: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { ticker: 'SOL', name: 'Solana', icon: '◎' },
  { ticker: 'BNB', name: 'BNB', icon: 'B' },
  { ticker: 'XRP', name: 'Ripple', icon: 'X' },
  { ticker: 'DOGE', name: 'Dogecoin', icon: 'Ð' },
  { ticker: 'PEPE', name: 'Pepe', icon: '🐸' },
  { ticker: 'SHIB', name: 'Shiba Inu', icon: '柴' },
  { ticker: 'ADA', name: 'Cardano', icon: '₳' },
  { ticker: 'AVAX', name: 'Avalanche', icon: 'A' },
  { ticker: 'DOT', name: 'Polkadot', icon: '●' },
  { ticker: 'LINK', name: 'Chainlink', icon: '◆' },
  { ticker: 'MATIC', name: 'Polygon', icon: 'M' },
  { ticker: 'TRX', name: 'TRON', icon: 'T' },
  { ticker: 'LTC', name: 'Litecoin', icon: 'Ł' },
  { ticker: 'BCH', name: 'Bitcoin Cash', icon: 'Ƀ' },
  { ticker: 'UNI', name: 'Uniswap', icon: 'U' },
  { ticker: 'ATOM', name: 'Cosmos', icon: '⚛' },
  { ticker: 'XLM', name: 'Stellar', icon: '★' },
  { ticker: 'XMR', name: 'Monero', icon: 'ɱ' },
  { ticker: 'ETC', name: 'Ethereum Classic', icon: 'E' },
  { ticker: 'FIL', name: 'Filecoin', icon: 'F' },
  { ticker: 'INJ', name: 'Injective', icon: 'I' },
  { ticker: 'OP', name: 'Optimism', icon: 'O' },
  { ticker: 'ARB', name: 'Arbitrum', icon: 'A' },
  { ticker: 'SUI', name: 'Sui', icon: 'S' },
  { ticker: 'APT', name: 'Aptos', icon: '🅰' },
  { ticker: 'SEI', name: 'Sei', icon: 'S' },
  { ticker: 'TIA', name: 'Celestia', icon: 'T' },
  { ticker: 'NEAR', name: 'NEAR', icon: 'N' },
  { ticker: 'APE', name: 'ApeCoin', icon: '🐵' },
  { ticker: 'SAND', name: 'Sandbox', icon: 'S' },
  { ticker: 'MANA', name: 'Decentraland', icon: 'M' },
  { ticker: 'AAVE', name: 'Aave', icon: 'A' },
  { ticker: 'MKR', name: 'Maker', icon: 'M' },
  { ticker: 'COMP', name: 'Compound', icon: 'C' },
  { ticker: 'SNX', name: 'Synthetix', icon: 'S' },
  { ticker: 'CRV', name: 'Curve', icon: 'C' },
  { ticker: 'DYDX', name: 'dYdX', icon: 'D' },
  { ticker: 'LDO', name: 'Lido', icon: 'L' },
  { ticker: 'RUNE', name: 'THORChain', icon: 'R' },
  { ticker: 'FTM', name: 'Fantom', icon: 'F' },
  { ticker: 'ALGO', name: 'Algorand', icon: 'A' },
  { ticker: 'ICP', name: 'Internet Computer', icon: '∞' },
  { ticker: 'HBAR', name: 'Hedera', icon: 'H' },
  { ticker: 'VET', name: 'VeChain', icon: 'V' },
  { ticker: 'FLOW', name: 'Flow', icon: '≋' },
  { ticker: 'GRT', name: 'The Graph', icon: 'G' },
  { ticker: 'CHZ', name: 'Chiliz', icon: 'C' },
  { ticker: 'THETA', name: 'Theta', icon: 'Θ' },
  { ticker: 'AXS', name: 'Axie Infinity', icon: '🪓' },
  { ticker: 'GALA', name: 'Gala', icon: 'G' },
  { ticker: 'EOS', name: 'EOS', icon: 'E' },
  { ticker: 'KAVA', name: 'Kava', icon: 'K' },
  { ticker: 'ZIL', name: 'Zilliqa', icon: 'Z' },
  { ticker: 'WLD', name: 'Worldcoin', icon: '◉' },
  { ticker: 'JUP', name: 'Jupiter', icon: 'J' },
  { ticker: 'PYTH', name: 'Pyth', icon: 'π' },
  { ticker: 'ENA', name: 'Ethena', icon: 'E' },
  { ticker: 'STRK', name: 'Starknet', icon: 'S' },
  { ticker: 'WIF', name: 'dogwifhat', icon: '🐕' },
  { ticker: 'BONK', name: 'Bonk', icon: '🐶' },
  { ticker: 'FLOKI', name: 'Floki', icon: '🐺' },
] as const;

// Stage 8.14 — Binance Futures 는 초저가 밈코인을 '1000TICKER' 프리픽스로만 상장함.
// PEPE, SHIB, BONK, FLOKI 는 각각 1000PEPE, 1000SHIB, 1000BONK, 1000FLOKI USDT-M Perpetual 로 존재.
// 프리픽스 없이 요청하면 Binance 는 -1121 Invalid symbol 로 400 을 뱉고 차트가 하얘진다.
// 내부 ticker 표기는 그대로 유지해 UI 는 PEPE/SHIB 로 자연스럽게 노출.
const FUTURES_PREFIX_1000 = new Set<string>(['PEPE', 'SHIB', 'BONK', 'FLOKI']);

export const MARKETS: readonly MarketMeta[] = SEEDS.map((seed, i) => {
  const apiTicker = FUTURES_PREFIX_1000.has(seed.ticker) ? `1000${seed.ticker}` : seed.ticker;
  return {
    ...seed,
    symbol: `${apiTicker.toLowerCase()}usdt`,
    display: `${seed.ticker}/USDT`,
    color: PALETTE[i % PALETTE.length]!,
  };
});

// Backward-compat type alias — 기존에 MarketSymbol 유니온으로 타이핑하던 곳을 위한 string 폴백.
// Stage 8.0 부터 심볼이 동적으로 늘어나므로 string 으로 완화.
export type MarketSymbol = string;

export function getMarket(symbol: string): MarketMeta {
  const s = symbol.toLowerCase();
  const found = MARKETS.find((m) => m.symbol === s);
  return found ?? MARKETS[0]!;
}

// 검색 필터 — ticker/name/display 중 아무거나 부분일치.
export function searchMarkets(query: string): readonly MarketMeta[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return MARKETS;
  return MARKETS.filter((m) =>
    m.ticker.toLowerCase().includes(q) ||
    m.name.toLowerCase().includes(q) ||
    m.display.toLowerCase().includes(q),
  );
}
