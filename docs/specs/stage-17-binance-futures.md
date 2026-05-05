# Spec: Stage 17 — Binance Futures 핵심 7기능 (Limit Orders + Position Management + Enhanced Charts)

## 0. Overview

**한 줄 목표**:  
텔레그램 종이거래 미니앱에서 단순 시장가 거래를 벗어나, 선물(Futures) 거래의 실무급 기능 7개를 추가. **Limit 주문 + 손절·익절(SL/TP) + 부분 청산 + 6개 timeframe 차트 + 고급 호가 표시** 로 구성.

**현재 상태 (Stage 16 MVP)**:
- DB: `positions` 테이블만 (오픈/청산/청산됨)
- 주문: 시장가(Market) 단일 type
- 진입: mark price 즉시 체결
- 청산: 전량만 가능
- 차트: 1분봉 고정
- 호가: 5단 compact

**의도적 제외 (v1 범위 밖)**:
- Hedge mode, Trailing stop, Post-only/IOC/FOK 주문 타입
- Index/Last price 분리 (Mark price 통일 유지)
- Cross 마진 진짜 구현 (잔고 공유) — UI 토글만, 로직은 isolated 유지
- Drawing tools, RSI/MACD/Bollinger bands
- Funding rate 정산 (가격 표시만)
- 수수료 분리 (거래 크기에 포함)
- SL/TP drag (고정가 입력만)
- 가격 변동 알림 (모바일 알림)

**검증 게이트** (Phase 끝마다):
- TypeScript `tsc` + `npm run build` + `npm run lint` 성공
- Playwright E2E 해당 시나리오 통과
- 모바일(iOS + Android) 브라우저 시각 확인

---

## 1. DB Schema Changes

### 1.1 Migration 12: `orders` 테이블

```sql
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('limit', 'stop_loss', 'take_profit')),
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  price NUMERIC(20, 8) NOT NULL,  -- limit price for limit, trigger price for SL/TP
  size BIGINT NOT NULL,            -- order size (USD equivalent)
  leverage INTEGER NOT NULL,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,  -- NULL for limit orders, filled position id for SL/TP
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'triggered', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  filled_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  triggered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_orders_user_symbol_status ON public.orders(user_id, symbol, status);
CREATE INDEX idx_orders_position_id ON public.orders(position_id) WHERE position_id IS NOT NULL;
CREATE INDEX idx_orders_status_pending ON public.orders(status) WHERE status = 'pending';
```

**설명**:
- `type`: 3가지 주문 종류. SL/TP 는 기존 포지션을 청산하기 위한 트리거 주문.
- `price`: limit 주문의 지정가, SL/TP 주문의 트리거 가격.
- `position_id`: Limit 주문은 NULL (아직 포지션 없음). SL/TP 주문은 해당 포지션 참조.
- `status`: pending → filled/cancelled (limit), 또는 pending → triggered/expired (SL/TP).
- 인덱스: 사용자·심볼·상태로 미체결 주문 빠른 조회, position_id 로 SL/TP 빠른 조회.

**RLS 정책**:
```sql
CREATE POLICY "users can view own orders" ON public.orders
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users can insert own orders" ON public.orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can update own pending orders" ON public.orders
  FOR UPDATE USING (user_id = auth.uid() AND status = 'pending');
```

---

### 1.2 Migration 13: `positions` 컬럼 확장

```sql
ALTER TABLE public.positions
  ADD COLUMN sl_price NUMERIC(20, 8),        -- stop loss trigger price
  ADD COLUMN tp_price NUMERIC(20, 8),        -- take profit trigger price
  ADD COLUMN margin_mode TEXT DEFAULT 'isolated' CHECK (margin_mode IN ('isolated', 'cross')),
  ADD COLUMN realized_pnl_total BIGINT DEFAULT 0;  -- cumulative realized PnL for this position
```

**설명**:
- `sl_price` / `tp_price`: Null 가능. 진입 시 옵션으로 설정 가능. 후속 수정도 가능.
- `margin_mode`: UI 토글용 (지금은 UI만, 로직은 모두 isolated 유지).
- `realized_pnl_total`: 부분 청산 시 누적 실현 PnL. 처음엔 0. 부분 청산 때마다 누적.

---

### 1.3 Migration 14: `close_position_partial` RPC

