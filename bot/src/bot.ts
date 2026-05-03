import { Bot, InlineKeyboard, type Context } from 'grammy';
import { env } from './env.js';
import type { TradingEngine } from './engine/trading.js';
import { setupCommunityFeatures } from './engine/community.js';
import { botLocales, SupportedLang } from './locales.js';
import { setupInviteMemberSync } from './handlers/inviteMemberSync.js';
import { computeStats, formatStatsForTelegram } from './services/tradingStats.js';

function formatBalance(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

// 모든 admin 명령은 이 함수 하나만 거친다.
//   · userId 없음                     → false (호출자가 ctx.from 못 읽었다는 뜻)
//   · env.ADMIN_TG_ID 누락 (sync:false 미입력 등) → false (fail-closed, silent grant 방지)
//   · 위 둘 다 OK 면 문자열 비교
function isAdmin(userId: number | undefined): boolean {
  if (!userId) return false;
  if (!env.ADMIN_TG_ID) return false;
  return String(userId) === env.ADMIN_TG_ID;
}

const CB_HOW = 'how_to_play';
const CB_PREMIUM = 'academy_info';
const CB_COMMUNITY = 'community_guide';

async function getLang(ctx: Context, engine?: TradingEngine): Promise<SupportedLang> {
  const tgId = ctx.from?.id;
  if (tgId && engine) {
    try {
      const user = await engine.getUserByTelegramId(tgId);
      if (user?.language_code && ['en', 'ko', 'ru', 'tr', 'vi', 'id'].includes(user.language_code)) {
        return user.language_code as SupportedLang;
      }
    } catch {}
  }
  // STRICT DEFAULT: Always return English if no language is explicitly set in our DB!
  return 'en';
}

export function createBot(engine: TradingEngine): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  setupCommunityFeatures(bot);
  setupInviteMemberSync(bot, engine);

  // Admin 전용. 일반 사용자가 /premium 입력해도 자기 자신에게 부여 안 됨.
  // 결제 경로는 /premium 명령 X, PremiumTab 의 PricingCard → Stars 결제만.
  bot.command('premium', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!isAdmin(userId)) {
      // 비-admin: PremiumTab 으로 안내
      const lang = await getLang(ctx, engine);
      const loc = botLocales[lang];
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?lang=${lang}&v=${Date.now()}` : env.WEBAPP_URL;
      const kb = new InlineKeyboard();
      if (isHttps) kb.webApp(loc.btnOpenTerminal, cacheBustedUrl);
      await ctx.reply('Open the terminal → Academy tab → Subscribe with Telegram Stars.', { reply_markup: kb });
      return;
    }
    // Admin: 수동 grant (디버깅용)
    import('./services/premiumCache.js').then(({ grantManualPremium }) => {
      grantManualPremium(userId);
    });
    await ctx.reply('✅ [admin] Manual premium granted to your account.');
  });

  const playHandler = async (ctx: Context) => {
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    const isHttps = env.WEBAPP_URL.startsWith('https://');
    const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?lang=${lang}&v=${Date.now()}` : env.WEBAPP_URL;
    const kb = new InlineKeyboard();
    if (isHttps) {
      kb.webApp(loc.btnOpenTerminal, cacheBustedUrl);
    }
    await ctx.reply(loc.startCaption, { reply_markup: kb });
  };
  bot.command('play', playHandler);
  bot.command('trade', playHandler);

  bot.command('broadcast', async (ctx) => {
    const userId = ctx.from?.id;
    if (!isAdmin(userId)) return;
    
    const message = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (!message) {
      await ctx.reply('Usage: /broadcast message');
      return;
    }

    await ctx.reply('🚀 Broadcasting...');
    let success = 0;
    let fail = 0;
    
    try {
      const allIds = await engine.getAllTelegramIds();
      for (const tgId of allIds) {
        try {
          await bot.api.sendMessage(tgId, `📢 *Announcement*\n\n${message}`, { parse_mode: 'Markdown' });
          success++;
        } catch (e) {
          fail++;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await ctx.reply(`✅ Broadcast complete\n- Success: ${success}\n- Fail: ${fail}`);
    } catch (err) {
      console.error('[bot] broadcast error:', err);
      await ctx.reply('⚠️ Error during broadcast.');
    }
  });

  bot.command('signal', async (ctx) => {
    const userId = ctx.from?.id;
    if (!isAdmin(userId)) return;
    
    const message = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (!message) {
      await ctx.reply('Usage: /signal message');
      return;
    }

    await ctx.reply('🚀 Broadcasting signal...');
    let success = 0;
    
    const isHttps = env.WEBAPP_URL.startsWith('https://');
    const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?v=${Date.now()}` : env.WEBAPP_URL;

    const signalKb = new InlineKeyboard()
      .url('💎 VIP Lounge', 'https://t.me/academy_premium_ch').row();
    if (isHttps) {
      signalKb.webApp('📱 Open App', cacheBustedUrl);
    }

    try {
      const allIds = await engine.getAllTelegramIds();
      for (const tgId of allIds) {
        try {
          await bot.api.sendMessage(tgId, `🚨 *VIP MARKET SIGNAL* 🚨\n\n${message}`, { 
            parse_mode: 'Markdown',
            reply_markup: signalKb 
          });
          success++;
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await ctx.reply(`✅ Signal broadcast complete (Success: ${success})`);
    } catch (err) {
      console.error('[bot] signal error:', err);
    }
  });

  bot.command('start', async (ctx) => {
    const tgUser = ctx.from;
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    if (!tgUser) {
      await ctx.reply(loc.userInfoError);
      return;
    }

    try {
      const { user, isNew } = await engine.upsertUser({
        telegram_id: tgUser.id,
        username: tgUser.username ?? null,
        first_name: tgUser.first_name ?? null,
        language_code: lang,
      });

      const { granted, balance: seedBalance } = await engine.grantInitialSeed(user.id);

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?lang=${lang}&v=${Date.now()}` : env.WEBAPP_URL;
      
      if (isGroup) {
        const shortKb = new InlineKeyboard();
        if (isHttps) {
          shortKb.webApp(loc.btnOpenTerminal, cacheBustedUrl);
        }
        await ctx.replyWithPhoto('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop', {
          caption: loc.startCaption,
          parse_mode: 'Markdown',
          reply_markup: shortKb
        });
        return;
      }

      const cryptoMemes = [
        'https://media.giphy.com/media/trN9ht5RlE3Dcwavg2/giphy.gif',
        'https://media.giphy.com/media/Y2ZUWLrTy63j9T6qrK/giphy.gif',
        'https://media.giphy.com/media/JtBZm3Getg3dqxEXCG/giphy.gif',
      ];
      const welcomeGifUrl = cryptoMemes[Math.floor(Math.random() * cryptoMemes.length)]!;

      const langKb = new InlineKeyboard();
      if (isHttps) {
        langKb.webApp(loc.btnOpenTerminal, cacheBustedUrl).row();
      }
      langKb
        .text('🇺🇸 EN', 'lang_en')
        .text('🇰🇷 KO', 'lang_ko')
        .text('🇷🇺 RU', 'lang_ru').row()
        .text('🇹🇷 TR', 'lang_tr')
        .text('🇻🇳 VI', 'lang_vi')
        .text('🇮🇩 ID', 'lang_id').row()
        .text(loc.btnHowItWorks, CB_HOW)
        .url(loc.btnCommunity, env.COMMUNITY_GROUP_URL);

      await ctx.replyWithAnimation(welcomeGifUrl, {
        caption: loc.startLines.join('\n'),
        parse_mode: 'Markdown',
        reply_markup: langKb,
      });

      if (isHttps) {
        bot.api.setChatMenuButton({
          chat_id: tgUser.id,
          menu_button: {
            type: 'web_app',
            text: loc.btnOpenTerminal.replace(/[^a-zA-Z\s]/g, '').trim(), // Ensure it's short
            web_app: { url: cacheBustedUrl }
          }
        }).catch(err => console.error('[bot] menu btn error:', err));
      }

    } catch (err) {
      console.error('[bot] /start error:', err);
      await ctx.reply(loc.startError);
    }
  });

  bot.callbackQuery(/lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1] as SupportedLang;
    
    try {
      if (ctx.from) {
        await engine.upsertUser({
          telegram_id: ctx.from.id,
          username: ctx.from.username ?? null,
          first_name: ctx.from.first_name ?? null,
          language_code: lang
        });
      }
    } catch(e) {}

    const loc = botLocales[lang] || botLocales['en'];

    if (ctx.msg && ctx.msg.reply_markup) {
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?lang=${lang}&v=${Date.now()}` : env.WEBAPP_URL;
      
      const newKb = new InlineKeyboard();
      if (isHttps) {
        newKb.webApp(loc.btnOpenTerminal, cacheBustedUrl).row();
      }
      newKb
        .text('🇺🇸 EN', 'lang_en')
        .text('🇰🇷 KO', 'lang_ko')
        .text('🇷🇺 RU', 'lang_ru').row()
        .text('🇹🇷 TR', 'lang_tr')
        .text('🇻🇳 VI', 'lang_vi')
        .text('🇮🇩 ID', 'lang_id').row()
        .text(loc.btnHowItWorks, CB_HOW)
        .url(loc.btnCommunity, env.COMMUNITY_GROUP_URL);

      await ctx.editMessageCaption({
        caption: loc.startLines.join('\n'),
        parse_mode: 'Markdown',
        reply_markup: newKb
      });

      if (isHttps && ctx.from) {
        bot.api.setChatMenuButton({
          chat_id: ctx.from.id,
          menu_button: {
            type: 'web_app',
            text: loc.btnOpenTerminal.replace(/[^a-zA-Z\s]/g, '').trim(), // Strip emojis for menu button
            web_app: { url: cacheBustedUrl }
          }
        }).catch(err => console.error('[bot] menu btn error:', err));
      }
    }

    await ctx.answerCallbackQuery({
      text: loc.langSet,
      show_alert: true,
    });
  });

  bot.command('balance', async (ctx) => {
    const tgUser = ctx.from;
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    if (!tgUser) {
      await ctx.reply(loc.userInfoError);
      return;
    }

    try {
      const user = await engine.getUserByTelegramId(tgUser.id);
      if (!user) {
        await ctx.reply(loc.enrollFirst);
        return;
      }

      const wallet = await engine.getWallet(user.id);
      if (!wallet) {
        await ctx.reply(loc.noWallet);
        return;
      }

      const openCount = await engine.countOpenPositions(user.id);
      const status = wallet.is_liquidated ? loc.resetRequired : loc.active;
      const text = loc.balance
        .replace('{{balance}}', formatBalance(wallet.balance))
        .replace('{{status}}', status)
        .replace('{{count}}', openCount.toString());

      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot] /balance error:', err);
      await ctx.reply(loc.startError);
    }
  });

  bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
  });

  // Stage 20 — algorithmic trader performance lookup. Public (read-only stats).
  bot.command('stats', async (ctx) => {
    const arg = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const days = arg && /^\d+$/.test(arg) ? Math.min(parseInt(arg, 10), 90) : 30;
    try {
      const stats = await computeStats(days);
      const message = formatStatsForTelegram(stats);
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[stats] command error:', err);
      await ctx.reply('Stats unavailable. Please try again shortly.');
    }
  });

  bot.command('whereami', async (ctx) => {
    const c = ctx.chat;
    const title = 'title' in c ? c.title : 'username' in c ? `@${c.username}` : '(private)';
    const fromId = ctx.from?.id ?? '?';
    console.log(`[whereami] chat_id=${c.id} type=${c.type} title=${title} from=${fromId}`);
    await ctx.reply(`chat_id: \`${c.id}\`\ntype: ${c.type}\ntitle: ${title}\nfrom_user_id: \`${fromId}\``, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery(CB_HOW, async (ctx) => {
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    await ctx.answerCallbackQuery();
    await ctx.reply(loc.howItWorks, { parse_mode: 'Markdown' });
  });

  bot.catch((err) => {
    console.error('[bot] error:', err);
  });

  return bot;
}
