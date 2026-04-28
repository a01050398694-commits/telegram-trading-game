import type { Bot } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';

// Stage 15.1 — Stars 직접 결제 폐기. 청산 시 InviteMember Recharge 봇 링크 DM 으로 변경.
// 결제 자체는 InviteMember 가 처리. 우리 봇은 액션 트리거링만.
export function setupLiquidationRecovery(bot: Bot, engine: TradingEngine) {
  engine.on('liquidated', async (userId: string) => {
    try {
      const user = await engine.getUserById(userId);
      const tgId = user?.telegram_id;
      if (!tgId) return;

      const rechargeUrl =
        process.env.INVITEMEMBER_RECHARGE_URL ||
        'https://im.page/viptraderx/plan?planId=375d3420-42cd-11f1-aecf-19beb80868b2';

      const message =
        '🔴 시장에서 청산당했습니다.\n\n' +
        '$2.99 로 즉시 $1,000 게임머니를 충전해 매매를 이어가세요.\n\n' +
        `[💳 충전하기](${rechargeUrl})`;

      await bot.api.sendMessage(tgId, message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });

      console.log(`[recovery] sent recharge DM to user ${userId} (${tgId})`);
    } catch (err) {
      console.error(`[recovery] error sending recharge DM for ${userId}:`, err);
    }
  });
}