```sql
CREATE OR REPLACE FUNCTION public.close_position_partial(
  p_position_id UUID,
  p_close_pct INTEGER,  -- 25, 50, 75, 100
  p_mark_price NUMERIC(20, 8)
) RETURNS RECORD
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_size BIGINT;
  v_side TEXT;
  v_entry_price NUMERIC(20, 8);
  v_leverage INTEGER;
  v_close_size BIGINT;
  v_pnl BIGINT;
  v_return_amount BIGINT;
  v_new_balance BIGINT;
  v_new_size BIGINT;
  v_new_status TEXT;
BEGIN
  SELECT user_id, size, side, entry_price, leverage
    INTO v_user_id, v_size, v_side, v_entry_price, v_leverage
    FROM public.positions
    WHERE id = p_position_id AND status = 'open'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POSITION_NOT_FOUND_OR_NOT_OPEN: %', p_position_id;
  END IF;

  -- 부분 청산 크기 (정수 USD)
  v_close_size := (v_size * p_close_pct) / 100;
  
  -- PnL 계산 (side 별로)
  IF v_side = 'long' THEN
    v_pnl := ((p_mark_price - v_entry_price) / v_entry_price) * v_close_size * v_leverage;
  ELSE  -- short
    v_pnl := ((v_entry_price - p_mark_price) / v_entry_price) * v_close_size * v_leverage;
  END IF;

  -- 지갑 반환 = 원금 + PnL
  v_return_amount := v_close_size + v_pnl;
  v_new_size := v_size - v_close_size;

  -- 100% 청산 vs 부분 청산
  IF p_close_pct = 100 THEN
    v_new_status := 'closed';
    UPDATE public.positions
      SET status = 'closed', 
          pnl = v_pnl,
          realized_pnl_total = v_pnl,
          closed_at = now()
      WHERE id = p_position_id;
  ELSE
    -- 부분 청산: 사이즈 차감, 실현PnL 누적, 상태 유지
    UPDATE public.positions
      SET size = v_new_size,
          realized_pnl_total = realized_pnl_total + v_pnl
      WHERE id = p_position_id;
    v_new_status := 'open';
  END IF;

  -- 지갑 적립 + SL/TP cancel (부분 청산 후 기존 trigger order 는 invalid)
  UPDATE public.wallets
    SET balance = balance + v_return_amount
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_balance;

  -- 이 포지션의 SL/TP 주문 모두 만료 표시
  UPDATE public.orders
    SET status = 'expired'
    WHERE position_id = p_position_id AND status = 'pending';

  RETURN ROW(
    v_pnl,
    v_new_size,
    v_new_balance,
    v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_position_partial(UUID, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_position_partial(UUID, INTEGER, NUMERIC) TO service_role;
```

**반환값** (Record):
```
{
  pnl: BIGINT,
  new_size: BIGINT,
  new_balance: BIGINT,
  new_status: TEXT  -- 'open' or 'closed'
}
```

---

## 2. Backend Engine Changes

### 2.1 신규 파일: `bot/src/engine/orderMatcher.ts`

