import type { Bot } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';

export function setupLiquidationRecovery(bot: Bot, engine: TradingEngine) {
  engine.on('liquidated', (userId: string) => {
    // 30분(1800000ms) 뒤에 DM 발송
    setTimeout(async () => {
      try {
        const wallet = await engine.getWallet(userId);
        // 여전히 청산 상태인지 확인 (결제로 부활했을 수도 있음)
        if (wallet?.is_liquidated) {
          const user = await engine.getUserById(userId);
          const tgId = user?.telegram_id;
          if (tgId) {
            const appUrl = process.env.FRONTEND_URL || 'https://t.me/Tradergames_bot/app';
            const message = `
💥 <b>아앗... 포지션이 청산되었습니다.</b>

시장은 언제나 기회를 줍니다! 
멘탈을 회복하시고 다시 연습장으로 돌아와서 새로운 전략을 시도해보세요.

(프리미엄 멤버십을 통해 즉시 부활이 가능합니다)
            `.trim();

            await bot.api.sendMessage(tgId, message, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '다시 도전하기 🚀', web_app: { url: appUrl } }]
                ]
              }
            });
            console.log(`[recovery] sent recovery DM to user ${userId} (${tgId})`);
          }
        }
      } catch (err) {
        console.error(`[recovery] error processing recovery for ${userId}:`, err);
      }
    }, 30 * 60 * 1000); // 30 minutes
  });
}
