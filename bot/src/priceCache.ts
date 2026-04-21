// 공유 시세 캐시.
// BinancePriceFeed 가 tick 마다 write, Express 핸들러가 openPosition/closePosition 시 read.
// 단일 프로세스 메모리 — 확장 시 Redis 등으로 교체.

export class PriceCache {
  private prices = new Map<string, number>();

  set(symbol: string, price: number): void {
    this.prices.set(symbol.toLowerCase(), price);
  }

  get(symbol: string): number | null {
    return this.prices.get(symbol.toLowerCase()) ?? null;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.prices);
  }
}
