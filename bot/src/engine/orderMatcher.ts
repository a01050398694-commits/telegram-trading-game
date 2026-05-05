import type { Db } from '../db/supabase.js';
import type { TradingEngine } from './trading.js';
import type { OrderRow, PositionRow, PositionSide } from '../db/types.js';

// Internal representation of a pending order for matching logic
interface PendingOrderMatch {
  id: string;
  userId: string;
  symbol: string;
  type: 'limit' | 'stop_loss' | 'take_profit';
  side: PositionSide;
  price: number;  // trigger/limit price (numeric converted to number)
  size: number;
  leverage: number;
  positionId: string | null;
  status: 'pending';
}

/**
 * OrderMatcher: Scans pending orders each tick and triggers fills based on mark price.
 * Called by the priceCache 'tick' event after scanAndLiquidate.
 *
 * Responsibilities:
 * - matchLimit: Detects when limit order should fill (price reached)
 * - matchStopOrder: Detects when SL/TP should trigger (condition met)
 * - checkStopTrigger: Helper to determine trigger condition for SL/TP
 */
export class OrderMatcher {
  constructor(
    private readonly db: Db,
    private readonly engine: TradingEngine,
  ) {}

  /**
   * Mark price tick check — called per symbol every minute.
   * Scans all pending orders and triggers filled/triggered conditions.
   *
   * Error isolation: Each order's matching is isolated so one failure
   * doesn't cascade to others.
   */
  async matchOrders(symbol: string, markPrice: number): Promise<void> {
    const { data: orders, error } = await this.db
      .from('orders')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'pending');

    if (error) {
      console.error(`[orderMatcher.matchOrders] query error:`, error.message);
      throw new Error(`matchOrders: ${error.message}`);
    }

    const pending = (orders ?? []) as OrderRow[];

    for (const order of pending) {
      try {
        if (order.type === 'limit') {
          await this.matchLimit(order, markPrice);
        } else {
          // stop_loss or take_profit
          await this.matchStopOrder(order, markPrice);
        }
      } catch (err) {
        // Log but continue — partial failures shouldn't block others
        console.error(`[orderMatcher] order ${order.id}:`, err);
      }
    }
  }

  private async matchLimit(order: OrderRow, markPrice: number): Promise<void> {
    // Convert numeric price string to number
    const limitPrice = Number(order.price);

    // Fill conditions: long reaches limit-price-or-below, short reaches limit-price-or-above
    const shouldFill =
      (order.side === 'long' && markPrice <= limitPrice) ||
      (order.side === 'short' && markPrice >= limitPrice);

    if (!shouldFill) return;

    // Attempt to fill by opening a position via the engine
    try {
      const pos = await this.engine.openPosition({
        userId: order.user_id,
        symbol: order.symbol,
        positionType: 'futures',
        side: order.side,
        size: order.size,
        leverage: order.leverage,
        markPrice,
        slPrice: null,
        tpPrice: null,
      });

      // Update order status to 'filled' and record filled_at timestamp
      await this.db
        .from('orders')
        .update({
          status: 'filled',
          filled_at: new Date().toISOString(),
          position_id: pos.id,
        })
        .eq('id', order.id);
    } catch (err) {
      // Order fill failed — distinguish between user-caused (expired) and system errors (cancelled)
      const msg = err instanceof Error ? err.message : String(err);
      const isUserOutOfFunds = /INSUFFICIENT_BALANCE|LIQUIDATED/.test(msg);
      const status = isUserOutOfFunds ? 'expired' : 'cancelled';

      await this.db
        .from('orders')
        .update({
          status,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      console.error(`[orderMatcher] limit order ${order.id} failed (${status}):`, msg);
      // Do NOT rethrow — next orders in the loop must still be matched
    }
  }

  private async matchStopOrder(order: OrderRow, markPrice: number): Promise<void> {
    // SL/TP orders must reference a position
    if (!order.position_id) {
      // Position reference missing — mark as expired
      await this.db
        .from('orders')
        .update({
          status: 'expired',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      return;
    }

    // Fetch the referenced position to check current state
    const { data: pos, error } = await this.db
      .from('positions')
      .select('*')
      .eq('id', order.position_id)
      .single();

    if (error || !pos) {
      // Position no longer exists — mark order as expired
      await this.db
        .from('orders')
        .update({ status: 'expired' })
        .eq('id', order.id);
      return;
    }

    // Check if trigger condition is met
    const shouldTrigger = this.checkStopTrigger(
      pos as PositionRow,
      order,
      markPrice,
    );
    if (!shouldTrigger) return;

    // Trigger: Close the position atomically
    try {
      await this.engine.closePosition({
        userId: order.user_id,
        positionId: order.position_id,
        markPrice,
      });

      // Mark order as triggered
      await this.db
        .from('orders')
        .update({
          status: 'triggered',
          triggered_at: new Date().toISOString(),
        })
        .eq('id', order.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Permanent errors (position not found, ownership violation) → expired
      // Transient errors (RPC failure) → cancelled (manual review possible)
      const isPermanent = /position not found|UNAUTHORIZED|status='open'|user_id/.test(msg);
      const status = isPermanent ? 'expired' : 'cancelled';
      await this.db
        .from('orders')
        .update({
          status,
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      console.error(`[orderMatcher] SL/TP trigger failed (${status}):`, msg);
    }
  }

  private checkStopTrigger(
    position: PositionRow,
    order: OrderRow,
    markPrice: number,
  ): boolean {
    const triggerPrice = Number(order.price);

    if (order.type === 'stop_loss') {
      // SL: Loss direction reached (long: price drops, short: price rises)
      return position.side === 'long'
        ? markPrice <= triggerPrice
        : markPrice >= triggerPrice;
    } else if (order.type === 'take_profit') {
      // TP: Profit direction reached (long: price rises, short: price drops)
      return position.side === 'long'
        ? markPrice >= triggerPrice
        : markPrice <= triggerPrice;
    }

    return false;
  }
}
