// 청산 로직 검증 — DB/네트워크 없이 순수 함수를 더미 데이터로 호출.
// 실행: `npx tsx scripts/test-liquidation.ts` (bot/ 디렉토리에서)

import {
  calculateLiquidationPrice,
  calculatePnl,
  isLiquidated,
} from '../src/engine/liquidation.js';

let failed = 0;

function assert(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertClose(name: string, actual: number, expected: number, epsilon = 0.01): void {
  const ok = Math.abs(actual - expected) <= epsilon;
  if (ok) {
    console.log(`  ✓ ${name}  (actual=${actual.toFixed(4)})`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}  expected≈${expected}, got ${actual}`);
  }
}

console.log('--- calculateLiquidationPrice ---');
// Long 10x @ 100 → 청산가 90 (100 * (1 - 0.1))
assertClose(
  'long 10x',
  calculateLiquidationPrice({ side: 'long', entryPrice: 100, leverage: 10 }) ?? NaN,
  90,
);
// Short 10x @ 100 → 청산가 110
assertClose(
  'short 10x',
  calculateLiquidationPrice({ side: 'short', entryPrice: 100, leverage: 10 }) ?? NaN,
  110,
);
// Spot (leverage=1) → null
assert(
  'spot returns null',
  calculateLiquidationPrice({ side: 'long', entryPrice: 100, leverage: 1 }),
  null,
);
// BTC long 20x @ 50000 → 50000 * 0.95 = 47500
assertClose(
  'btc long 20x',
  calculateLiquidationPrice({ side: 'long', entryPrice: 50000, leverage: 20 }) ?? NaN,
  47500,
);

console.log('\n--- isLiquidated ---');
// Long 청산가 90, 현재가 89 → 청산
assert(
  'long below liq',
  isLiquidated({ side: 'long', liquidationPrice: 90, markPrice: 89 }),
  true,
);
// Long 청산가 90, 현재가 95 → 안전
assert(
  'long above liq',
  isLiquidated({ side: 'long', liquidationPrice: 90, markPrice: 95 }),
  false,
);
// Short 청산가 110, 현재가 111 → 청산
assert(
  'short above liq',
  isLiquidated({ side: 'short', liquidationPrice: 110, markPrice: 111 }),
  true,
);
// Short 청산가 110, 현재가 105 → 안전
assert(
  'short below liq',
  isLiquidated({ side: 'short', liquidationPrice: 110, markPrice: 105 }),
  false,
);
// Spot (liquidationPrice=null) → 절대 청산 안됨
assert(
  'spot never liquidates',
  isLiquidated({ side: 'long', liquidationPrice: null, markPrice: 1 }),
  false,
);

console.log('\n--- calculatePnl ---');
// Long 10x, 100 → 110 (+10%), size 1억 → PnL = 1억 * 10 * 0.1 = 1억
assert(
  'long 10x +10% = +100%',
  calculatePnl({ side: 'long', entryPrice: 100, exitPrice: 110, size: 100_000_000, leverage: 10 }),
  100_000_000,
);
// Long 10x, 100 → 90 (-10%), size 1억 → PnL = -1억 (전액 손실 = 청산 임계)
assert(
  'long 10x -10% = -100%',
  calculatePnl({ side: 'long', entryPrice: 100, exitPrice: 90, size: 100_000_000, leverage: 10 }),
  -100_000_000,
);
// Short 10x, 100 → 90 (+10% 수익)
assert(
  'short 10x -10% price = +100%',
  calculatePnl({ side: 'short', entryPrice: 100, exitPrice: 90, size: 100_000_000, leverage: 10 }),
  100_000_000,
);
// Spot (leverage=1), 100 → 110 → +10% of size
assert(
  'spot +10%',
  calculatePnl({ side: 'long', entryPrice: 100, exitPrice: 110, size: 100_000_000, leverage: 1 }),
  10_000_000,
);

console.log('\n--- Scenario: BTC Long 20x 청산 ---');
// 유저가 10억을 BTC Long 20x @ 50000 진입.
// 청산가 = 47500. 가격이 47500 이하로 내려가면 청산.
const entry = 50000;
const side = 'long' as const;
const leverage = 20;
const liq = calculateLiquidationPrice({ side, entryPrice: entry, leverage });
console.log(`  entry=${entry}, leverage=${leverage}x, liquidationPrice=${liq}`);

// 48000: 안전
assert(
  'BTC@48000 safe',
  isLiquidated({ side, liquidationPrice: liq, markPrice: 48000 }),
  false,
);
// 47500: 정확히 청산 임계
assert(
  'BTC@47500 liquidated',
  isLiquidated({ side, liquidationPrice: liq, markPrice: 47500 }),
  true,
);
// 47000: 청산
assert(
  'BTC@47000 liquidated',
  isLiquidated({ side, liquidationPrice: liq, markPrice: 47000 }),
  true,
);

console.log(`\n${failed === 0 ? '✅ ALL PASSED' : `❌ ${failed} FAILED`}`);
if (failed > 0) process.exit(1);
