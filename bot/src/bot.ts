import { Bot, InlineKeyboard, type Context } from 'grammy';
import { env } from './env.js';
import type { TradingEngine } from './engine/trading.js';
import { STARS_PAYLOAD_PREFIX, STARS_ELITE_PREFIX } from './server.js';
import { setupCommunityFeatures } from './engine/community.js';
import { botLocales, SupportedLang } from './locales.js';

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

    const rawMatch = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const parsedReferrer = rawMatch ? Number(rawMatch) : NaN;
    const referrerTgId = Number.isInteger(parsedReferrer) && parsedReferrer > 0 && parsedReferrer !== tgUser.id
        ? parsedReferrer : null;

    try {
      let referrerUserId: string | null = null;
      if (referrerTgId !== null) {
        const ref = await engine.getUserByTelegramId(referrerTgId);
        referrerUserId = ref?.id ?? null;
      }

      const { user, isNew } = await engine.upsertUser({
        telegram_id: tgUser.id,
        username: tgUser.username ?? null,
        first_name: tgUser.first_name ?? null,
        language_code: lang,
        referred_by: referrerUserId,
      });

      const { granted, balance: seedBalance } = await engine.grantInitialSeed(user.id);
      let balance = seedBalance;

      let bonusGranted = false;
      if (isNew && referrerTgId !== null && referrerUserId !== null) {
        try {
          const bonus = await engine.grantReferralBonus(user.id, referrerTgId);
          if (bonus) {
            bonusGranted = true;
            balance = bonus.newBalance;
            try {
              const refLang = await getLang({ from: { id: bonus.referrerTelegramId } } as any, engine);
              const refLoc = botLocales[refLang];
              await bot.api.sendMessage(
                bonus.referrerTelegramId,
                refLoc.referralBonus.replace('{{balance}}', formatBalance(bonus.referrerBalance)),
                { parse_mode: 'Markdown' },
              );
            } catch (notifyErr) {}
          }
        } catch (bonusErr) {
          console.error('[bot] grantReferralBonus:', bonusErr);
        }

      }
      void bonusGranted;

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
          language_code: lang,
          referred_by: null
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

  bot.on('pre_checkout_query', async (ctx) => {
    try {
      if (ctx.preCheckoutQuery.invoice_payload.startsWith(STARS_PAYLOAD_PREFIX) || 
          ctx.preCheckoutQuery.invoice_payload.startsWith(STARS_ELITE_PREFIX)) {
        await ctx.answerPreCheckoutQuery(true);
      } else {
        await ctx.answerPreCheckoutQuery(false, 'Invalid payload.');
      }
    } catch (err) {
      console.error('[bot] pre_checkout_query error:', err);
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    const tgId = ctx.from?.id;
    const payment = ctx.message.successful_payment;
    if (!tgId || !payment) return;
    
    try {
      const user = await engine.getUserByTelegramId(tgId);
      if (!user) return;

      if (payment.invoice_payload.startsWith(STARS_ELITE_PREFIX)) {
        await engine.grantStarsPremium(user.id);
        const lang = await getLang(ctx, engine);
        
        let inviteLink = '';
        if (env.PREMIUM_CHAT_ID) {
          try {
            const link = await bot.api.createChatInviteLink(env.PREMIUM_CHAT_ID, {
              member_limit: 1,
              creates_join_request: false
            });
            inviteLink = `\n\nVIP Lounge Access: ${link.invite_link}`;
          } catch (e) {
            console.error('[bot] createChatInviteLink failed:', e);
          }
        }
        
        const lines = [
          `💎 *Elite Lifetime Pass Unlocked!*`,
          `Welcome to the VIP club. All premium features have been unlocked in your terminal.`,
          inviteLink
        ];
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }

      if (payment.invoice_payload.startsWith(STARS_PAYLOAD_PREFIX)) {
        const wallet = await engine.getWallet(user.id);
        if (!wallet) return;

        const { balance } = await engine.revivePaidUser(user.id);

        const lang = await getLang(ctx, engine);
        const loc = botLocales[lang];
        const lines = [
          loc.resetRequired.replace('🔴 *', '✅ *').replace('required', 'Complete').replace('필요', '완료'),
          `Practice balance restored to *${formatBalance(balance)}*.`,
          'Return to the Mini App to continue your lesson.'
        ];
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }
    } catch (err) {
      console.error('[bot] successful_payment failed:', err);
      const lang = await getLang(ctx, engine);
      await ctx.reply(botLocales[lang].error, { parse_mode: 'Markdown' });
    }
  });

  bot.catch((err) => {
    console.error('[bot] error:', err);
  });

  return bot;
}
