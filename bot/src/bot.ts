import { Bot, InlineKeyboard, type Context } from 'grammy';
import { env } from './env.js';
import type { TradingEngine } from './engine/trading.js';
import { setupCommunityFeatures } from './engine/community.js';
import { botLocales, SupportedLang } from './locales.js';
import { handleSuccessfulPayment } from './engine/payment.js';

function formatBalance(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
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

  bot.command('premium', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      import('./services/premiumCache.js').then(({ grantManualPremium }) => {
        grantManualPremium(userId);
      });
      const lang = await getLang(ctx, engine);
      const loc = botLocales[lang];
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?lang=${lang}&v=${Date.now()}` : env.WEBAPP_URL;
      const kb = new InlineKeyboard();
      if (isHttps) {
        kb.webApp(loc.btnOpenTerminal, cacheBustedUrl);
      }
      await ctx.reply('✅ Success! Open the terminal to access premium features.', { reply_markup: kb });
    }
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
    if (!userId || String(userId) !== process.env.ADMIN_TG_ID) return;
    
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
    if (!userId || String(userId) !== process.env.ADMIN_TG_ID) return;
    
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

  bot.callbackQuery(CB_HOW, async (ctx) => {
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    await ctx.answerCallbackQuery();
    await ctx.reply(loc.howItWorks, { parse_mode: 'Markdown' });
  });

  // Stage 15.3 — Telegram Stars 인앱 결제 부활.
  // pre_checkout_query 자동 승인 (검증은 invoice 발급 시점에 끝남) + successful_payment
  // 시 payload type 분기로 Premium 활성화 / Recharge 충전 처리.
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      console.error('[bot] pre_checkout_query:', err);
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    try {
      await handleSuccessfulPayment(engine, ctx);
    } catch (err) {
      console.error('[bot] successful_payment:', err);
    }
  });

  bot.catch((err) => {
    console.error('[bot] error:', err);
  });

  return bot;
}
