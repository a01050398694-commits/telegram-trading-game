import { initSentry, Sentry } from './lib/sentry.js';
initSentry();

import { createBot } from './bot.js';
import { createServer } from './server.js';
import { createSupabase } from './db/supabase.js';
import { TradingEngine } from './engine/trading.js';
import { RankingEngine } from './engine/ranking.js';
import { ChatSwitcher } from './engine/chatSwitcher.js';
import { RetentionCron } from './cron/retention.js';
import { AffiliateReconcileCron } from './cron/affiliateReconcile.js';
import { setupLiquidationRecovery } from './cron/recovery.js';
import { MarketBriefCron } from './cron/marketBrief.js';
import { WeeklyReportCron } from './cron/weeklyReport.js';
import { SignalCron } from './cron/signalCron.js';
import { runDailyReport } from './cron/dailyReport.js';
import { runMonthlyReport } from './cron/monthlyReport.js';
import { runSignalCleanup } from './cron/signalCleanup.js';
import { shillEngine } from './engine/shillEngine.js';
import { BinancePriceFeed, type PriceUpdate } from './services/binance.js';
import { PriceCache } from './priceCache.js';
import { env } from './env.js';
import { InlineKeyboard } from 'grammy';
import { webAppDeepLink } from './lib/webappUrl.js';

