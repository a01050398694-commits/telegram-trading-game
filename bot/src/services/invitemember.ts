import type { Bot } from 'grammy';
import { env } from '../env.js';

// InviteMember 연동 서비스 (Stage 15.1 정리).
//
// InviteMember = 서드파티 Telegram 봇 결제/구독 SaaS.
// 우리 코드는 결제 자체에 관여하지 않고, InviteMember 가 결제 후 사용자를
// 자동으로 Premium 채널에 초대하면, 우리는 `checkSubscriber` 로
// `getChatMember` 호출해서 멤버 = 구독자로 판정한다.
//
// Stage 15.2 에서 PREMIUM_CHANNEL_ID / RECHARGE_CHANNEL_ID 환경변수로 분리 예정.

const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_TTL_MS = 60 * 1000;

type CacheEntry = { isSubscriber: boolean; expiresAt: number };
const subscriberCache = new Map<number, CacheEntry>();

export type SubscriberStatus = {
  isSubscriber: boolean;
  source: 'premium_chat' | 'disabled' | 'error';
};

export async function checkSubscriber(
  bot: Bot,
  telegramUserId: number,
): Promise<SubscriberStatus> {
  if (!env.PREMIUM_CHAT_ID) {
    return { isSubscriber: false, source: 'disabled' };
  }

  const now = Date.now();
  const cached = subscriberCache.get(telegramUserId);
  if (cached && cached.expiresAt > now) {
    return { isSubscriber: cached.isSubscriber, source: 'premium_chat' };
  }

  try {
    const member = await bot.api.getChatMember(env.PREMIUM_CHAT_ID, telegramUserId);
    // 'restricted' 도 유효 멤버로 간주 (slow mode 등에 의한 제한일 수 있음).
    const isSubscriber = ['member', 'creator', 'administrator', 'restricted'].includes(
      member.status,
    );
    subscriberCache.set(telegramUserId, {
      isSubscriber,
      expiresAt: now + CACHE_TTL_MS,
    });
    return { isSubscriber, source: 'premium_chat' };
  } catch (err) {
    // 'user not found in chat' 은 Telegram 에서 400 으로 온다 → 비구독자로 처리.
    const message = (err as Error).message || '';
    if (/not found|member list is inaccessible/i.test(message)) {
      subscriberCache.set(telegramUserId, {
        isSubscriber: false,
        expiresAt: now + CACHE_TTL_MS,
      });
      return { isSubscriber: false, source: 'premium_chat' };
    }
    console.error(`[invitemember] getChatMember failed for ${telegramUserId}:`, message);
    subscriberCache.set(telegramUserId, {
      isSubscriber: false,
      expiresAt: now + ERROR_TTL_MS,
    });
    return { isSubscriber: false, source: 'error' };
  }
}

export function invalidateSubscriberCache(telegramUserId: number): void {
  subscriberCache.delete(telegramUserId);
}
