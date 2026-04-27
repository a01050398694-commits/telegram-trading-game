import type { Bot } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';
import { STARS_PAYLOAD_PREFIX, STARS_AMOUNT } from '../server.js';

export function setupLiquidationRecovery(bot: Bot, engine: TradingEngine) {
  engine.on('liquidated', async (userId: string) => {
    try {
      const user = await engine.getUserById(userId);
      const tgId = user?.telegram_id;
      if (!tgId) return;

      const payload = `${STARS_PAYLOAD_PREFIX}${userId}:${Date.now()}`;
      
      const title = 'Trading Academy · Risk Management Reset';
      const description = '🔴 시장에서 퇴출당했습니다. 리스크 관리에 실패하셨군요.\n지금 150 ⭐ 로 즉시 잔고를 $100K로 리셋하고 복수를 시작하시겠습니까?';
      
      // Stage 15: 청산 발생 0.1초 즉시 Telegram Stars 인보이스 발송 (충동 결제 유도)
      await bot.api.sendInvoice(
        tgId,
        title,
        description,
        payload,
        'XTR',
        [{ label: 'Risk Management Reset', amount: STARS_AMOUNT }],
      );
      
      console.log(`[recovery] sent immediate reset invoice to user ${userId} (${tgId})`);
    } catch (err) {
      console.error(`[recovery] error sending immediate invoice for ${userId}:`, err);
    }
  });
}