```typescript
import type { Db } from '../db/supabase.js';
import type { TradingEngine } from './trading.js';
import { calculateLiquidationPrice } from './liquidation.js';

export interface PendingOrder {
  id: string;
  userId: string;
  symbol: string;
  type: 'limit' | 'stop_loss' | 'take_profit';
  side: 'long' | 'short';
  price: number;  // trigger/limit price
  size: number;   // USD
  leverage: number;
  positionId: string | null;
  status: 'pending';
}

export class OrderMatcher {
  constructor(private readonly db: Db, private readonly engine: TradingEngine) {}

  /**
   * mark price tick 마다 호출.
   * pending 주문을 모두 검사하고 조건 도달 시 trigger/체결.
   */
  async matchOrders(symbol: string, markPrice: number): Promise<void> {
    // 이 심볼의 모든 pending 주문 조회
    const { data: orders, error } = await this.db
      .from('orders')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'pending');
    if (error) throw new Error(`matchOrders: ${error.message}`);

    const pending = (orders ?? []) as PendingOrder[];

    for (const order of pending) {
      try {
        if (order.type === 'limit') {
          await this.matchLimit(order, markPrice);
        } else {
          // stop_loss or take_profit
          await this.matchStopOrder(order, markPrice);
        }
      } catch (err) {
        console.error(`[orderMatcher] order ${order.id}:`, err);
      }
    }
  }

  private async matchLimit(order: PendingOrder, markPrice: number): Promise<void> {
    // 체결 조건: long: markPrice <= limitPrice, short: markPrice >= limitPrice
    const shouldFill =
      (order.side === 'long' && markPrice <= order.price) ||
      (order.side === 'short' && markPrice >= order.price);

    if (!shouldFill) return;

    // 체결: openPosition RPC 호출 + order.status = 'filled'
    try {
      const pos = await this.engine.openPosition({
        userId: order.userId,
        symbol: order.symbol,
        positionType: 'futures',
        side: order.side,
        size: order.size,
        leverage: order.leverage,
        markPrice,
        slPrice: null,  // SL/TP 는 order 에서 분리
        tpPrice: null,
      });

      // 주문 상태 업데이트
      await this.db
        .from('orders')
        .update({ status: 'filled', filled_at: new Date().toISOString() })
        .eq('id', order.id);

      // orders 테이블에 position_id 기록
      await this.db
        .from('orders')
        .update({ position_id: pos.id })
        .eq('id', order.id);
    } catch (err) {
      // 청산 됨, 잔고 부족 등 실패 시 주문 취소
      await this.db
        .from('orders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', order.id);
      throw err;
    }
  }

  private async matchStopOrder(order: PendingOrder, markPrice: number): Promise<void> {
    // SL/TP: position_id 를 참조해서 포지션 조회
    if (!order.positionId) {
      await this.db
        .from('orders')
        .update({ status: 'expired', cancelled_at: new Date().toISOString() })
        .eq('id', order.id);
      return;
    }

    const { data: pos, error } = await this.db
      .from('positions')
      .select('*')
      .eq('id', order.positionId)
      .single();
    if (error || !pos) {
      await this.db
        .from('orders')
        .update({ status: 'expired' })
        .eq('id', order.id);
      return;
    }

    // 트리거 조건: long SL: markPrice <= price, long TP: markPrice >= price, etc.
    const shouldTrigger = this.checkStopTrigger(pos as any, order, markPrice);
    if (!shouldTrigger) return;

    // 트리거: closePosition (100% 청산)
    try {
      await this.engine.closePosition({
        userId: order.userId,
        positionId: order.positionId,
        markPrice,
      });

      // 주문 상태 = triggered
      await this.db
        .from('orders')
        .update({ status: 'triggered', triggered_at: new Date().toISOString() })
        .eq('id', order.id);
    } catch (err) {
      console.error(`[orderMatcher] SL/TP trigger failed:`, err);
    }
  }

  private checkStopTrigger(
    position: any,
    order: PendingOrder,
    markPrice: number,
  ): boolean {
    if (order.type === 'stop_loss') {
      // SL: 손실 방향 도달 시 (long: 하락선, short: 상승선)
      return position.side === 'long'
        ? markPrice <= order.price
        : markPrice >= order.price;
    } else if (order.type === 'take_profit') {
      // TP: 수익 방향 도달 시 (long: 상승선, short: 하락선)
      return position.side === 'long'
        ? markPrice >= order.price
        : markPrice <= order.price;
    }
    return false;
  }
}
```

### 2.2 TradingEngine 메서드 확장 (`bot/src/engine/trading.ts`)

