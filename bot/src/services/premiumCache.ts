import type { Bot } from 'grammy';
import { env } from '../env.js';
import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry {
  isPremium: boolean;
  expiresAt: number;
}

const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const ERROR_TTL_MS = 60 * 1000; // 에러 시 1분

// [Sprint 2.5] 수동 프리미엄 부여를 위한 로컬 파일 스토리지 (DB 대신 임시 사용)
const PREMIUM_FILE_PATH = path.join(process.cwd(), 'premium_users.json');
let manualPremiumUsers: Set<number> = new Set();

try {
  if (fs.existsSync(PREMIUM_FILE_PATH)) {
    const data = fs.readFileSync(PREMIUM_FILE_PATH, 'utf-8');
    manualPremiumUsers = new Set(JSON.parse(data));
  }
} catch (err) {
  console.error('[premiumCache] failed to load premium users file:', err);
}

export function grantManualPremium(userId: number) {
  manualPremiumUsers.add(userId);
  try {
    fs.writeFileSync(PREMIUM_FILE_PATH, JSON.stringify(Array.from(manualPremiumUsers)));
  } catch (err) {
    console.error('[premiumCache] failed to save premium users file:', err);
  }
  // 메모리 캐시도 즉시 업데이트
  cache.set(userId, { isPremium: true, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function checkIsPremium(bot: Bot, userId: number): Promise<boolean> {
  // 1. 수동 부여 확인 (최우선순위)
  if (manualPremiumUsers.has(userId)) {
    return true;
  }

  // 2. 텔레그램 채널 연동 확인
  if (!env.PREMIUM_CHANNEL_ID) {
    return false;
  }

  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.isPremium;
  }

  try {
    const member = await bot.api.getChatMember(env.PREMIUM_CHANNEL_ID, userId);
    const isPremium = ['member', 'creator', 'administrator', 'restricted'].includes(member.status);
    cache.set(userId, { isPremium, expiresAt: now + CACHE_TTL_MS });
    return isPremium;
  } catch (err) {
    console.error(`[premiumCache] Failed to check status for ${userId}:`, (err as Error).message);
    cache.set(userId, { isPremium: false, expiresAt: now + ERROR_TTL_MS });
    return false;
  }
}
