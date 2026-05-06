/**
 * Stage 21 — Telegram Stars Native Invoice service.
 *
 * Why a separate flow next to InviteMember:
 *   · InviteMember opens an external in-app browser → user leaves the mini app UI.
 *   · Native `tg.openInvoice` shows a Telegram-rendered popup ON TOP of the mini app
 *     → no browser jump, instant balance refresh after callback('paid').
 *   · PayPal cannot work inside the mini app WebView (cross-origin SDK lockdown), so
 *     PayPal stays on InviteMember; only Stars goes native.
 *
 * Flow:
 *   1. Frontend POST /api/invoice/create { plan }  → server returns invoiceLink (t.me/$...)
 *   2. Frontend tg.openInvoice(link, callback)      → Telegram renders native popup
 *   3. User confirms → Telegram fires `pre_checkout_query` to bot
 *      → bot answers ok=true (handlers/starsPayments.ts)
 *   4. Telegram fires `message.successful_payment` to bot
 *      → bot parses payload, calls activatePremium / creditRecharge (idempotent)
 *      → DM confirmation to user
 *   5. Frontend callback('paid') → poll /api/user/status → balance/premium reflected
 *
 * Payload format: "<plan>:<userId>:<nonce>" (≤128 bytes per Telegram spec).
 *   · plan determines which engine method to call.
 *   · userId = internal users.id (UUID) — payer-aware credit (no IDOR via spoofed payload
 *     because chargeId guards idempotency, and userId is server-injected, never client).
 *   · nonce = base36(Date.now()) — only to make payload unique across rapid retries.
 *
 * Idempotency: telegram_payment_charge_id is unique per Telegram payment. activatePremium
 *   and creditRecharge already enforce a UNIQUE constraint on chargeId, so duplicate
 *   `successful_payment` updates (e.g. Telegram retry) become silent no-ops.
 */

import type { Bot } from 'grammy';

export type StarsPlan = 'premium' | 'recharge_1k' | 'recharge_5k' | 'recharge_10k';

const STARS_PLANS: ReadonlyArray<StarsPlan> = [
  'premium',
  'recharge_1k',
  'recharge_5k',
  'recharge_10k',
];

export function isStarsPlan(value: string): value is StarsPlan {
  return (STARS_PLANS as ReadonlyArray<string>).includes(value);
}

export interface PlanSpec {
  title: string;
  description: string;
  amountStars: number;
  priceUsd: number;
  /** Recharge plans only — game-credit USD added to wallet on successful_payment. */
  creditUsd?: number;
}

// Why these defaults:
//   · Telegram's published Stars rate hovers around 1 XTR ≈ $0.013, so $39.99 ≈ 3000 XTR
//     would be exact. We discount slightly (2500 XTR ≈ $32) so Stars users feel a small
//     bonus for staying inside Telegram. Operator can override per-plan via env without
//     redeploy.
//   · Recharge defaults follow the same gentle discount.
function readStarsPrice(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.warn(`[starsInvoice] invalid ${envKey}=${raw}, falling back to ${fallback}`);
    return fallback;
  }
  return n;
}

export function getPlanSpec(plan: StarsPlan): PlanSpec {
  switch (plan) {
    case 'premium':
      return {
        title: 'VIP Premium · 30 days',
        description:
          'Hourly buckets · Leverage analytics · Behavior insights · Weekly report · VIP room.',
        amountStars: readStarsPrice('STARS_PRICE_PREMIUM', 2500),
        priceUsd: 39.99,
      };
    case 'recharge_1k':
      return {
        title: '+$1,000 Game Credit',
        description: 'Add $1,000 paper-trading balance instantly.',
        amountStars: readStarsPrice('STARS_PRICE_RECHARGE_1K', 200),
        priceUsd: 2.99,
        creditUsd: 1000,
      };
    case 'recharge_5k':
      return {
        title: '+$5,000 Game Credit',
        description: 'Add $5,000 paper-trading balance — best value.',
        amountStars: readStarsPrice('STARS_PRICE_RECHARGE_5K', 500),
        priceUsd: 7.99,
        creditUsd: 5000,
      };
    case 'recharge_10k':
      return {
        title: '+$10,000 Game Credit',
        description: 'Add $10,000 paper-trading balance.',
        amountStars: readStarsPrice('STARS_PRICE_RECHARGE_10K', 850),
        priceUsd: 13.99,
        creditUsd: 10000,
      };
  }
}

const PAYLOAD_PREFIX = 'tgs1';
// Why a prefix: future protocol version bumps (tgs2, etc.) survive replay of old links
// without us mistaking them for current-format payloads.

export function buildPayload(plan: StarsPlan, userId: string): string {
  const nonce = Date.now().toString(36);
  const payload = `${PAYLOAD_PREFIX}:${plan}:${userId}:${nonce}`;
  // 128-byte Telegram limit guard — UUID(36) + plan(<=12) + prefix + nonce(<=8) ≈ 60 bytes.
  if (Buffer.byteLength(payload, 'utf8') > 128) {
    throw new Error(`buildPayload: payload exceeds 128 bytes (${payload.length})`);
  }
  return payload;
}

export interface ParsedPayload {
  plan: StarsPlan;
  userId: string;
}

export function parsePayload(raw: string): ParsedPayload | null {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split(':');
  if (parts.length !== 4) return null;
  const [prefix, plan, userId, nonce] = parts;
  if (prefix !== PAYLOAD_PREFIX) return null;
  if (!plan || !isStarsPlan(plan)) return null;
  if (!userId || userId.length < 8) return null;
  // nonce is informational only; we just verify it exists so malformed payloads don't slip.
  if (!nonce) return null;
  return { plan, userId };
}

export async function createStarsInvoiceLink(args: {
  bot: Bot;
  plan: StarsPlan;
  userId: string;
}): Promise<{ invoiceLink: string; spec: PlanSpec }> {
  const spec = getPlanSpec(args.plan);
  const payload = buildPayload(args.plan, args.userId);

  // provider_token = '' is mandatory for Telegram Stars (XTR). currency must be 'XTR'.
  // grammy 1.x exposes positional args (title, description, payload, provider_token,
  // currency, prices, other?). We deliberately avoid subscription_period (recurring
  // billing) — current product is a flat 30-day premium grant managed in our DB, not
  // a Telegram-side recurring sub.
  const invoiceLink = await args.bot.api.createInvoiceLink(
    spec.title,
    spec.description,
    payload,
    '',
    'XTR',
    [{ label: spec.title, amount: spec.amountStars }],
  );

  return { invoiceLink, spec };
}