```typescript
// Stage 17 — Limit order + SL/TP 기능 추가

/**
 * Limit 주문 생성. 체결은 orderMatcher 에서 tick 마다 검사.
 */
async placeLimitOrder(args: {
  userId: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;  // USD
  leverage: number;
  limitPrice: number;
}): Promise<{ id: string; status: 'pending' }> {
  const { userId, symbol, side, size, leverage, limitPrice } = args;

  if (size <= 0) throw new Error('size must be positive');
  
  // 사용자 지갑 확인
  const wallet = await this.getWallet(userId);
  if (!wallet) throw new Error('wallet not found');
  if (wallet.is_liquidated) throw new Error('LIQUIDATED');
  if (wallet.balance < size) throw new Error('INSUFFICIENT_BALANCE');

  // order 생성
  const { data, error } = await this.db
    .from('orders')
    .insert({
      user_id: userId,
      symbol,
      type: 'limit',
      side,
      price: limitPrice,
      size,
      leverage,
      position_id: null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`placeLimitOrder: ${error.message}`);

  return { id: (data as { id: string }).id, status: 'pending' };
}

/**
 * SL/TP 주문 생성 (기존 포지션에 할당).
 */
async placeStopOrder(args: {
  positionId: string;
  type: 'stop_loss' | 'take_profit';
  triggerPrice: number;
}): Promise<{ id: string }> {
  const { positionId, type, triggerPrice } = args;

  // 포지션 확인
  const { data: pos, error: posErr } = await this.db
    .from('positions')
    .select('user_id, side')
    .eq('id', positionId)
    .eq('status', 'open')
    .single();
  if (posErr || !pos) throw new Error('position not found or not open');

  const { data, error } = await this.db
    .from('orders')
    .insert({
      user_id: (pos as any).user_id,
      symbol: '',  // dummy, matchOrders 에서 position 조회로 실제 심볼 알아낼 수 있음
      type,
      side: (pos as any).side,
      price: triggerPrice,
      size: 0,  // dummy, SL/TP 는 포지션 크기 기준
      leverage: 0,
      position_id: positionId,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`placeStopOrder: ${error.message}`);

  return { id: (data as { id: string }).id };
}

/**
 * 주문 취소.
 */
async cancelOrder(orderId: string, userId: string): Promise<void> {
  const { error } = await this.db
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw new Error(`cancelOrder: ${error.message}`);
}

/**
 * 부분 청산.
 */
async closePartial(args: {
  positionId: string;
  closePct: number;  // 25, 50, 75, 100
  markPrice: number;
}): Promise<{ pnl: number; newSize: number; newBalance: number }> {
  const { positionId, closePct, markPrice } = args;

  const { data, error } = await this.db.rpc('close_position_partial', {
    p_position_id: positionId,
    p_close_pct: closePct,
    p_mark_price: markPrice,
  });
  if (error) throw new Error(`closePartial RPC: ${error.message}`);

  const result = data as {
    pnl: number;
    new_size: number;
    new_balance: number;
    new_status: string;
  };

  return {
    pnl: result.pnl,
    newSize: result.new_size,
    newBalance: result.new_balance,
  };
}

/**
 * 포지션에 SL/TP 가격 설정 (position 행 직접 업데이트).
 */
async setSlTpForPosition(args: {
  positionId: string;
  slPrice?: number | null;
  tpPrice?: number | null;
}): Promise<void> {
  const { positionId, slPrice, tpPrice } = args;

  const updates: Record<string, any> = {};
  if (slPrice !== undefined) updates.sl_price = slPrice;
  if (tpPrice !== undefined) updates.tp_price = tpPrice;

  if (Object.keys(updates).length === 0) return;

  const { error } = await this.db
    .from('positions')
    .update(updates)
    .eq('id', positionId);
  if (error) throw new Error(`setSlTpForPosition: ${error.message}`);
}

/**
 * openPosition 시그니처 확장: slPrice, tpPrice optional 추가.
 */
async openPosition(args: {
  userId: string;
  symbol: string;
  positionType: PositionType;
  side: PositionSide;
  size: number;
  leverage: number;
  markPrice: number;
  slPrice?: number | null;
  tpPrice?: number | null;
}): Promise<PositionRow> {
  // ... 기존 로직 ...
  
  // position insert 시 sl_price, tp_price 컬럼도 포함
  const { data: positionId, error: rpcErr } = await this.db.rpc(
    'open_position_atomic',
    {
      p_user_id: args.userId,
      p_symbol: args.symbol,
      p_position_type: args.positionType,
      p_side: args.side,
      p_size: args.size,
      p_leverage: args.leverage,
      p_entry_price: args.markPrice,
      p_liquidation_price: liquidationPrice,
      p_sl_price: args.slPrice ?? null,
      p_tp_price: args.tpPrice ?? null,
    },
  );
  // ... 나머지 ...
}
```

### 2.3 서버 메인 루프에 orderMatcher 통합

`bot/src/index.ts` (또는 `bot/src/main.ts`):

```typescript
const orderMatcher = new OrderMatcher(db, engine);

// 각 symbol tick 마다 (같은 loop 에서 scanAndLiquidate 이후)
priceCache.on('tick', (symbol: string, price: number) => {
  // 1. 청산 검사
  engine.scanAndLiquidate(symbol, price).catch(err => {
    console.error('[scanAndLiquidate]', err);
  });

  // 2. 주문 매칭 (청산 후, 주문 취소 반영하기 위해)
  orderMatcher.matchOrders(symbol, price).catch(err => {
    console.error('[orderMatcher]', err);
  });
});
```

---

## 3. API Specification

### 3.1 새 Endpoints

