import type { PositionSide } from '../db/types.js';

// 순수 함수 모음. DB/네트워크 의존성 없음 — 단위 테스트 용이.
// 실제 거래소(바이낸스)는 유지증거금(maintenance margin)을 빼고 계산하지만
// 게임 단순화를 위해 "잔고 100% 손실 지점 = 청산"으로 가정한다.

// 선물 청산가 공식 (maintenance margin 0% 가정):
//   Long:  entry * (1 - 1/leverage)
//   Short: entry * (1 + 1/leverage)
//
// 현물(spot, leverage=1)은 청산 없음 — null 반환.
export function calculateLiquidationPrice(args: {
  side: PositionSide;
  entryPrice: number;
  leverage: number;
}): number | null {
  const { side, entryPrice, leverage } = args;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new Error(`invalid entryPrice: ${entryPrice}`);
  }
  if (!Number.isInteger(leverage) || leverage < 1) {
    throw new Error(`invalid leverage: ${leverage}`);
  }
  if (leverage === 1) return null;

  const factor = 1 / leverage;
  return side === 'long'
    ? entryPrice * (1 - factor)
    : entryPrice * (1 + factor);
}

// 현재가가 청산가에 도달했는지. side에 따라 방향이 다르다.
//   Long: markPrice <= liquidationPrice 시 청산
//   Short: markPrice >= liquidationPrice 시 청산
export function isLiquidated(args: {
  side: PositionSide;
  liquidationPrice: number | null;
  markPrice: number;
}): boolean {
  const { side, liquidationPrice, markPrice } = args;
  if (liquidationPrice === null) return false;
  return side === 'long'
    ? markPrice <= liquidationPrice
    : markPrice >= liquidationPrice;
}

// 포지션 종료 시 손익 계산 (게임머니 단위, 정수 반올림).
//   pnl = size * leverage * (priceChange / entryPrice)
//   Long은 상승 시 이익, Short은 하락 시 이익.
export function calculatePnl(args: {
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  size: number;      // 증거금(게임머니)
  leverage: number;
}): number {
  const { side, entryPrice, exitPrice, size, leverage } = args;
  const direction = side === 'long' ? 1 : -1;
  const pctChange = (exitPrice - entryPrice) / entryPrice;
  return Math.round(size * leverage * pctChange * direction);
}
