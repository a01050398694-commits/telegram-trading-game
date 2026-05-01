import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupInviteMemberSync } from '../handlers/inviteMemberSync.js';
import type { Bot, Context } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';

// Phase L — Idempotency guard at the chat_member entry point.
//
// Scenario: Telegram occasionally re-delivers a chat_member event (network retry,
// bot reconnect). Without a guard, a single payment would credit the user twice.
//
// The guard chain:
//   1. handler computes deterministic event_id from chat_id + telegram_user_id + update.date
//   2. recordPaymentEvent() upserts with ON CONFLICT (event_id) DO NOTHING
//   3. If inserted=false (duplicate) the handler returns silently — no credit, no premium activation

// Capture the handler the bot would otherwise install on the network event loop.
function makeBot() {
  const handlers = new Map<string, (ctx: Context) => Promise<void>>();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const banChatMember = vi.fn().mockResolvedValue(undefined);
  const unbanChatMember = vi.fn().mockResolvedValue(undefined);
  const bot = {
    on: vi.fn((event: string, handler: (ctx: Context) => Promise<void>) => {
      handlers.set(event, handler);
    }),
    api: { sendMessage, banChatMember, unbanChatMember },
  };
  return { bot, handlers, sendMessage, banChatMember, unbanChatMember };
}

function makeEngine() {
  return {
    recordPaymentEvent: vi.fn(),
    upsertUser: vi.fn(),
    activatePremium: vi.fn(),
    creditRecharge: vi.fn(),
  };
}

const PREMIUM_CHAT_ID = '-1001000000000';
const RECHARGE_5K_CHAT_ID = '-1001000000002';

function makeJoinUpdate(chatId: string, tgUserId: number, date: number): Context {
  return {
    chatMember: {
      chat: { id: Number(chatId) },
      new_chat_member: {
        status: 'member',
        user: { id: tgUserId, username: 'tester', first_name: 'Test' },
      },
      old_chat_member: { status: 'left' },
      date,
    },
  } as unknown as Context;
}

function makeLeaveUpdate(chatId: string, tgUserId: number, date: number): Context {
  return {
    chatMember: {
      chat: { id: Number(chatId) },
      new_chat_member: {
        status: 'left',
        user: { id: tgUserId, username: 'tester', first_name: 'Test' },
      },
      old_chat_member: { status: 'member' },
      date,
    },
  } as unknown as Context;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('inviteMemberSync — duplicate event guard', () => {
  it('credits premium once on first event, silently no-ops on duplicate', async () => {
    const { bot, handlers } = makeBot();
    const engine = makeEngine();

    engine.recordPaymentEvent
      .mockResolvedValueOnce({ inserted: true })
      .mockResolvedValueOnce({ inserted: false });
    engine.upsertUser.mockResolvedValue({ user: { id: 'user-uuid' }, isNew: false });
    engine.activatePremium.mockResolvedValue({ premiumUntil: '2026-06-01' });

    setupInviteMemberSync(bot as unknown as Bot, engine as unknown as TradingEngine);
    const handler = handlers.get('chat_member')!;

    const update = makeJoinUpdate(PREMIUM_CHAT_ID, 7777, 1700000000);
    await handler(update);
    await handler(update);

    expect(engine.recordPaymentEvent).toHaveBeenCalledTimes(2);
    expect(engine.activatePremium).toHaveBeenCalledTimes(1);
    expect(engine.creditRecharge).not.toHaveBeenCalled();
  });

  it('credits recharge once, silently no-ops on duplicate, schedules kick only on first', async () => {
    const { bot, handlers, banChatMember } = makeBot();
    const engine = makeEngine();

    engine.recordPaymentEvent
      .mockResolvedValueOnce({ inserted: true })
      .mockResolvedValueOnce({ inserted: false });
    engine.upsertUser.mockResolvedValue({ user: { id: 'user-uuid' }, isNew: false });
    engine.creditRecharge.mockResolvedValue({ balance: 5_000 });

    setupInviteMemberSync(bot as unknown as Bot, engine as unknown as TradingEngine);
    const handler = handlers.get('chat_member')!;

    const update = makeJoinUpdate(RECHARGE_5K_CHAT_ID, 8888, 1700000001);
    await handler(update);
    await handler(update);

    expect(engine.creditRecharge).toHaveBeenCalledTimes(1);
    const args = engine.creditRecharge.mock.calls[0]!;
    expect(args[3]).toBe(7.99);
    expect(args[4]).toBe(5_000);

    // Auto-kick is scheduled only once (5 min) since duplicate is short-circuited.
    expect(banChatMember).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(banChatMember).toHaveBeenCalledTimes(1);
  });

  it('ignores chat_member updates for non-payment channels', async () => {
    const { bot, handlers } = makeBot();
    const engine = makeEngine();
    setupInviteMemberSync(bot as unknown as Bot, engine as unknown as TradingEngine);
    const handler = handlers.get('chat_member')!;

    const update = makeJoinUpdate('-9999999999', 9999, 1700000002);
    await handler(update);

    expect(engine.recordPaymentEvent).not.toHaveBeenCalled();
    expect(engine.activatePremium).not.toHaveBeenCalled();
    expect(engine.creditRecharge).not.toHaveBeenCalled();
  });

  it('ignores leave/kick transitions even on a payment channel', async () => {
    const { bot, handlers } = makeBot();
    const engine = makeEngine();
    setupInviteMemberSync(bot as unknown as Bot, engine as unknown as TradingEngine);
    const handler = handlers.get('chat_member')!;

    const update = makeLeaveUpdate(PREMIUM_CHAT_ID, 6666, 1700000003);
    await handler(update);

    expect(engine.recordPaymentEvent).not.toHaveBeenCalled();
  });

  it('produces a deterministic event_id from chat_id + tg_user + update.date', async () => {
    const { bot, handlers } = makeBot();
    const engine = makeEngine();

    engine.recordPaymentEvent.mockResolvedValue({ inserted: false });

    setupInviteMemberSync(bot as unknown as Bot, engine as unknown as TradingEngine);
    const handler = handlers.get('chat_member')!;

    await handler(makeJoinUpdate(PREMIUM_CHAT_ID, 5555, 1700009999));

    const payload = engine.recordPaymentEvent.mock.calls[0]?.[0] as { event_id: string };
    expect(payload.event_id).toBe(`invitemember:${PREMIUM_CHAT_ID}:5555:1700009999`);
  });
});