```typescript
// POST /api/orders — Limit/Stop 주문 생성
interface PlaceOrderRequest {
  telegramUserId: number;
  symbol: string;
  orderType: 'limit' | 'stop_loss' | 'take_profit';
  side: 'long' | 'short';
  size: number;
  leverage: number;
  triggerPrice: number;  // limit price or SL/TP trigger
  positionId?: string;   // for SL/TP only
}

interface PlaceOrderResponse {
  ok: true;
  orderId: string;
  status: 'pending';
}

// GET /api/orders?telegramUserId=<id> — 미체결 주문 조회
interface FetchOrdersResponse {
  orders: {
    id: string;
    symbol: string;
    type: 'limit' | 'stop_loss' | 'take_profit';
    side: 'long' | 'short';
    price: number;
    size: number;
    leverage: number;
    status: 'pending';
    createdAt: string;
  }[];
}

// DELETE /api/orders/:id — 주문 취소
interface CancelOrderResponse {
  ok: true;
  orderId: string;
}

// DELETE /api/orders/all?telegramUserId=<id> — 전체 취소
interface CancelAllResponse {
  ok: true;
  cancelled: number;  // 취소된 주문 개수
}

// GET /api/orders/history?telegramUserId=<id> — 체결/취소 내역
interface OrderHistoryResponse {
  orders: {
    id: string;
    symbol: string;
    type: 'limit' | 'stop_loss' | 'take_profit';
    side: 'long' | 'short';
    price: number;
    size: number;
    status: 'filled' | 'cancelled' | 'triggered' | 'expired';
    createdAt: string;
    filledAt?: string;
    cancelledAt?: string;
  }[];
}

// POST /api/trade/close-partial — 부분 청산
interface ClosePartialRequest {
  telegramUserId: number;
  positionId: string;
  closePct: 25 | 50 | 75 | 100;
  fallbackPrice: number;  // 계산용 mark price
}

interface ClosePartialResponse {
  ok: true;
  pnl: number;
  newSize: number;
  newBalance: number;
  newStatus: 'open' | 'closed';
}

// POST /api/positions/sl-tp — SL/TP 수정
interface SetSlTpRequest {
  telegramUserId: number;
  positionId: string;
  slPrice?: number | null;
  tpPrice?: number | null;
}

interface SetSlTpResponse {
  ok: true;
}

// POST /api/positions/margin-mode — 마진모드 토글 (UI 전용 단계 1)
interface SetMarginModeRequest {
  telegramUserId: number;
  positionId: string;
  marginMode: 'isolated' | 'cross';
}

interface SetMarginModeResponse {
  ok: true;
  marginMode: 'isolated' | 'cross';  // 확인용
}
```

### 3.2 기존 Endpoint 확장

```typescript
// POST /api/trade/open — 기존 시그니처 호환성 유지
interface OpenTradeInput {
  telegramUserId: number;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  leverage: number;
  fallbackPrice: number;
  // Stage 17 추가:
  orderType?: 'market' | 'limit';  // default 'market'
  limitPrice?: number;               // if orderType='limit'
  slPrice?: number | null;           // 진입 시 SL 설정
  tpPrice?: number | null;           // 진입 시 TP 설정
}

// GET /api/user/status — 응답에 openOrders 추가
interface UserStatus {
  // ... 기존 필드 ...
  openOrders: {
    id: string;
    symbol: string;
    type: 'limit' | 'stop_loss' | 'take_profit';
    side: 'long' | 'short';
    price: number;
    size: number;
    status: 'pending';
    createdAt: string;
  }[];
}
```

---

## 4. Frontend API Client (`web/src/lib/api.ts`)

```typescript
// 새 타입
export type OrderType = 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'triggered' | 'expired';

export type ServerOrder = {
  id: string;
  symbol: string;
  type: OrderType;
  side: 'long' | 'short';
  price: number;
  size: number;
  leverage: number;
  status: OrderStatus;
  createdAt: string;
  filledAt?: string;
  cancelledAt?: string;
};

export type Order = ServerOrder & {
  positionId?: string;  // for SL/TP
};

// 업데이트된 UserStatus
export type UserStatus = {
  // ... 기존 필드 ...
  openOrders: ServerOrder[];
};

// 새 API 함수

export function placeOrder(input: {
  telegramUserId: number;
  symbol: string;
  orderType: 'limit' | 'stop_loss' | 'take_profit';
  side: 'long' | 'short';
  size: number;
  leverage: number;
  triggerPrice: number;
  positionId?: string;
}): Promise<{ ok: true; orderId: string; status: 'pending' }> {
  return request('/api/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchOrders(telegramUserId: number): Promise<{ orders: ServerOrder[] }> {
  return request('/api/orders', { query: { telegramUserId } });
}

export function cancelOrder(orderId: string, telegramUserId: number): Promise<{ ok: true }> {
  return request(`/api/orders/${orderId}`, {
    method: 'DELETE',
    body: JSON.stringify({ telegramUserId }),
  });
}

export function cancelAllOrders(telegramUserId: number): Promise<{ ok: true; cancelled: number }> {
  return request('/api/orders/all', {
    method: 'DELETE',
    query: { telegramUserId },
  });
}

export function fetchOrderHistory(telegramUserId: number): Promise<{ orders: Order[] }> {
  return request('/api/orders/history', { query: { telegramUserId } });
}

export function closePartial(input: {
  telegramUserId: number;
  positionId: string;
  closePct: 25 | 50 | 75 | 100;
  fallbackPrice: number;
}): Promise<{ ok: true; pnl: number; newSize: number; newBalance: number }> {
  return request('/api/trade/close-partial', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setSlTp(input: {
  telegramUserId: number;
  positionId: string;
  slPrice?: number | null;
  tpPrice?: number | null;
}): Promise<{ ok: true }> {
  return request('/api/positions/sl-tp', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setMarginMode(input: {
  telegramUserId: number;
  positionId: string;
  marginMode: 'isolated' | 'cross';
}): Promise<{ ok: true; marginMode: 'isolated' | 'cross' }> {
  return request('/api/positions/margin-mode', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// 기존 openTrade 확장
export function openTrade(input: OpenTradeInput & {
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  slPrice?: number | null;
  tpPrice?: number | null;
}): Promise<OpenTradeResult> {
  return request<OpenTradeResult>('/api/trade/open', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

---

## 5. Component Hierarchy & Props (Frontend)

### 5.1 ActionPanel 확장

```typescript
// web/src/components/ActionPanel.tsx

