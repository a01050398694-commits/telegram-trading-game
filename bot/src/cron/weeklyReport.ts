/**
 * Stage 15.2 — 주간 리포트 DM cron (모듈 E).
 *
 * 일요일 21:00 KST에 Premium 활성 유저 전체 대상으로
 * 이번 주 매매 요약 + 강점/약점/권고를 텔레그램 DM 발송.
 *
 * 트리거: POST /api/cron/weekly-report (외부 cron 서비스 or 내부 setInterval)
 */

import type { Bot } from 'grammy';
import type { Db } from '../db/supabase.js';
import { computeWeeklyReport } from '../services/analytics.js';
import { webAppUrl } from '../lib/webappUrl.js';

// 일요일 21:00 KST = UTC 12:00
const CRON_HOUR_UTC = 12;
const CRON_DAY = 0; // 일요일

export class WeeklyReportCron {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly bot: Bot,
    private readonly db: Db,
  ) {}

  start(): void {
    // 1시간마다 체크하여 일요일 21시 KST 에 실행
    this.timer = setInterval(() => void this.checkAndRun(), 60 * 60 * 1000);
    console.log('[weeklyReport] cron scheduled (checks hourly for Sunday 21:00 KST)');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async checkAndRun(): Promise<void> {
    const now = new Date();
    if (now.getUTCDay() === CRON_DAY && now.getUTCHours() === CRON_HOUR_UTC) {
      await this.sendAllReports();
    }
  }

  /**
   * 외부에서 수동 트리거 가능 (POST /api/cron/weekly-report)
   */
  async sendAllReports(): Promise<{ sent: number; errors: number }> {
    let sent = 0;
    let errors = 0;

    try {
      // Premium 활성 유저 전체 조회 — language_code 함께 가져와서 DM 언어 분기.
      const { data: premiumUsers, error } = await this.db
        .from('users')
        .select('id, telegram_id, language_code')
        .eq('is_premium', true)
        .not('telegram_id', 'is', null);

      if (error || !premiumUsers) {
        console.error('[weeklyReport] user query error:', error?.message);
        return { sent: 0, errors: 1 };
      }

      for (const user of premiumUsers as { id: string; telegram_id: number; language_code: string | null }[]) {
        try {
          const report = await computeWeeklyReport(this.db, user.id, user.telegram_id);
          await this.sendReportDM(report, user.language_code);
          sent++;
        } catch (err) {
          console.error(`[weeklyReport] error for user ${user.id}:`, err);
          errors++;
        }
      }

      console.log(`[weeklyReport] completed: ${sent} sent, ${errors} errors`);
    } catch (err) {
      console.error('[weeklyReport] fatal error:', err);
      errors++;
    }

    return { sent, errors };
  }

  private async sendReportDM(
    report: Awaited<ReturnType<typeof computeWeeklyReport>>,
    languageCode: string | null,
  ): Promise<void> {
    const pnlSign = report.weekPnl >= 0 ? '+' : '';
    const winPct = Math.round(report.winRate * 100);
    const isKo = languageCode === 'ko';

    const message = isKo
      ? [
          `📊 *주간 매매 리포트*`,
          ``,
          `이번 주 손익: *${pnlSign}$${report.weekPnl.toFixed(2)}*`,
          `매매 횟수: ${report.trades}건 · 승률: ${winPct}%`,
          ``,
          `✅ *강점*`,
          `• 최고 수익 코인: ${report.bestSymbol}`,
          `• 최적 시간대: ${report.bestTimeSlot} KST`,
          ``,
          `⚠️ *약점*`,
          `• ${report.worstScenario}`,
          `• ${report.liquidationCause}`,
          ``,
          `💡 *다음 주 권고*`,
          `${report.topRecommendation}`,
        ].join('\n')
      : [
          `📊 *Weekly Trading Report*`,
          ``,
          `Week PnL: *${pnlSign}$${report.weekPnl.toFixed(2)}*`,
          `Trades: ${report.trades} · Win rate: ${winPct}%`,
          ``,
          `✅ *Strengths*`,
          `• Best symbol: ${report.bestSymbol}`,
          `• Best time slot: ${report.bestTimeSlot} KST`,
          ``,
          `⚠️ *Weaknesses*`,
          `• ${report.worstScenario}`,
          `• ${report.liquidationCause}`,
          ``,
          `💡 *Next-week recommendation*`,
          `${report.topRecommendation}`,
        ].join('\n');

    const buttonLabel = isKo ? '📈 자세히 보기' : '📈 View details';

    await this.bot.api.sendMessage(report.telegramId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: buttonLabel, web_app: { url: webAppUrl() } },
        ]],
      },
    });
  }
}
