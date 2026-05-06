import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPayload,
  parsePayload,
  isStarsPlan,
  getPlanSpec,
  createStarsInvoiceLink,
  type StarsPlan,
} from '../services/starsInvoice.js';

describe('starsInvoice — payload codec', () => {
  const userId = '00000000-0000-4000-8000-000000000001';

  it('round-trips premium plan', () => {
    const raw = buildPayload('premium', userId);
    const parsed = parsePayload(raw);
    expect(parsed).toEqual({ plan: 'premium', userId });
  });

  it('round-trips all recharge plans', () => {
    const plans: StarsPlan[] = ['recharge_1k', 'recharge_5k', 'recharge_10k'];
    for (const plan of plans) {
      const raw = buildPayload(plan, userId);
      const parsed = parsePayload(raw);
      expect(parsed?.plan).toBe(plan);
      expect(parsed?.userId).toBe(userId);
    }
  });

  it('rejects payloads from a different protocol prefix', () => {
    expect(parsePayload('xx:premium:abc:nonce')).toBeNull();
  });

  it('rejects payloads with wrong number of segments', () => {
    expect(parsePayload('tgs1:premium')).toBeNull();
    expect(parsePayload('tgs1:premium:user')).toBeNull();
    expect(parsePayload('tgs1:premium:user:nonce:extra')).toBeNull();
  });

  it('rejects unknown plan names', () => {
    expect(parsePayload('tgs1:rogue:abcdef12-3456:n')).toBeNull();
  });

  it('rejects empty string and non-strings', () => {
    expect(parsePayload('')).toBeNull();
    // @ts-expect-error — runtime guard for non-strings
    expect(parsePayload(null)).toBeNull();
    // @ts-expect-error — runtime guard for non-strings
    expect(parsePayload(123)).toBeNull();
  });

  it('rejects suspiciously short userIds (no half-spoofed UUIDs)', () => {
    expect(parsePayload('tgs1:premium:abc:n')).toBeNull();
  });

  it('produces unique payloads for repeated calls (nonce changes)', () => {
    const a = buildPayload('premium', userId);
    // Force at least 1ms gap.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const b = buildPayload('premium', userId);
        expect(a).not.toBe(b);
        resolve();
      }, 2);
    });
  });
});

describe('starsInvoice — plan spec', () => {
  beforeEach(() => {
    delete process.env.STARS_PRICE_PREMIUM;
    delete process.env.STARS_PRICE_RECHARGE_1K;
    delete process.env.STARS_PRICE_RECHARGE_5K;
    delete process.env.STARS_PRICE_RECHARGE_10K;
  });

  it('uses default Stars prices when env is unset', () => {
    expect(getPlanSpec('premium').amountStars).toBe(2500);
    expect(getPlanSpec('recharge_1k').amountStars).toBe(200);
    expect(getPlanSpec('recharge_5k').amountStars).toBe(500);
    expect(getPlanSpec('recharge_10k').amountStars).toBe(850);
  });

  it('honors valid env overrides', () => {
    process.env.STARS_PRICE_PREMIUM = '3000';
    process.env.STARS_PRICE_RECHARGE_1K = '180';
    expect(getPlanSpec('premium').amountStars).toBe(3000);
    expect(getPlanSpec('recharge_1k').amountStars).toBe(180);
  });

  it('falls back to default on bogus env (NaN, zero, negative)', () => {
    process.env.STARS_PRICE_PREMIUM = 'not-a-number';
    expect(getPlanSpec('premium').amountStars).toBe(2500);
    process.env.STARS_PRICE_PREMIUM = '0';
    expect(getPlanSpec('premium').amountStars).toBe(2500);
    process.env.STARS_PRICE_PREMIUM = '-100';
    expect(getPlanSpec('premium').amountStars).toBe(2500);
  });

  it('attaches creditUsd to recharge plans only', () => {
    expect(getPlanSpec('premium').creditUsd).toBeUndefined();
    expect(getPlanSpec('recharge_1k').creditUsd).toBe(1000);
    expect(getPlanSpec('recharge_5k').creditUsd).toBe(5000);
    expect(getPlanSpec('recharge_10k').creditUsd).toBe(10000);
  });

  it('isStarsPlan accepts only known plans', () => {
    expect(isStarsPlan('premium')).toBe(true);
    expect(isStarsPlan('recharge_1k')).toBe(true);
    expect(isStarsPlan('recharge_5k')).toBe(true);
    expect(isStarsPlan('recharge_10k')).toBe(true);
    expect(isStarsPlan('rogue')).toBe(false);
    expect(isStarsPlan('')).toBe(false);
  });

  it('all plan title + description are ASCII-only (Telegram requirement)', () => {
    const plans: StarsPlan[] = ['premium', 'recharge_1k', 'recharge_5k', 'recharge_10k'];
    // eslint-disable-next-line no-control-regex
    const asciiOnly = /^[\x20-\x7E]*$/;
    for (const plan of plans) {
      const spec = getPlanSpec(plan);
      expect(asciiOnly.test(spec.title), `${plan} title contains non-ASCII`).toBe(true);
      expect(asciiOnly.test(spec.description), `${plan} description contains non-ASCII`).toBe(true);
    }
  });
});

describe('starsInvoice — createStarsInvoiceLink', () => {
  it('passes correct positional args to grammy api.createInvoiceLink', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const createInvoiceLink = vi.fn().mockResolvedValue('https://t.me/$abc');
    const bot = { api: { createInvoiceLink } } as never;

    const result = await createStarsInvoiceLink({ bot, plan: 'premium', userId });
    expect(result.invoiceLink).toBe('https://t.me/$abc');
    expect(createInvoiceLink).toHaveBeenCalledTimes(1);
    const args = createInvoiceLink.mock.calls[0]!;
    expect(args[0]).toBe('VIP Premium 30 Days'); // title (ASCII only — see assertAsciiSafe)
    expect(typeof args[1]).toBe('string'); // description
    expect(typeof args[2]).toBe('string'); // payload
    expect(args[3]).toBe(''); // provider_token (empty = Stars)
    expect(args[4]).toBe('XTR'); // currency
    expect(Array.isArray(args[5])).toBe(true);
    expect(args[5][0].amount).toBeGreaterThan(0);
  });

  it('embeds the user id in the payload so it survives the round-trip', async () => {
    const userId = '12345678-1234-1234-1234-123456789abc';
    const createInvoiceLink = vi.fn().mockResolvedValue('https://t.me/$xyz');
    const bot = { api: { createInvoiceLink } } as never;

    await createStarsInvoiceLink({ bot, plan: 'recharge_5k', userId });
    const args = createInvoiceLink.mock.calls[0]!;
    const parsed = parsePayload(args[2]);
    expect(parsed).toEqual({ plan: 'recharge_5k', userId });
  });
});