type ActionPanelProps = {
  position: Position | null;
  markPrice: number | null;
  direction?: Direction;
  balance: number;
  pending?: boolean;
  errorMessage?: string | null;
  disabled?: boolean;
  onOpen: (args: {
    side: Side;
    size: number;
    leverage: number;
    orderType?: 'market' | 'limit';
    limitPrice?: number;
    slPrice?: number | null;
    tpPrice?: number | null;
  }) => void;
  onClose: () => void;
  // Stage 17 추가:
  orderType: 'market' | 'limit' | 'stop_loss';
  onOrderTypeChange: (type: 'market' | 'limit' | 'stop_loss') => void;
  limitPrice: number | null;
  onLimitPriceChange: (price: number | null) => void;
  slPrice: number | null;
  tpPrice: number | null;
  onSlTpChange: (args: { slPrice?: number | null; tpPrice?: number | null }) => void;
  onCloseFraction: (pct: 0.25 | 0.5 | 0.75 | 1) => void;
  marginMode: 'isolated' | 'cross';
  onMarginModeChange: (mode: 'isolated' | 'cross') => void;
};
```

### 5.2 새 컴포넌트

```
OrderTypeTabs.tsx
├─ 3개 탭: Market | Limit | Stop
└─ Props: activeType, onChange

LimitPriceInput.tsx
├─ 지정가 입력 박스
└─ Props: value, onChange, markPrice (참고용)

SlTpInputs.tsx
├─ 2개 input: TP / SL
└─ Props: slPrice, tpPrice, onSlTpChange, markPrice

OpenOrdersCard.tsx
├─ 미체결 주문 목록 (테이블 형태)
├─ 주문별 [취소] 버튼
└─ Props: orders, onCancelOrder, symbol

OrderHistorySection.tsx
├─ 체결/취소된 주문 내역
└─ Props: orders, symbol

PartialCloseControls.tsx
├─ 4개 버튼: [25%] [50%] [75%] [100%]
├─ loading/error 상태
└─ Props: positionSize, balance, onClose, pending, error

MarginModeChip.tsx
├─ Isolated | Cross 토글 (UI 전용 단계 1)
└─ Props: mode, onChange, disabled

TimeframeRow.tsx
├─ 6개 버튼: 1m | 5m | 15m | 1h | 4h | 1d
└─ Props: activeFrame, onChange

IndicatorToggles.tsx
├─ 2개 토글: MA20, Volume
└─ Props: indicators, onChange
```

### 5.3 상태 흐름 다이어그램 (TradeTab)

```
TradeTab state:
  - symbol (CoinSelector 토글)
  - orderType: 'market' | 'limit' | 'stop_loss'
  - limitPrice: number | null
  - slPrice: number | null
  - tpPrice: number | null
  - marginMode: 'isolated' | 'cross'
  - timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  - indicators: { ma20: boolean; volume: boolean }
  - openOrders: ServerOrder[]
  - positionForPanel: Position | null (현재 symbol 의 open position)

Limit 주문 흐름:
  1. User: OrderTypeTabs → [Limit] 클릭
  2. State: orderType = 'limit'
  3. UI: LimitPriceInput 표시
  4. User: limitPrice 입력 → [LONG] 클릭
  5. API: POST /api/orders { symbol, side, size, leverage, limitPrice }
  6. Server: orders insert { status: 'pending' }
  7. Server tick: orderMatcher 검사 (markPrice <= limitPrice 도달 시)
  8. Server: openPosition RPC 호출 → positions insert
  9. order.status = 'filled'
  10. Polling (유저): /api/user/status → openOrders 행 사라짐, positionForPanel 등장

부분 청산:
  1. PositionCard 렌더 (status='open')
  2. PartialCloseControls: [25%] [50%] [75%] [100%]
  3. User: [25%] 클릭
  4. API: POST /api/trade/close-partial { positionId, closePct: 25 }
  5. Server RPC: close_position_partial → size 75%, wallet += pnl
  6. Polling: /api/user/status → position.size = 새로운 75%
  7. UI: PositionCard size 업데이트, pnl 누적

