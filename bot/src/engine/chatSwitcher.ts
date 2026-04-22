import type { Bot } from 'grammy';
import type { RankingEngine } from './ranking.js';
import { env } from '../env.js';

export class ChatSwitcher {
  private timer: NodeJS.Timeout | null = null;
  private currentMode: 'LOCKED' | 'OPEN' = 'LOCKED';

  constructor(
    private readonly bot: Bot,
    private readonly ranking: RankingEngine,
  ) {}

  start() {
    if (!env.VIP_CHAT_ID) {
      console.log('[chatSwitcher] VIP_CHAT_ID not configured, skipping chat permissions cron.');
      return;
    }
    // Check every 30 seconds
    this.timer = setInterval(() => this.tick(), 30_000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      const now = new Date();
      const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
      const kstDate = new Date(kstMs);
      
      const hours = kstDate.getUTCHours();
      const mins = kstDate.getUTCMinutes();
      
      const isWindowOpen = hours === 21 && mins >= 50; // 21:50 ~ 21:59. (PRD says 21:50~24:00, wait! Let's check PRD)
      // PRD says 21:50~24:00. So hours >= 21 and (hours > 21 or mins >= 50). But max hour is 23 in KST.
      const isOpenTime = (hours === 21 && mins >= 50) || (hours >= 22);

      if (isOpenTime && this.currentMode === 'LOCKED') {
        console.log('[chatSwitcher] Opening VIP chat for top 10...');
        await this.openChat();
        this.currentMode = 'OPEN';
      } else if (!isOpenTime && this.currentMode === 'OPEN') {
        console.log('[chatSwitcher] Closing VIP chat for everyone...');
        await this.closeChat();
        this.currentMode = 'LOCKED';
      }
    } catch (err) {
      console.error('[chatSwitcher] tick error:', err);
    }
  }

  private async openChat() {
    if (!env.VIP_CHAT_ID) return;
    
    // 1. Get Top 10
    const top100 = this.ranking.getTop100();
    const top10 = top100.slice(0, 10);

    // Default permissions for group (everyone else)
    // We want nobody else to talk.
    try {
      await this.bot.api.setChatPermissions(env.VIP_CHAT_ID, {
        can_send_messages: false,
      });
    } catch (err) {
      console.error('[chatSwitcher] failed to set default chat permissions:', err);
    }

    // Give exception permissions to top 10
    for (const user of top10) {
      try {
        await this.bot.api.restrictChatMember(env.VIP_CHAT_ID, user.telegramUserId, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        });
      } catch (err) {
        console.error(`[chatSwitcher] failed to promote top10 user ${user.telegramUserId}:`, err);
      }
    }
  }

  private async closeChat() {
    if (!env.VIP_CHAT_ID) return;

    try {
      // Lockdown group for everyone
      await this.bot.api.setChatPermissions(env.VIP_CHAT_ID, {
        can_send_messages: false,
      });
    } catch (err) {
      console.error('[chatSwitcher] failed to close chat permissions:', err);
    }
  }
}
