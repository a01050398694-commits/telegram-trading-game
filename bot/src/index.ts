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
import { BinancePriceFeed, type PriceUpdate } from './services/binance.js';
import { PriceCache } from './priceCache.js';
import { env } from './env.js';

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
  
  // Set up liquidation recovery DMs
  setupLiquidationRecovery(bot, engine);

  // 가격 피드 → (1) 캐시 갱신 (2) 청산 감시.
  // 매 tick마다 DB 스캔은 초당 1회 수준이라 비용 안전. 심볼 증가 시엔 throttle 재검토.
  const feed = new BinancePriceFeed(env.MARKET_SYMBOLS);
  feed.on('price', (update: PriceUpdate) => {
    priceCache.set(update.symbol, update.price);
    void engine
      .scanAndLiquidate({ symbol: update.symbol, markPrice: update.price })
      .catch((err) => console.error('[engine] scan error:', err));
  });

  await bot.init();
  console.log(`[bot] connected as @${bot.botInfo.username}`);

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

  server.listen(env.SERVER_PORT, () => {
    console.log(`[server] listening on http://localhost:${env.SERVER_PORT}`);
  });

  // graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[bot] received ${signal}, shutting down`);
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