SL/TP 자동 트리거:
  1. User: ActionPanel → SlTpInputs 입력 (또는 PositionCard 수정)
  2. API: POST /api/positions/sl-tp { slPrice, tpPrice }
  3. Server: positions 행 업데이트
  4. Server tick: scanAndLiquidate 다음 orderMatcher
  5. orderMatcher: positions.sl_price/tp_price 검사
  6. Mark price 도달 시: closePosition RPC 호출
  7. position.status = 'closed'
  8. Polling: /api/user/status → position = null
```

---

## 6. Phase 분할 & 검증 게이트

### Phase F: Limit Order + History (3일)

**Deliverables**:
- Migration 12 (orders 테이블)
- Migration 13 (positions sl_price/tp_price 추가)
- `bot/src/engine/orderMatcher.ts` 전체
- 5개 API: POST /orders, GET /orders, DELETE /orders/:id, DELETE /orders/all, GET /orders/history
- `web/src/lib/api.ts` 업데이트 (Order 타입, placeOrder, cancelOrder, fetchOrders, fetchOrderHistory)
- ActionPanel: OrderTypeTabs, LimitPriceInput, OpenOrdersCard, OrderHistorySection
- Playwright: Limit 주문 1건 → pending 표시 → mark price 도달 시뮬 → filled → positionCard 표시

**검증**:
```bash
$ tsc --noEmit
$ npm run build
$ npm run lint
$ npm run test:e2e -- limit-order.spec.ts
```

**Manual Acceptance (대표님)**:
- [ ] TradeTab 진입 → symbol=BTC → orderType [Market] [Limit] 탭 전환 가능
- [ ] Limit 탭 → limitPrice=$50,000 입력 → [LONG] 클릭 → 로딩 → 성공 팝업
- [ ] PortfolioTab → OrderHistorySection → 새로운 limit 주문 "pending" 상태 표시
- [ ] 현재 mark price < limit price 상황에서 주문 유지, 역 상황 시뮬 후 자동 체결 확인 (로컬 마크 가격 하락 시뮬로)
- [ ] 미체결 주문 [취소] → 상태 cancelled 로 변경 확인

---

### Phase G: Partial Close + Margin Mode (2일)

**Deliverables**:
- Migration 14 (close_position_partial RPC)
- TradingEngine.closePartial() 메서드
- 3개 API: POST /trade/close-partial, POST /positions/sl-tp, POST /positions/margin-mode
- PartialCloseControls, MarginModeChip 컴포넌트
- ActionPanel 프롭 확장

**검증**:
```bash
$ tsc --noEmit
$ npm run build
$ npm run test:e2e -- partial-close.spec.ts
```

**Manual Acceptance**:
- [ ] TradeTab → open position 존재 → PartialCloseControls 렌더
- [ ] [25%] 클릭 → 로딩 → success → position.size = 75% 표시 확인
- [ ] wallet balance 증가 확인 (pnl 포함)
- [ ] [100%] 클릭 → position 완전 청산 → PositionCard 사라짐
- [ ] MarginModeChip: Isolated → Cross 토글 (UI 상태만, 로직 미변경)

---

### Phase H: Enhanced Charts + Depth + Indicators (2일)

**Deliverables**:
- TimeframeRow 컴포넌트 (1m/5m/15m/1h/4h/1d)
- IndicatorToggles 컴포넌트 (MA20, Volume)
- OrderBook 5단 → 10단 (+ depth bar visual)
- RecentTrades 큰 체결 강조 ($10K+ 체결 amber 박스)
- TradingChart: `useBinanceFeed` interval 파라미터 활성화

**검증**:
```bash
$ tsc --noEmit
$ npm run build
$ npm run test:e2e -- chart-timeframe.spec.ts
```

**Manual Acceptance**:
- [ ] TimeframeRow: 1m → 5m → 15m 클릭 시 차트 재로드
- [ ] IndicatorToggles: [MA20] 토글 → 차트에 MA20 선 표시/숨김
- [ ] OrderBook: 호가 10행 표시 (기존 5행 대비 2배)
- [ ] RecentTrades: $10,000 이상 거래 amber 배경 강조
- [ ] 차트 높이/스크롤: pb-[150px] 하단 여백으로 버튼 안 잘림 확인

---

## 7. 충돌·오류 방지 체크리스트

### GOTCHAS Stage 15.8+ 회귀 방지

- **MUST** PartialCloseControls, OpenOrdersCard, OrderHistorySection 모두 `space-y-3` 또는 `space-y-4` 로 스택
- **MUST NOT** `max-h-[300px]` 같은 고정 높이 스크롤 → 모바일에서 뷰포트 침해
- **MUST** OrderBook/RecentTrades 모두 `rows={10}` compact 모드 (`text-[9px]`, `py-[2px]`)
- **MUST** numeric string → Number() 캐스트 명시 (supabase-js 는 numeric 을 string 반환)
- **MUST** i18n 키 전체 6개 locale 추가:
  - `orderType.market`, `orderType.limit`, `orderType.stop_loss`
  - `orders.open`, `orders.history`, `orders.cancelled`
  - `partialClose.title`, `partialClose.pct25`, `partialClose.pct50`, `partialClose.pct75`, `partialClose.pct100`
  - `marginMode.isolated`, `marginMode.cross`
  - `timeframe.1m`, `timeframe.5m`, ... `timeframe.1d`
  - `indicators.ma20`, `indicators.volume`

### Atomic RPC 경계

- **MUST** Limit 주문 체결 시 orders.status=filled + positions insert 한 RPC 안에서 동시 실행
- **MUST NOT** orderMatcher 에서 직접 wallet 차감 — 항상 TradingEngine.openPosition() RPC 호출만
- **MUST NOT** close_position_partial 호출 후 별도 SL/TP order update — RPC 안에서 `UPDATE orders SET status='expired'` 처리

### Backwards Compatibility

- **MUST** POST /api/trade/open 기존 호출자 (현재 ActionPanel 시장가 진입) 깨지 않게
  - orderType, limitPrice, slPrice, tpPrice 모두 optional
  - 미전달 시 기본값: orderType='market', limitPrice=null, slPrice=null, tpPrice=null
  - 기존 호출문 수정 불필요

---

## 8. 의사 결정 태그 (DECISION)

- **[DECISION]** orderMatcher tick interval: 각 symbol 의 1분봉 tick 마다 (priceCache 'tick' 이벤트) 실행. 실시간성과 리소스 트레이드오프.
- **[DECISION]** SL/TP 주문은 별도 `orders` 행이 아니라 `positions.sl_price/tp_price` 컬럼과 **이중 관리** — orderMatcher 에서 position 참조로 검사, orders 테이블에도 audit log 기록. 부분 청산 후 기존 SL/TP 는 orders.status='expired' 로 표시.
- **[DECISION]** Cross 마진 토글: UI 컴포넌트만 (MarginModeChip), 실제 로직은 isolated 유지. Stage 18 에서 RLS 정책 + 계산식 추가 예정.
- **[DECISION]** Limit 주문 만료: 사용자 수동 취소만. 시간 기반 자동 만료 없음 (v1 단순화).

---

## 9. Out of Scope (v1)

- Hedge mode (양방향 포지션 동시 진입)
- Trailing stop (동적 손절가)
- Post-only / IOC / FOK 고급 주문 타입
- Index vs Last price 분리 (Mark price 통일 유지)
- Cross 마진 진짜 구현 (shared margin pool, liquidation 재계산)
- Drawing tools (Trend line, Fibonacci)
- Technical indicators (RSI, MACD, Bollinger Bands) — MA20/Volume 만
- Funding rate 정산 (Funding rate display 만)
- 거래 수수료 분리 (거래 크기에 포함된 상태 유지)
- SL/TP 드래그 조정 (입력창 수정만)
- 가격 변동 알림 (모바일 푸시)
- Position 병합/분할 기능

---

## Appendix: TypeScript Type Definitions

```typescript
// bot/src/db/types.ts 추가

