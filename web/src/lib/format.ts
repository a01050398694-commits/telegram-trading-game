// Stage 6: USD 전환. 게임머니 단위는 이제 정수 달러.
// 가격은 소수점 2자리, 잔액/PnL 은 정수 달러 + 천단위 콤마.

// 가격 표기 — BTC $75,540.12 스타일.
export function formatUSD(n: number, digits: number = 2): string {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// 잔액/증거금/PnL 표기 — "$100,000" 형태.
// 100만 달러 이상은 "$1.23M" 처럼 축약해 모바일 공간 절약.
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

// 청산까지 남은 거리 퍼센트.
// long: 현재가가 청산가보다 위에 있으므로 (mark - liq) / mark
// short: 반대.
export function distanceToLiquidation(
  side: 'long' | 'short',
  markPrice: number,
  liquidationPrice: number,
): number {
  if (markPrice <= 0) return 0;
  return side === 'long'
    ? ((markPrice - liquidationPrice) / markPrice) * 100
    : ((liquidationPrice - markPrice) / markPrice) * 100;
}

// Stage 2 엔진과 동일 공식.
export function liquidationPrice(
  side: 'long' | 'short',
  entry: number,
  leverage: number,
): number {
  if (leverage <= 1) return side === 'long' ? 0 : Number.POSITIVE_INFINITY;
  const factor = 1 / leverage;
  return side === 'long' ? entry * (1 - factor) : entry * (1 + factor);
}

export function calcPnl(
  side: 'long' | 'short',
  entry: number,
  exit: number,
  size: number,
  leverage: number,
): number {
  const dir = side === 'long' ? 1 : -1;
  return Math.round(size * leverage * ((exit - entry) / entry) * dir);
}
