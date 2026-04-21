// Stage 6: 지원 거래소 카탈로그. 기획아이디어.md §7 — "30개 정도 지원" 목표.
// 각 거래소별 인증 레벨(§10) 을 함께 저장해 프론트에서 "심사중" 안내 문구 차등화.
//
//   level 1: 공식 affiliate API 로 즉시 자동 승인
//   level 2: UID + 추가 텍스트 반자동
//   level 3: 수동 심사 (느림)

export type VerificationLevel = 1 | 2 | 3;

export type Exchange = {
  id: string;
  name: string;
  level: VerificationLevel;
};

// 초기 공개 목록. 30개 중 18개 우선 — 나머지는 론칭 후 순차 추가 예정.
export const EXCHANGES: readonly Exchange[] = [
  { id: 'binance', name: 'Binance', level: 1 },
  { id: 'bybit', name: 'Bybit', level: 1 },
  { id: 'okx', name: 'OKX', level: 1 },
  { id: 'bitget', name: 'Bitget', level: 1 },
  { id: 'mexc', name: 'MEXC', level: 2 },
  { id: 'gate', name: 'Gate.io', level: 2 },
  { id: 'kucoin', name: 'KuCoin', level: 2 },
  { id: 'htx', name: 'HTX (Huobi)', level: 2 },
  { id: 'bingx', name: 'BingX', level: 2 },
  { id: 'bitmart', name: 'BitMart', level: 2 },
  { id: 'phemex', name: 'Phemex', level: 2 },
  { id: 'coinex', name: 'CoinEx', level: 3 },
  { id: 'kraken', name: 'Kraken', level: 3 },
  { id: 'bitfinex', name: 'Bitfinex', level: 3 },
  { id: 'bitmex', name: 'BitMEX', level: 3 },
  { id: 'woo', name: 'WOO X', level: 3 },
  { id: 'deribit', name: 'Deribit', level: 3 },
  { id: 'lbank', name: 'LBank', level: 3 },
] as const;

export function getExchange(id: string): Exchange | null {
  return EXCHANGES.find((e) => e.id === id) ?? null;
}

export function levelLabel(level: VerificationLevel): string {
  if (level === 1) return '자동 승인';
  if (level === 2) return '반자동 (빠른 승인)';
  return '수동 심사';
}
