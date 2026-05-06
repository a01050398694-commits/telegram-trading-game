import type { Bot } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';

/**
 * Stage 15.2 — Liquidation DM with inline_keyboard web_app button.
 *
 * Stage 21 — translated to language-aware: English default for global users,
 * Korean for users with language_code='ko'. Bot DMs reaching the wrong-language
 * audience was a real complaint ("봇방에 한국어 떠").
 */

interface RecoveryCopy {
  body: string;
  inAppButton: string;
  browserButton: string;
}

const COPY: Record<'en' | 'ko', RecoveryCopy> = {
  en: {
    body: 'You were liquidated.\n\nRecharge $1,000 instantly for $2.99.',
    inAppButton: '💳 Recharge $2.99',
    browserButton: '🌐 Pay via browser',
  },
  ko: {
    body: '시장에서 청산당했습니다.\n\n$2.99로 즉시 $1,000 충전합니다.',
    inAppButton: '💳 $2.99 충전하기',
    browserButton: '🌐 브라우저로 결제',
  },
};

export function setupLiquidationRecovery(bot: Bot, engine: TradingEngine) {
  engine.on('liquidated', async (userId: string) => {
    try {
      const user = await engine.getUserById(userId);
      const tgId = user?.telegram_id;
      if (!tgId) return;

      const lang = user?.language_code === 'ko' ? 'ko' : 'en';
      const copy = COPY[lang];

      const rechargeUrl =
        process.env.INVITEMEMBER_RECHARGE_URL ||
        'https://im.page/viptraderx/plan?planId=375d3420-42cd-11f1-aecf-19beb80868b2';

      await bot.api.sendMessage(tgId, copy.body, {
        reply_markup: {
          inline_keyboard: [
            [{ text: copy.inAppButton, web_app: { url: rechargeUrl } }],
            [{ text: copy.browserButton, url: rechargeUrl }],
          ],
        },
      });

      console.log(`[recovery] sent recharge DM to user ${userId} (${tgId}) lang=${lang}`);
    } catch (err) {
      console.error(`[recovery] error sending recharge DM for ${userId}:`, err);
    }
  });
}
