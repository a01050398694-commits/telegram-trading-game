import type { Bot } from 'grammy';
import { env } from '../env.js';

interface CacheEntry {
  isPremium: boolean;
  expiresAt: number;
}

const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const ERROR_TTL_MS = 60 * 1000; // 에러 시 1분

export async function checkIsPremium(bot: Bot, userId: number): Promise<boolean> {
  if (!env.PREMIUM_CHAT_ID) {
    return false;
  }

  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.isPremium;
  }

  try {
    const member = await bot.api.getChatMember(env.PREMIUM_CHAT_ID, userId);
    // 상태가 member, creator, administrator, restricted 인 경우 유효한 멤버로 간주.
    // left, kicked 등은 false
    const isPremium = ['member', 'creator', 'administrator', 'restricted'].includes(member.status);
    cache.set(userId, { isPremium, expiresAt: now + CACHE_TTL_MS });
    return isPremium;
  } catch (err) {
    console.error(`[premiumCache] Failed to check status for ${userId}:`, (err as Error).message);
    // 봇이 채널에 없거나, 유저를 찾을 수 없는 등의 에러 발생 시
    cache.set(userId, { isPremium: false, expiresAt: now + ERROR_TTL_MS });
    return false;
  }
}