async function main(): Promise<void> {
  // CLAUDE.md §7 — silent fail 금지. 핵심 ENV 누락 시 부팅 시점에 한 번 warn.
  if (!env.COMMUNITY_CHAT_ID) {
    console.warn('[boot] COMMUNITY_CHAT_ID missing, marketBrief/shillEngine/btcAlert disabled');
  }
  if (!env.VIP_CHAT_ID) {
    console.warn('[boot] VIP_CHAT_ID missing, chatSwitcher (VIP 21:50~24:00 lock) disabled');
  }
  if (env.SHILL_BOT_TOKENS.length === 0) {
    console.warn('[boot] SHILL_BOT_TOKENS empty, shillEngine (10 fake bot personas) disabled');
  }

  // 의존성 조립 — 각 모듈은 독립적이고 생성자 주입.
  const db = createSupabase();
  const engine = new TradingEngine(db);
  const priceCache = new PriceCache();
  const rankingEngine = new RankingEngine(db, priceCache);
  const bot = createBot(engine);
  const server = createServer({ engine, priceCache, bot, rankingEngine });
  const chatSwitcher = new ChatSwitcher(bot, rankingEngine);
  const retentionCron = new RetentionCron(bot, db);
  const affiliateReconcileCron = new AffiliateReconcileCron(db);
  const marketBriefCron = new MarketBriefCron(bot, priceCache);
  const weeklyReportCron = new WeeklyReportCron(bot, db);
  const signalCron = new SignalCron(bot, priceCache);
  
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
      .catch((err) => {
        // 청산 감시는 매 가격 tick 마다 호출. 실패 시 무음 처리하면 청산 누락
        // 발생해도 운영자가 모름 → console + Sentry 둘 다.
        console.error('[engine] scan error:', err);
        Sentry.captureException(err, {
          tags: { context: 'liquidation_scan' },
          extra: { symbol: update.symbol, markPrice: update.price },
        });
      });

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
          // disabled per Stage 16: data-only bot, signalCron only emits to group
          if (false) {
            const isPump = diffPercent > 0;
            const icon = isPump ? '🚀' : '🩸';
            const direction = isPump ? 'pump' : 'dump';
            const msg = `🚨 *BTC Volatility Alert* 🚨\n\nBTC moved *${Math.abs(diffPercent).toFixed(2)}% ${direction}* in the last 5 min!\n(now: $${update.price.toLocaleString('en-US')})\n\nMarket's heating up — jump in!`;
            void icon;
            if (env.COMMUNITY_CHAT_ID) {
              const kb = new InlineKeyboard().url('⚔️ Jump In Live', webAppDeepLink('btc_alert'));
              void bot.api.sendMessage(env.COMMUNITY_CHAT_ID, msg, { parse_mode: 'Markdown', reply_markup: kb }).catch(console.error);
            }
          }
        }
      }
    }
  });

  await bot.init();
  console.log(`[bot] connected as @${bot.botInfo.username}`);
  
  // Stage 15.1 — 메뉴 버튼 URL 에 timestamp 박아 텔레그램 클라이언트 캐시 영구 무력화.
  // 봇 재부팅마다 새 URL → 텔레그램 클라이언트가 옛 캐시 무시하고 새 빌드 가져옴.
  try {
    const cacheBustedMenuUrl = `${env.WEBAPP_URL}?v=${Date.now()}`;
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🎓 아카데미 열기',
        web_app: { url: cacheBustedMenuUrl }
      }
    });
    console.log('[bot] menu button URL set:', cacheBustedMenuUrl);
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
  // Stage 15.5 — chat_member 이벤트 수신을 위해 allowed_updates 명시.
  //   기본값에는 chat_member 가 빠져 있어 InviteMember 결제 후 채널 자동 가입을
  //   봇이 못 본다. chat_member 를 명시해야 setupInviteMemberSync 가 동작.
  void bot.start({
    allowed_updates: [
      'message',
      'edited_message',
      'callback_query',
      'inline_query',
      'pre_checkout_query',
      'chat_member',
      'my_chat_member',
    ],
    onStart: (info) => {
      console.log(`[bot] polling started for @${info.username}`);
    },
  });

  feed.start();
  rankingEngine.start();
  chatSwitcher.start();
  retentionCron.start();
  affiliateReconcileCron.start();
  // marketBriefCron.start(); — disabled per Stage 16: data-only bot
  weeklyReportCron.start();
  signalCron.start();

  // Stage 20 — daily/monthly report + cleanup intervals.
  // Why: setInterval can fire multiple times within the same minute (drift); guard with last-fire-date
  //   so we never double-broadcast. KST midnight = UTC 15:00.
  let lastDailyReportDate = '';
  let lastMonthlyReportYM = '';
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() !== 15 || now.getUTCMinutes() !== 0) return;
    const kst = new Date(now.getTime() + 9 * 3600_000);
    const kstDate = kst.toISOString().slice(0, 10);
    const kstYM = kstDate.slice(0, 7);
    const isFirstOfMonth = kstDate.endsWith('-01');

    if (kstDate !== lastDailyReportDate) {
      lastDailyReportDate = kstDate;
      await runDailyReport(bot).catch((err) => console.error('[dailyReport] interval error:', err));
    }
    if (isFirstOfMonth && kstYM !== lastMonthlyReportYM) {
      lastMonthlyReportYM = kstYM;
      await runMonthlyReport(bot).catch((err) => console.error('[monthlyReport] interval error:', err));
    }
  }, 60_000);

  // Cleanup orphaned outcomes every 1h + on boot (catches anything missed during restart).
  setInterval(() => {
    runSignalCleanup().catch((err) => console.error('[signalCleanup] interval error:', err));
  }, 60 * 60_000);
  runSignalCleanup().catch((err) => console.error('[signalCleanup] boot error:', err));
  shillEngine.setPriceCache(priceCache);
  void shillEngine.start();

  // Stage 14 — Render/PaaS 배포: 0.0.0.0 바인딩 필수.
  // 기본 'localhost' 만 듣면 컨테이너 외부 health check 가 죽어서 deploy 가 무한 unhealthy.
  // env.SERVER_PORT 는 process.env.PORT 우선 채택 (Render 가 자동 주입).
  server.listen(env.SERVER_PORT, '0.0.0.0', () => {
    console.log(`[server] listening on 0.0.0.0:${env.SERVER_PORT}`);
  });

  // graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[bot] received ${signal}, shutting down`);
    weeklyReportCron.stop();
    signalCron.stop();
    // marketBriefCron.stop(); — disabled per Stage 16: data-only bot
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