export type OrderType = 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'triggered' | 'expired';

export interface OrderRow {
  id: string;
  user_id: string;
  symbol: string;
  type: OrderType;
  side: PositionSide;
  price: string;  // numeric → string
  size: number;
  leverage: number;
  position_id: string | null;
  status: OrderStatus;
  created_at: string;
  filled_at: string | null;
  cancelled_at: string | null;
  triggered_at: string | null;
}

export interface OrderInsert {
  user_id: string;
  symbol: string;
  type: OrderType;
  side: PositionSide;
  price: number;
  size: number;
  leverage: number;
  position_id?: string | null;
  status?: OrderStatus;
}

// PositionRow 확장
export interface PositionRow {
  // ... 기존 필드 ...
  sl_price: string | null;  // numeric → string
  tp_price: string | null;
  margin_mode: 'isolated' | 'cross';
  realized_pnl_total: number;
}
```

---

## 검증 완료

- 코드 구현 절대 시작 X
- DB 스키마: 실제 SQL 스니펫 3개 마이그레이션 포함
- Backend: TradingEngine 메서드 시그니처 정확히 인용
- API: request/response 타입 모두 TypeScript 정의
- Frontend: Component props 계층 구조 명시
- Phase: 3 chunck, 각각 deliverable/검증 게이트 포함
- 충돌: GOTCHAS Stage 15.8 회귀 + Atomic RPC 경계 명시
- 호환성: 기존 openTrade 호출 깨지지 않음 확인
