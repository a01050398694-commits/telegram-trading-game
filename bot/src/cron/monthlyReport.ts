// Stage 20 — Monthly performance report (KST 1일 자정).
// Why: 30일 누적 — 월간 net R + win rate + per-symbol breakdown one-shot.

import type { Bot } from 'grammy';
import { computeStats, formatStatsForTelegram } from '../services/tradingStats.js';
import { env } from '../env.js';

export async function runMonthlyReport(bot: Bot): Promise<{ sent: boolean; error?: string }> {
  try {
    if (!env.COMMUNITY_CHAT_ID) {
      return { sent: false, error: 'COMMUNITY_CHAT_ID missing' };
    }
    const stats = await computeStats(30);
    const monthStr = new Date().toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
    });
    const header = `📊 *${monthStr} 월간 성과 보고*\n\n`;
    const body = formatStatsForTelegram(stats);
    await bot.api.sendMessage(env.COMMUNITY_CHAT_ID, header + body, {
      parse_mode: 'Markdown',
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[monthlyReport] failed:', msg);
    return { sent: false, error: msg };
  }
}
