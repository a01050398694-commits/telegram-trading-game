// Stage 20 — Daily performance report at KST midnight.
// Why: members + CTO see realized R every morning without typing /stats.

import type { Bot } from 'grammy';
import { computeStats, formatStatsForTelegram } from '../services/tradingStats.js';
import { env } from '../env.js';

export async function runDailyReport(bot: Bot): Promise<{ sent: boolean; error?: string }> {
  try {
    if (!env.COMMUNITY_CHAT_ID) {
      return { sent: false, error: 'COMMUNITY_CHAT_ID missing' };
    }
    const stats = await computeStats(1);
    const dateStr = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const header = `📊 *${dateStr} 일일 성과 보고*\n\n`;
    const body = formatStatsForTelegram(stats);
    await bot.api.sendMessage(env.COMMUNITY_CHAT_ID, header + body, {
      parse_mode: 'Markdown',
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[dailyReport] failed:', msg);
    return { sent: false, error: msg };
  }
}
