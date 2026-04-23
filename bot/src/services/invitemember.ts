import type { Bot } from 'grammy';
import { env } from '../env.js';

// B-06 / B-13 — InviteMember 연동 서비스.
//
// InviteMember 는 서드파티 Telegram 봇 결제/구독 관리 서비스다.
// MVP 연동 범위:
//   1. 구독자 판별 — PREMIUM_CHAT_ID (InviteMember 가 관리하는 유료 채널) 의
//      getChatMember 상태를 확인해 'member' 이상이면 Premium 으로 판정.
//   2. Promo 코드 발급 — 레퍼럴 10명 마일스톤, 거래소 UID 승인 시 자동 발급.
//      InviteMember HTTP API 가 공식 공개되어 있지 않으므로 webhook / REST 가
//      확정되기 전까지는 환경변수 INVITEMEMBER_PROMO_POOL(쉼표 구분) 에서 순차 소비하는
//      구조로 둔다. 향후 공식 API 가 열리면 `issuePromoCode` 구현체만 갈아끼운다.

const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_TTL_MS = 60 * 1000;

type CacheEntry = { isSubscriber: boolean; expiresAt: number };
const subscriberCache = new Map<number, CacheEntry>();

// 로컬 개발 편의용 — Promo pool 을 메모리로 관리. 프로덕션 전환 시 DB 로 이관.
let promoPool: string[] = (process.env.INVITEMEMBER_PROMO_POOL || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

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

// B-13 — Promo code 자동 발급.
// 현재는 로컬 풀에서 순차 소비. 발급 실패(풀 소진) 시 null 반환 → 호출자가
// 관리자에게 알림.
export type PromoIssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'pool_empty' | 'not_configured' };

export function issuePromoCode(): PromoIssueResult {
  if (promoPool.length === 0) {
    if (!process.env.INVITEMEMBER_PROMO_POOL) {
      return { ok: false, reason: 'not_configured' };
    }
    return { ok: false, reason: 'pool_empty' };
  }
  const code = promoPool.shift()!;
  return { ok: true, code };
}

// 테스트용 — 풀 재주입.
export function __seedPromoPool(codes: string[]): void {
  promoPool = [...codes];
}
