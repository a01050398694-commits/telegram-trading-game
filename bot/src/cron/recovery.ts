import type { Bot } from 'grammy';
import type { TradingEngine } from '../engine/trading.js';

/**
 * Stage 15.2 — 청산 DM을 inline_keyboard web_app 버튼으로 변경.
 *
 * 왜 web_app 버튼인가:
 *   · 기존 마크다운 링크는 외부 브라우저로 열려 PayPal만 보임.
 *   · web_app 버튼은 텔레그램 in-app WebView로 열림 → Stars 결제 가능.
 *   · parse_mode 제거 (web_app 버튼과 호환 안 됨).
 */
export function setupLiquidationRecovery(bot: Bot, engine: TradingEngine) {
  engine.on('liquidated', async (userId: string) => {
    try {
      const user = await engine.getUserById(userId);
      const tgId = user?.telegram_id;
      if (!tgId) return;

      const rechargeUrl =
        process.env.INVITEMEMBER_RECHARGE_URL ||
        'https://im.page/viptraderx/plan?planId=375d3420-42cd-11f1-aecf-19beb80868b2';

      // web_app 버튼 (in-app Stars 결제) + 외부 브라우저 fallback (PayPal)
      await bot.api.sendMessage(
        tgId,
        '시장에서 청산당했습니다.\n\n$2.99로 즉시 $1,000 충전합니다.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 $2.99 충전하기', web_app: { url: rechargeUrl } }],
              [{ text: '🌐 브라우저로 결제', url: rechargeUrl }],
            ],
          },
        },
      );

      console.log(`[recovery] sent recharge DM to user ${userId} (${tgId})`);
    } catch (err) {
      console.error(`[recovery] error sending recharge DM for ${userId}:`, err);
    }
  });
}
