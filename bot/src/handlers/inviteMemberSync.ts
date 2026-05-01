/**
 * Stage 15.5 — InviteMember 채널 가입 자동 처리.
 *
 * 흐름:
 *   1. 사용자가 InviteMember 결제 페이지에서 PayPal/Stars 결제
 *   2. InviteMember 가 plan 별로 매핑된 비공개 채널에 자동 초대:
 *      · Premium Monthly  → PREMIUM_CHANNEL_ID
 *      · Recharge $2.99   → RECHARGE_CHANNEL_1K_ID    (+$1,000)
 *      · Recharge $7.99   → RECHARGE_CHANNEL_5K_ID    (+$5,000)
 *      · Recharge $13.99  → RECHARGE_CHANNEL_10K_ID   (+$10,000)
 *   3. 텔레그램이 봇에게 chat_member update 전달
 *   4. 이 핸들러가 채널 ID 보고 credit 결정 → DB 반영 → Recharge 채널은 5분 후 ban+unban
 *
 * 왜 채널을 패키지 별로 분리하나:
 *   chat_member 이벤트에는 plan_id / 결제금액 정보가 없다. 채널 ID 가 유일한 식별자다.
 *   같은 채널에 모든 패키지를 쏘면 봇이 패키지 구분 못 해 모든 결제가 $1K 로만 적립됨.
 *
 * 멱등성:
 *   activatePremium / creditRecharge 모두 chargeId unique 제약으로 중복 방어.
 *   chargeId = `invitemember:${userId}:${Date.now()}` → 같은 시각 중복 트리거 silent no-op.
 *
 * IMPORTANT:
 *   · bot.start({ allowed_updates: ['chat_member', ...] }) 필요.
 *   · 봇은 모든 대상 채널에 administrator 권한 필요 (이벤트 수신 + ban/unban).
 */

import type { Bot, Context } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';
import { env } from '../env.js';
import { Sentry } from '../lib/sentry.js';

const KICK_DELAY_MS = 5 * 60 * 1000;

type RechargePackage = {
  creditUsd: number;
  priceUsd: number;
};

function buildRechargeMap(): Map<string, RechargePackage> {
  const map = new Map<string, RechargePackage>();
  if (env.RECHARGE_CHANNEL_1K_ID) {
    map.set(env.RECHARGE_CHANNEL_1K_ID, { creditUsd: 1000, priceUsd: 2.99 });
  }
  if (env.RECHARGE_CHANNEL_5K_ID) {
    map.set(env.RECHARGE_CHANNEL_5K_ID, { creditUsd: 5000, priceUsd: 7.99 });
  }
  if (env.RECHARGE_CHANNEL_10K_ID) {
    map.set(env.RECHARGE_CHANNEL_10K_ID, { creditUsd: 10000, priceUsd: 13.99 });
  }
  return map;
}

export function setupInviteMemberSync(bot: Bot, engine: TradingEngine): void {
  const rechargeMap = buildRechargeMap();

  bot.on('chat_member', async (ctx: Context) => {
    const update = ctx.chatMember;
    if (!update) return;

    const chatId = String(update.chat.id);
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const tgUserId = update.new_chat_member.user.id;
    const username = update.new_chat_member.user.username ?? null;
    const firstName = update.new_chat_member.user.first_name ?? null;

    const isJoin =
      ['member', 'restricted'].includes(newStatus) &&
      ['left', 'kicked'].includes(oldStatus);
    if (!isJoin) return;

    const isPremiumChannel = !!env.PREMIUM_CHANNEL_ID && chatId === env.PREMIUM_CHANNEL_ID;
    const rechargePackage = rechargeMap.get(chatId);
    if (!isPremiumChannel && !rechargePackage) return;

    try {
      // Stage 15.6 — Deterministic chargeId (event_id 로도 사용)
      // update.date 는 Unix timestamp 초 단위. Telegram retry 시에도 같은 값 반환.
      const eventTimestamp = update.date;
      const eventId = `invitemember:${chatId}:${tgUserId}:${eventTimestamp}`;
      const chargeId = eventId;

      // Stage 15.6 — Payment event 중복 방어 (1차 가드)
      // 같은 event_id 재수신 시 { inserted: false } → 즉시 return
      const { inserted } = await engine.recordPaymentEvent({
        event_id: eventId,
        source: 'invitemember',
        chat_id: chatId,
        telegram_user_id: tgUserId,
        payload: update as unknown as Record<string, unknown>,
      });

      if (!inserted) {
        // 이미 처리된 이벤트 → silent return
        return;
      }

      const { user } = await engine.upsertUser({
        telegram_id: tgUserId,
        username,
        first_name: firstName,
        language_code: null,
      });

      if (isPremiumChannel) {
        try {
          const { premiumUntil } = await engine.activatePremium(
            user.id,
            chargeId,
            0,
            39.99,
          );
          console.log(
            `[invitemember] premium activated tg=${tgUserId} until=${premiumUntil}`,
          );
          // DM 실패는 결제 자체에 영향 없음(잔고/Premium 은 이미 DB 반영). 단,
          // Telegram API 다운 / 사용자가 봇 차단 등은 운영자가 알아야 한다.
          await bot.api
            .sendMessage(
              tgUserId,
              `Premium activated. Access valid until ${premiumUntil}.`,
            )
            .catch((dmErr) => {
              const reason = (dmErr as Error).message ?? String(dmErr);
              console.error(`[invitemember] premium DM failed tg=${tgUserId}:`, reason);
              Sentry.captureException(dmErr, {
                tags: { handler: 'invitemember', step: 'premium_dm' },
                extra: { tgUserId },
              });
            });
        } catch (err) {
          const msg = (err as Error).message ?? '';
          if (msg.startsWith('already_processed')) return;
          console.error('[invitemember] activatePremium failed:', msg);
        }
        return;
      }

      // Recharge — 채널 ID → 패키지 매핑.
      if (!rechargePackage) return;
      const { creditUsd, priceUsd } = rechargePackage;

      try {
        const { balance } = await engine.creditRecharge(
          user.id,
          chargeId,
          0,
          priceUsd,
          creditUsd,
        );
        console.log(
          `[invitemember] recharge credited tg=${tgUserId} credit=$${creditUsd} new_balance=${balance}`,
        );
        await bot.api
          .sendMessage(
            tgUserId,
            `+$${creditUsd.toLocaleString('en-US')} game credit added. New balance: $${balance.toLocaleString('en-US')}.`,
          )
          .catch((dmErr) => {
            const reason = (dmErr as Error).message ?? String(dmErr);
            console.error(`[invitemember] recharge DM failed tg=${tgUserId}:`, reason);
            Sentry.captureException(dmErr, {
              tags: { handler: 'invitemember', step: 'recharge_dm' },
              extra: { tgUserId, creditUsd, balance },
            });
          });
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (msg.startsWith('already_processed')) return;
        console.error('[invitemember] creditRecharge failed:', msg);
        return;
      }

      // Recharge 채널은 일회성. 5분 후 ban → 즉시 unban → 다음 결제 시 재가입 가능.
      setTimeout(async () => {
        try {
          await bot.api.banChatMember(chatId, tgUserId);
          await bot.api.unbanChatMember(chatId, tgUserId);
          console.log(
            `[invitemember] recharge auto-kick complete tg=${tgUserId} chat=${chatId}`,
          );
        } catch (err) {
          console.error(
            '[invitemember] auto-kick failed:',
            (err as Error).message,
          );
        }
      }, KICK_DELAY_MS);
    } catch (err) {
      console.error('[invitemember] handler fatal:', (err as Error).message);
    }
  });
}
