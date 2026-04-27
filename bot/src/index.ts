import { initSentry } from './lib/sentry.js';
initSentry();

import { createBot } from './bot.js';
import { createServer } from './server.js';
import { createSupabase } from './db/supabase.js';
import { TradingEngine } from './engine/trading.js';
import { RankingEngine } from './engine/ranking.js';
import { ChatSwitcher } from './engine/chatSwitcher.js';
import { ReferralMissionEngine } from './engine/referralMission.js';
import { RetentionCron } from './cron/retention.js';
import { AffiliateReconcileCron } from './cron/affiliateReconcile.js';
import { setupLiquidationRecovery } from './cron/recovery.js';
import { MarketBriefCron } from './cron/marketBrief.js';
import { shillEngine } from './engine/shillEngine.js';
import { BinancePriceFeed, type PriceUpdate } from './services/binance.js';
import { PriceCache } from './priceCache.js';
import { env } from './env.js';
import { InlineKeyboard } from 'grammy';

async function main(): Promise<void> {
  // 의존성 조립 — 각 모듈은 독립적이고 생성자 주입.
  const db = createSupabase();
  const engine = new TradingEngine(db);
  const priceCache = new PriceCache();
  const rankingEngine = new RankingEngine(db, priceCache);
  // bot 은 referralMission 을 주입받아야 하므로 순서상 referralMission 을 먼저.
  // 그러나 referralMission 은 bot 을 필요로 함 → 순환 의존. 해결: bot 인스턴스는
  // 생성 후 engine 주입 방식. 아래에서 1) bot 먼저 2) referralMission 생성 3) bot.setReferralMissionEngine
  const botContext = { referralMission: null as ReferralMissionEngine | null };
  const bot = createBot(engine, botContext);
  const referralMission = new ReferralMissionEngine(db, engine, bot);
  botContext.referralMission = referralMission;
  const server = createServer({ engine, priceCache, bot, rankingEngine, referralMission });
  const chatSwitcher = new ChatSwitcher(bot, rankingEngine);
  const retentionCron = new RetentionCron(bot, db);
  const affiliateReconcileCron = new AffiliateReconcileCron(db);
  const marketBriefCron = new MarketBriefCron(bot, priceCache);
  
  // Set up liquidation recovery DMs
  setupLiquidationRecovery(bot, engine);

  // 가격 피드 → (1) 캐시 갱신 (2) 청산 감시.
  // 매 tick마다 DB 스캔은 초당 1회 수준이라 비용 안전. 심볼 증가 시엔 throttle 재검토.
  // 5분 변동성 추적 캐시
  const btcHistory: { time: number; price: number }[] = [];
  let lastAlertTime = 0;

  const feed = new BinancePriceFeed(env.MARKET_SYMBOLS);
  feed.on('price', (update: PriceUpdate) => {
    priceCache.set(update.symbol, update.price);
    void engine
      .scanAndLiquidate({ symbol: update.symbol, markPrice: update.price })
      .catch((err) => console.error('[engine] scan error:', err));

    // [🚨 자율형 변동성 알림] 비트코인 단기 급등/급락 감지
    if (update.symbol === 'btcusdt') {
      const now = Date.now();
      btcHistory.push({ time: now, price: update.price });
      
      // 5분(300,000ms) 지난 데이터 제거
      while (btcHistory.length > 0 && now - btcHistory[0]!.time > 300000) {
        btcHistory.shift();
      }

      // 쿨타임 15분
      if (btcHistory.length > 0 && now - lastAlertTime > 15 * 60 * 1000) {
        const oldest = btcHistory[0]!.price;
        const diffPercent = ((update.price - oldest) / oldest) * 100;

        // 0.5% 이상 변동 시 알림
        if (Math.abs(diffPercent) >= 0.5) {
          lastAlertTime = now;
          const isPump = diffPercent > 0;
          const icon = isPump ? '🚀' : '🩸';
          const direction = isPump ? '급등' : '급락';
          const msg = `🚨 *비트코인 변동성 경보* 🚨\n\n최근 5분 동안 비트코인이 *${Math.abs(diffPercent).toFixed(2)}% ${direction}*했습니다!\n(현재가: $${update.price.toLocaleString('en-US')})\n\n시장 변동성이 폭발 중입니다. 지금 바로 타점을 잡아보세요!`;
          
          if (env.COMMUNITY_CHAT_ID) {
            const kb = new InlineKeyboard().webApp('⚔️ 실시간 마켓 참여하기', env.WEBAPP_URL);
            void bot.api.sendMessage(env.COMMUNITY_CHAT_ID, msg, { parse_mode: 'Markdown', reply_markup: kb }).catch(console.error);
          }
        }
      }
    }
  });

  await bot.init();
  console.log(`[bot] connected as @${bot.botInfo.username}`);
  
  // Stage 15: 명령어 타이핑 폐지. 하단 메뉴 버튼을 미니앱으로 고정.
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🎓 아카데미 열기',
        web_app: { url: env.WEBAPP_URL }
      }
    });
  } catch (err) {
    console.warn('[bot] setChatMenuButton failed:', err);
  }

  // 관리자가 특정 방에서 수다 모드를 즉시 켜기 위한 비밀 명령어
  bot.command('chathere', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    try {
      const member = await ctx.getChatMember(userId);
      if (member.status === 'administrator' || member.status === 'creator') {
        await ctx.reply('✅ 알겠습니다! 지금부터 이 방에서 매 30분마다 제가 먼저 코인 수다를 시작하겠습니다. (첫 번째 수다 생성 중...)');
        await marketBriefCron.forceTick(ctx.chat.id.toString());
      }
    } catch (e) {
      console.warn('[bot] /chathere error:', e);
    }
  });

  // 개발 단계: long polling. 프로덕션 배포 시 webhook으로 전환.
  void bot.start({
    onStart: (info) => {
      console.log(`[bot] polling started for @${info.username}`);
    },
  });

  feed.start();
  rankingEngine.start();
  chatSwitcher.start();
  retentionCron.start();
  affiliateReconcileCron.start();
  marketBriefCron.start();
  shillEngine.setPriceCache(priceCache);
  void shillEngine.start();

  server.listen(env.SERVER_PORT, () => {
    console.log(`[server] listening on http://localhost:${env.SERVER_PORT}`);
  });

  // graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[bot] received ${signal}, shutting down`);
    marketBriefCron.stop();
    shillEngine.stop();
    retentionCron.stop();
    affiliateReconcileCron.stop();
    chatSwitcher.stop();
    rankingEngine.stop();
    feed.stop();
    await bot.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[bot] fatal:', err);
  process.exit(1);
});
