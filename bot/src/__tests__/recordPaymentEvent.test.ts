import { describe, expect, it, vi } from 'vitest';
import { TradingEngine } from '../engine/trading.js';
import type { Db } from '../db/supabase.js';

// Phase L — Idempotency guard for chat_member duplicates / InviteMember webhook retries.
// ON CONFLICT (event_id) DO NOTHING:
//   - Insert succeeds → data: [{id}] → inserted: true
//   - Conflict (duplicate event_id) → data: [] → inserted: false
// recordPaymentEvent translates that to a boolean the handler can branch on.

type UpsertOutcome = { data: { id: string }[] | null; error: { message: string } | null };

function makeMockDb(outcome: UpsertOutcome): Db {
  const select = vi.fn().mockResolvedValue(outcome);
  const upsert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ upsert });
  return { from } as unknown as Db;
}

const sample = {
  event_id: 'invitemember:abc:123:1700000000',
  source: 'invitemember',
  chat_id: 'abc',
  telegram_user_id: 123,
  payload: { foo: 'bar' },
};

describe('recordPaymentEvent', () => {
  it('returns inserted=true when supabase upsert reports a new row', async () => {
    const db = makeMockDb({ data: [{ id: 'uuid-1' }], error: null });
    const engine = new TradingEngine(db);
    const result = await engine.recordPaymentEvent(sample);
    expect(result.inserted).toBe(true);
  });

  it('returns inserted=false when ON CONFLICT DO NOTHING returned zero rows', async () => {
    const db = makeMockDb({ data: [], error: null });
    const engine = new TradingEngine(db);
    const result = await engine.recordPaymentEvent(sample);
    expect(result.inserted).toBe(false);
  });

  it('throws when supabase reports an error so handler can fall through', async () => {
    const db = makeMockDb({ data: null, error: { message: 'db down' } });
    const engine = new TradingEngine(db);
    await expect(engine.recordPaymentEvent(sample)).rejects.toThrow('recordPaymentEvent: db down');
  });

  it('targets payment_events table with onConflict=event_id and ignoreDuplicates=true', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'uuid-2' }], error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const db = { from } as unknown as Db;
    const engine = new TradingEngine(db);
    await engine.recordPaymentEvent(sample);
    expect(from).toHaveBeenCalledWith('payment_events');
    expect(upsert).toHaveBeenCalledWith(
      sample,
      expect.objectContaining({ onConflict: 'event_id', ignoreDuplicates: true }),
    );
    expect(select).toHaveBeenCalledWith('id');
  });
});
