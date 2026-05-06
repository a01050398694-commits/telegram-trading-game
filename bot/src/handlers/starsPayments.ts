/**
 * Stage 21 — Telegram Stars NATIVE payment handler.
 *
 * Two updates we listen for:
 *   1. `pre_checkout_query` — Telegram asks "is this order still valid?".
 *      Must answer within 10 seconds or the user sees a payment failure.
 *      We auto-approve (ok=true) since we generated the invoice ourselves and the
 *      payload is freshly signed; if the payload is malformed we return ok=false
 *      so Telegram refunds automatically.
 *
 *   2. `message:successful_payment` — Telegram has charged the user. Telegram itself
 *      handles the refund-on-failure path; if our handler throws, Telegram already
 *      took the Stars but our DB didn't update → we MUST log + Sentry-capture so
 *      operator can manually grant. Idempotency comes from telegram_payment_charge_id
 *      UNIQUE in subscription_txns / recharge_txns.
 *
 * IDOR guard: payload contains the internal users.id chosen by the server when the
 * invoice was created. The user opening the invoice cannot tamper with the payload
 * because Telegram signs the invoice link. We still re-verify that ctx.from.id maps
 * back to the same users.id before crediting — defense in depth.
 *
 * Cron interaction: InviteMember chat_member handler is independent. A user can
 * theoretically pay via both channels; idempotency is per-charge, so each payment
 * credits exactly once, and a user paying twice intentionally gets two periods/credits.
 */

import type { Bot, Context } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';
import { parsePayload, getPlanSpec, type StarsPlan } from '../services/starsInvoice.js';
import { Sentry } from '../lib/sentry.js';

export function setupStarsPayments(bot: Bot, engine: TradingEngine): void {
  // --- pre_checkout_query --------------------------------------------------
  bot.on('pre_checkout_query', async (ctx: Context) => {
    const query = ctx.preCheckoutQuery;
    if (!query) return;
    const parsed = parsePayload(query.invoice_payload);
    if (!parsed) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: 'Invoice payload invalid. Please retry from the app.',
      });
      console.error('[stars] pre_checkout: bad payload', query.invoice_payload);
      return;
    }
    // Verify payer telegram_id maps back to the userId the invoice was created for.
    const tgUserId = query.from.id;
    const dbUser = await engine.getUserByTelegramId(tgUserId).catch(() => null);
    if (!dbUser || dbUser.id !== parsed.userId) {
      await ctx.answerPreCheckoutQuery(false, {
        error_message: 'Account mismatch. Please reopen the app and retry.',
      });
      console.error(
        `[stars] pre_checkout: payer mismatch tg=${tgUserId} payload_user=${parsed.userId} db_user=${dbUser?.id ?? 'null'}`,
      );
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  // --- successful_payment --------------------------------------------------
  bot.on('message:successful_payment', async (ctx: Context) => {
    const payment = ctx.message?.successful_payment;
    if (!payment) return;
    const tgUserId = ctx.from?.id;
    if (!tgUserId) return;

    const parsed = parsePayload(payment.invoice_payload);
    if (!parsed) {
      console.error('[stars] successful_payment: bad payload', payment.invoice_payload);
      Sentry.captureException(new Error('stars_bad_payload_after_charge'), {
        tags: { handler: 'stars', step: 'parse_payload' },
        extra: { tgUserId, payment },
      });
      return;
    }

    const chargeId = payment.telegram_payment_charge_id;
    if (!chargeId) {
      console.error('[stars] successful_payment: missing charge_id');
      return;
    }

    // First gate: payment_events table dedupe across the whole app.
    // event_id format is unique per (source, charge_id) so retries are silent no-ops
    // even if Telegram redelivers the update.
    const eventId = `stars:${chargeId}`;
    try {
      const { inserted } = await engine.recordPaymentEvent({
        event_id: eventId,
        source: 'stars',
        chat_id: String(ctx.chat?.id ?? tgUserId),
        telegram_user_id: tgUserId,
        payload: payment as unknown as Record<string, unknown>,
      });
      if (!inserted) {
        return;
      }
    } catch (err) {
      console.error('[stars] recordPaymentEvent failed:', (err as Error).message);
      Sentry.captureException(err, {
        tags: { handler: 'stars', step: 'record_event' },
        extra: { tgUserId, chargeId },
      });
      return;
    }

    const spec = getPlanSpec(parsed.plan);
    const amountStars = payment.total_amount;

    try {
      if (parsed.plan === 'premium') {
        await handlePremium(bot, engine, parsed.userId, tgUserId, chargeId, amountStars, spec.priceUsd);
      } else {
        const creditUsd = spec.creditUsd ?? 0;
        if (creditUsd <= 0) {
          throw new Error(`plan ${parsed.plan} has no creditUsd`);
        }
        await handleRecharge(
          bot,
          engine,
          parsed.userId,
          tgUserId,
          chargeId,
          amountStars,
          spec.priceUsd,
          creditUsd,
        );
      }
    } catch (err) {
      const msg = (err as Error).message ?? '';
      // already_processed — the activatePremium/creditRecharge methods throw with this
      // prefix when the chargeId hits a UNIQUE-constraint duplicate. Silent return is
      // correct: the payment_events guard above already handled most cases, this is
      // belt-and-suspenders.
      if (msg.startsWith('already_processed')) return;
      console.error(`[stars] crediting failed plan=${parsed.plan} tg=${tgUserId}:`, msg);
      Sentry.captureException(err, {
        tags: { handler: 'stars', step: 'credit', plan: parsed.plan },
        extra: { tgUserId, chargeId, amountStars },
      });
    }
  });
}

