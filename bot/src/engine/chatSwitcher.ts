import cron from 'node-cron';
import type { Bot } from 'grammy';
import type { RankingEngine } from './ranking.js';
import { env } from '../env.js';

export class ChatSwitcher {
  private allowedUserIds: number[] = [];

  constructor(
    private readonly bot: Bot,
    private readonly rankingEngine: RankingEngine,
  ) {}

  start() {
    const chatId = env.VIP_CHAT_ID;
    if (!chatId) {
      console.warn('[chatSwitcher] VIP_CHAT_ID not configured, skipping chat permissions cron.');
      return;
    }

    console.log('[chatSwitcher] Cron initialized for KST 21:50 and 24:00.');

    // KST 21:50 = UTC 12:50
    cron.schedule('50 12 * * *', async () => {
      console.log('[chatSwitcher] Triggering 21:50 KST unrestrict for Top 10.');
      try {
        const top10 = this.rankingEngine.getTop100().slice(0, 10);
        this.allowedUserIds = top10.map((r) => r.telegramUserId);

        for (const userId of this.allowedUserIds) {
          try {
            await this.bot.api.restrictChatMember(chatId, userId, {
              can_send_messages: true,
              can_send_audios: true,
              can_send_documents: true,
              can_send_photos: true,
              can_send_videos: true,
              can_send_video_notes: true,
              can_send_voice_notes: true,
              can_send_polls: false,
              can_send_other_messages: true,
              can_add_web_page_previews: true,
              can_change_info: false,
              can_invite_users: false,
              can_pin_messages: false,
            });
            console.log(`[chatSwitcher] Unrestricted user ${userId}`);
          } catch (err) {
            console.error(`[chatSwitcher] Failed to unrestrict ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[chatSwitcher] Error in 21:50 cron:', err);
      }
    });

    // KST 24:00 (자정) = UTC 15:00
    cron.schedule('0 15 * * *', async () => {
      console.log('[chatSwitcher] Triggering 24:00 KST restrict for Top 10.');
      try {
        if (this.allowedUserIds.length === 0) {
          // 캐시가 비어있으면 현재 탑10 가져오기 (재시작 등)
          this.allowedUserIds = this.rankingEngine.getTop100().slice(0, 10).map((r) => r.telegramUserId);
        }

        for (const userId of this.allowedUserIds) {
          try {
            await this.bot.api.restrictChatMember(chatId, userId, {
              can_send_messages: false,
              can_send_audios: false,
              can_send_documents: false,
              can_send_photos: false,
              can_send_videos: false,
              can_send_video_notes: false,
              can_send_voice_notes: false,
              can_send_polls: false,
              can_send_other_messages: false,
              can_add_web_page_previews: false,
              can_change_info: false,
              can_invite_users: false,
              can_pin_messages: false,
            });
            console.log(`[chatSwitcher] Restricted user ${userId}`);
          } catch (err) {
            console.error(`[chatSwitcher] Failed to restrict ${userId}:`, err);
          }
        }
        this.allowedUserIds = []; // reset
      } catch (err) {
        console.error('[chatSwitcher] Error in 24:00 cron:', err);
      }
    });
  }
}
