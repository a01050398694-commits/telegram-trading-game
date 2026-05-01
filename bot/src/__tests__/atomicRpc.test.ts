import { describe, expect, it, vi } from 'vitest';
import { TradingEngine } from '../engine/trading.js';
import type { Db } from '../db/supabase.js';

// Phase L — Verifies the wrapper around the atomic Postgres RPCs.
// The FOR UPDATE / atomicity behaviour itself is enforced by Postgres and
// covered by migration 10. Here we lock down the wrapper contract:
//   1. Pre-RPC validation guards short-circuit before any DB call.
//   2. closePosition forwards exactly p_position_id / p_pnl / p_return_amount.
// This catches a developer accidentally renaming a parameter and silently
// drifting from the SQL function signature.

function makeOpenPositionDb(): Db {
  // checkLockMode → users.select.eq.single returns { data: null } so the guard returns early.
  const usersSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const usersEq = vi.fn().mockReturnValue({ single: usersSingle });
  const usersSelect = vi.fn().mockReturnValue({ eq: usersEq });

  const positionsSingle = vi
    .fn()
    .mockResolvedValue({ data: { id: 'pos-uuid', side: 'long' }, error: null });
  const positionsEq = vi.fn().mockReturnValue({ single: positionsSingle });
  const positionsSelect = vi.fn().mockReturnValue({ eq: positionsEq });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'users') return { select: usersSelect };
    if (table === 'positions') return { select: positionsSelect };
    throw new Error(`unexpected table: ${table}`);
  });

  const rpc = vi.fn().mockResolvedValue({ data: 'pos-uuid', error: null });

  return { from, rpc } as unknown as Db;
}

describe('openPosition validation guards', () => {
  it('throws when spot positions request leverage > 1 (before any DB call)', async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    const db = { from, rpc } as unknown as Db;
    const engine = new TradingEngine(db);

    await expect(
      engine.openPosition({
        userId: 'user-1',
        symbol: 'btcusdt',
        positionType: 'spot',
        side: 'long',
        size: 100,
        leverage: 5,
        markPrice: 60_000,
      }),
    ).rejects.toThrow('spot');

    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('throws when size is non-positive (before any DB call)', async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    const db = { from, rpc } as unknown as Db;
    const engine = new TradingEngine(db);

    await expect(
      engine.openPosition({
        userId: 'user-1',
        symbol: 'btcusdt',
        positionType: 'futures',
        side: 'long',
        size: 0,
        leverage: 10,
        markPrice: 60_000,
      }),
    ).rejects.toThrow('size');

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('openPosition RPC contract', () => {
  it('calls open_position_atomic with the full named-arg payload', async () => {
    const db = makeOpenPositionDb();
    const engine = new TradingEngine(db);

    await engine.openPosition({
      userId: 'user-uuid',
      symbol: 'btcusdt',
      positionType: 'futures',
      side: 'long',
      size: 1_000,
      leverage: 10,
      markPrice: 60_000,
    });

    const rpcCall = (db.rpc as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(rpcCall?.[0]).toBe('open_position_atomic');
    const args = rpcCall?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({
      p_user_id: 'user-uuid',
      p_symbol: 'btcusdt',
      p_position_type: 'futures',
      p_side: 'long',
      p_size: 1_000,
      p_leverage: 10,
      p_entry_price: 60_000,
    });
    expect(typeof args.p_liquidation_price).toBe('number');
  });
});

describe('closePosition RPC contract', () => {
  it('calls close_position_atomic with p_position_id / p_pnl / p_return_amount', async () => {
    const positionRow = {
      id: 'pos-uuid',
      side: 'long' as const,
      entry_price: '60000',
      size: 1_000,
      leverage: 10,
      status: 'open' as const,
    };

    const positionsSingle = vi.fn().mockResolvedValue({ data: positionRow, error: null });
    const positionsEqStatus = vi.fn().mockReturnValue({ single: positionsSingle });
    const positionsEqId = vi.fn().mockReturnValue({ eq: positionsEqStatus });
    const positionsSelect = vi.fn().mockReturnValue({ eq: positionsEqId });
    const from = vi.fn().mockReturnValue({ select: positionsSelect });

    const rpc = vi.fn().mockResolvedValue({ data: 1_500, error: null });
    const db = { from, rpc } as unknown as Db;
    const engine = new TradingEngine(db);

    const out = await engine.closePosition({ positionId: 'pos-uuid', markPrice: 66_000 });

    expect(rpc).toHaveBeenCalledWith(
      'close_position_atomic',
      expect.objectContaining({ p_position_id: 'pos-uuid' }),
    );
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(typeof args.p_pnl).toBe('number');
    expect(typeof args.p_return_amount).toBe('number');
    expect(out.newBalance).toBe(1_500);
  });
});
