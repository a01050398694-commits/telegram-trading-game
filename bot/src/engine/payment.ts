import type { Bot } from 'grammy';
import type { TradingEngine } from './trading.js';

// Stars 가격은 spec 15.3 에서 확정됨. USD 환율 변동 시 STARS_* 상수만 수정.
const PREMIUM_STARS = Number(process.env.PREMIUM_STARS || '3099');
const PREMIUM_USD = Number(process.env.PREMIUM_USD || '39.99');
const PREMIUM_PERIOD_SECONDS = 30 * 24 * 60 * 60;

// 지시서 §3.1 — Recharge $2.99 / $1,000 게임머니 / 1회성.
// $39.99 = 3099⭐ 환율 기준 (~77.5⭐/USD) → $2.99 ≈ 232⭐ → round 250.
const RECHARGE_STARS = Number(process.env.RECHARGE_STARS || '250');
const RECHARGE_USD = Number(process.env.RECHARGE_USD || '2.99');
const RECHARGE_CREDIT_USD = Number(process.env.RECHARGE_CREDIT_USD || '1000');

type PaymentPayload =
  | { type: 'premium'; userId: string; ts: number }
  | { type: 'recharge'; userId: string; ts: number };

function encodePayload(p: PaymentPayload): string {
  return JSON.stringify(p);
}

function decodePayload(raw: string): PaymentPayload | null {
  try {
    const parsed = JSON.parse(raw) as PaymentPayload;
    if (parsed.type !== 'premium' && parsed.type !== 'recharge') return null;
    if (typeof parsed.userId !== 'string' || parsed.userId.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Telegram Stars 가 currency 'XTR' 을 요구. provider_token 은 Stars 한정 빈 문자열.
export async function createPremiumInvoiceLink(bot: Bot, userId: string): Promise<string> {
  const payload = encodePayload({ type: 'premium', userId, ts: Date.now() });
  return bot.api.createInvoiceLink(
    'Premium Membership',
    '30-day access · advanced analytics · askbit community broadcasts · auto-renews monthly',
    payload,
    '',
    'XTR',
    [{ label: 'Premium 30d', amount: PREMIUM_STARS }],
    { subscription_period: PREMIUM_PERIOD_SECONDS },
  );
}

export async function createRechargeInvoiceLink(bot: Bot, userId: string): Promise<string> {
  const payload = encodePayload({ type: 'recharge', userId, ts: Date.now() });
  return bot.api.createInvoiceLink(
    'Risk Reset',
    `Restore $${RECHARGE_CREDIT_USD.toLocaleString('en-US')} game credit and unlock trading`,
    payload,
    '',
    'XTR',
    [{ label: 'Risk Reset', amount: RECHARGE_STARS }],
  );
}

type SuccessfulPaymentCtx = {
  msg?: {
    successful_payment?: {
      invoice_payload: string;
      telegram_payment_charge_id: string;
      total_amount: number;
      currency: string;
    };
  };
  from?: { id: number };
  reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown>;
};

async function safeReply(ctx: SuccessfulPaymentCtx, text: string): Promise<void> {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (replyErr) {
    console.error('[payment] reply failed:', replyErr);
  }
}

export async function handleSuccessfulPayment(
  engine: TradingEngine,
  ctx: SuccessfulPaymentCtx,
): Promise<void> {
  const sp = ctx.msg?.successful_payment;
  if (!sp) return;

  const payload = decodePayload(sp.invoice_payload);
  if (!payload) {
    console.error('[payment] invalid payload — discarding');
    return;
  }

  // 방어 코드: Telegram 발신자 = payload.userId 교차검증.
  // Telegram API 가 메시지 출처를 보증하지만, payload 구조가 미래에 바뀌어도
  // 사칭이 통하지 않도록 명시적 검증을 둔다.
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    console.error('[payment] missing ctx.from — discarding');
    return;
  }
  const sender = await engine.getUserByTelegramId(telegramId);
  if (!sender || sender.id !== payload.userId) {
    console.error('[payment] sender/payload userId mismatch — discarding');
    return;
  }

  const chargeId = sp.telegram_payment_charge_id;

  try {
    if (payload.type === 'premium') {
      const result = await engine.activatePremium(payload.userId, chargeId, sp.total_amount, PREMIUM_USD);
      await safeReply(
        ctx,
        `✅ Premium activated.\n\nValid until: ${new Date(result.premiumUntil).toUTCString()}\nAuto-renews every 30 days.`,
      );
      return;
    }

    if (payload.type === 'recharge') {
      const result = await engine.creditRecharge(
        payload.userId,
        chargeId,
        sp.total_amount,
        RECHARGE_USD,
        RECHARGE_CREDIT_USD,
      );
      await safeReply(
        ctx,
        `✅ Recharge complete.\n\n+$${RECHARGE_CREDIT_USD.toLocaleString('en-US')} game credit\nNew balance: $${result.balance.toLocaleString('en-US')}`,
      );
      return;
    }
  } catch (err) {
    const msg = (err as Error).message ?? 'unknown';
    if (msg.includes('already_processed')) return;
    console.error('[payment] handleSuccessfulPayment error:', err);
    await safeReply(
      ctx,
      '⚠️ Payment received but activation failed. Our team has been notified — please retry or contact support.',
    );
  }
}

export const PAYMENT_PRICING = {
  premium: { stars: PREMIUM_STARS, usd: PREMIUM_USD, periodSec: PREMIUM_PERIOD_SECONDS },
  recharge: { stars: RECHARGE_STARS, usd: RECHARGE_USD, creditUsd: RECHARGE_CREDIT_USD },
} as const;
