import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { SupabaseClient } from '@supabase/supabase-js';
import { webAppUrl } from '../lib/webappUrl.js';

export class RetentionCron {
  private timer: NodeJS.Timeout | null = null;
  private hasSentToday = false;
  private hasSentNudgeToday = false;

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
      
      // 09:00 KST 정각 (활동 유저 리텐션)
      if (hours === 9 && mins === 0) {
        if (!this.hasSentToday) {
          this.hasSentToday = true;
          await this.sendDailyRetentionDMs(kstDate);
        }
      } else {
        this.hasSentToday = false;
      }

      // 12:00 KST 정각 (비활동 유저 넛지 DM)
      if (hours === 12 && mins === 0) {
        if (!this.hasSentNudgeToday) {
          this.hasSentNudgeToday = true;
          await this.sendInactiveNudgeDMs();
        }
      } else {
        this.hasSentNudgeToday = false;
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

    const appUrl = webAppUrl();

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

  // Stage 15: 비활동 유저 능동형 커뮤니티 유도 (사람 냄새 나는 팔로업)
  private async sendInactiveNudgeDMs() {
    console.log('[retention] starting inactive user nudge...');
    
    // 24~48시간 전 가입자 추출
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: users, error } = await this.db
      .from('users')
      .select('id, telegram_id, language_code')
      .gte('created_at', twoDaysAgo)
      .lt('created_at', oneDayAgo);

    if (error || !users) {
      console.error('[retention] failed to fetch inactive users:', error);
      return;
    }

    const appUrl = webAppUrl();

    for (const user of users) {
      if (!user.telegram_id) continue;

      // 포지션을 한 번도 안 열었는지 확인
      const { count } = await this.db
        .from('positions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (count === 0) {
        const isKo = user.language_code?.startsWith('ko');
        const message = isKo
          ? '앗, 어제 지급받으신 무료 연습 시드 $10K 를 아직 한 번도 안 쓰셨네요! 😅\n\n오늘 비트코인 무빙이 심상치 않은데, 공짜 시드로 리스크 없이 첫 타점을 잡아보시는 건 어떨까요? 제가 도와드릴게요!'
          : "Hey! I noticed you haven't used your $10K free practice seed yet! 😅\n\nBitcoin's volatility is high today. How about taking your first risk-free trade? I can help you out!";
        
        const inlineKb = new InlineKeyboard()
          .url(isKo ? '📢 공식 채널 가기' : '📢 Official Channel', 'https://t.me/academy_premium_ch').row()
          .webApp(isKo ? '📱 미니앱 열기' : '📱 Open App', appUrl);

        try {
          await this.bot.api.sendMessage(user.telegram_id, message, {
            reply_markup: inlineKb
          });
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
        } catch (err) {
          console.error(`[retention] failed to send nudge to ${user.telegram_id}:`, err);
        }
      }
    }
    console.log(`[retention] inactive nudge complete.`);
  }
}