async function handlePremium(
  bot: Bot,
  engine: TradingEngine,
  userId: string,
  tgUserId: number,
  chargeId: string,
  amountStars: number,
  priceUsd: number,
): Promise<void> {
  const { premiumUntil } = await engine.activatePremium(userId, chargeId, amountStars, priceUsd);
  console.log(
    `[stars] premium activated tg=${tgUserId} stars=${amountStars} until=${premiumUntil}`,
  );
  await bot.api
    .sendMessage(
      tgUserId,
      `✅ Premium activated. Access valid until ${premiumUntil.slice(0, 10)}.`,
    )
    .catch((dmErr) => {
      const reason = (dmErr as Error).message ?? String(dmErr);
      console.error(`[stars] premium DM failed tg=${tgUserId}:`, reason);
      Sentry.captureException(dmErr, {
        tags: { handler: 'stars', step: 'premium_dm' },
        extra: { tgUserId, chargeId },
      });
    });
}

async function handleRecharge(
  bot: Bot,
  engine: TradingEngine,
  userId: string,
  tgUserId: number,
  chargeId: string,
  amountStars: number,
  priceUsd: number,
  creditUsd: number,
): Promise<void> {
  const { balance } = await engine.creditRecharge(
    userId,
    chargeId,
    amountStars,
    priceUsd,
    creditUsd,
  );
  console.log(
    `[stars] recharge credited tg=${tgUserId} stars=${amountStars} credit=$${creditUsd} new_balance=${balance}`,
  );
  await bot.api
    .sendMessage(
      tgUserId,
      `✅ +$${creditUsd.toLocaleString('en-US')} game credit added. New balance: $${Number(balance).toLocaleString('en-US')}.`,
    )
    .catch((dmErr) => {
      const reason = (dmErr as Error).message ?? String(dmErr);
      console.error(`[stars] recharge DM failed tg=${tgUserId}:`, reason);
      Sentry.captureException(dmErr, {
        tags: { handler: 'stars', step: 'recharge_dm' },
        extra: { tgUserId, chargeId, creditUsd, balance },
      });
    });
}

// Type re-export keeps callers from importing both modules.
export type { StarsPlan };
