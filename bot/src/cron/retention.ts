import type { Bot } from 'grammy';
import type { SupabaseClient } from '@supabase/supabase-js';

export class RetentionCron {
  private timer: NodeJS.Timeout | null = null;
  private hasSentToday = false;

  constructor(
    private readonly bot: Bot,
    private readonly db: SupabaseClient,
  ) {}

  start() {
    // 1분마다 체크
    this.timer = setInterval(() => this.tick(), 60_000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      
      const hours = kstDate.getUTCHours();
      const mins = kstDate.getUTCMinutes();
      
      // 09:00 KST 정각
      if (hours === 9 && mins === 0) {
        if (!this.hasSentToday) {
          this.hasSentToday = true;
          await this.sendDailyRetentionDMs(kstDate);
        }
      } else {
        // 시간이 지나면 플래그 리셋
        this.hasSentToday = false;
      }
    } catch (err) {
      console.error('[retention] tick error:', err);
    }
  }

  private async sendDailyRetentionDMs(kstDate: Date) {
    console.log('[retention] starting daily retention DM broadcast...');
    
    // 어제 날짜 문자열 구하기 (KST 기준)
    const yesterdayKst = new Date(kstDate.getTime() - 24 * 60 * 60 * 1000);
    const yDateStr = yesterdayKst.toISOString().split('T')[0]!;

    // 어제자 랭킹 스냅샷 1~100위 페치
    const { data: topUsers, error } = await this.db
      .from('ranking_snapshots')
      .select('user_id, rank, daily_pnl, users(telegram_id, username)')
      .eq('date', yDateStr)
      .lte('rank', 100);

    if (error || !topUsers) {
      console.error('[retention] failed to fetch snapshots:', error);
      return;
    }

    const appUrl = process.env.FRONTEND_URL || 'https://t.me/Tradergames_bot/app';

    for (const record of topUsers) {
      // @ts-ignore - users table join
      const tgId = record.users?.telegram_id;
      if (!tgId) continue;

      const pnlStr = record.daily_pnl >= 0 
        ? `+$${record.daily_pnl.toLocaleString()}` 
        : `-$${Math.abs(record.daily_pnl).toLocaleString()}`;
      const emoji = record.daily_pnl >= 0 ? '📈' : '📉';
      const rank = record.rank;

      const message = `
🌅 <b>Good Morning, Trader!</b>

어제 하루 동안의 최종 순위는 <b>#${rank}</b>위 였습니다.
어제 수익금: <b>${pnlStr}</b> ${emoji}

오늘도 크립토 시장이 열렸습니다. 
지금 바로 10위권 진입에 도전하고 VIP 혜택을 쟁취해보세요!
      `.trim();

      try {
        await this.bot.api.sendMessage(tgId, message, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '미니앱 열기 🚀', web_app: { url: appUrl } }]
            ]
          }
        });
        // 텔레그램 Rate limit (초당 30건) 회피를 위해 100ms 대기
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`[retention] failed to send DM to ${tgId}:`, err);
      }
    }
    console.log(`[retention] broadcast complete for ${topUsers.length} users.`);
  }
}
