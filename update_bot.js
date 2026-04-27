const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'bot/src/bot.ts');
let content = fs.readFileSync(targetPath, 'utf8');

content = content.replace(
  "import { STARS_PAYLOAD_PREFIX } from './server.js';",
  "import { STARS_PAYLOAD_PREFIX } from './server.js';\nimport { botLocales, SupportedLang } from './locales.js';"
);

// Remove isKorean, buildStartKeyboard, generateLiveChartUrl
content = content.replace(/function isKorean\(ctx: Context\): boolean \{[\s\S]*?\}\n/, '');

// Add getLang
content = content.replace(
  "export function createBot(engine: TradingEngine, context: BotContext): Bot {",
  `async function getLang(ctx: Context, engine?: TradingEngine): Promise<SupportedLang> {
  const tgId = ctx.from?.id;
  if (tgId && engine) {
    try {
      const user = await engine.getUserByTelegramId(tgId);
      if (user?.language_code && ['en', 'ko', 'ru', 'tr', 'vi', 'id'].includes(user.language_code)) {
        return user.language_code as SupportedLang;
      }
    } catch {}
  }
  const tgCode = ctx.from?.language_code?.slice(0, 2);
  if (tgCode && ['en', 'ko', 'ru', 'tr', 'vi', 'id'].includes(tgCode)) {
    return tgCode as SupportedLang;
  }
  return 'en';
}

export function createBot(engine: TradingEngine, context: BotContext): Bot {`
);

// Replace /premium
content = content.replace(
  /bot\.command\('premium', async \(ctx\) => \{[\s\S]*?\}\);/,
  `bot.command('premium', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      import('./services/premiumCache.js').then(({ grantManualPremium }) => {
        grantManualPremium(userId);
      });
      const lang = await getLang(ctx, engine);
      const loc = botLocales[lang];
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? \`\${env.WEBAPP_URL}?lang=\${lang}&v=\${Date.now()}\` : env.WEBAPP_URL;
      const kb = new InlineKeyboard();
      if (isHttps) {
        kb.webApp(loc.btnOpenTerminal, cacheBustedUrl);
      }
      await ctx.reply('✅ Success! Open the terminal to access premium features.', { reply_markup: kb });
    }
  });`
);

// Replace /play
content = content.replace(
  /const playHandler = async \(ctx: Context\) => \{[\s\S]*?bot\.command\('trade', playHandler\);/g,
  `const playHandler = async (ctx: Context) => {
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    const isHttps = env.WEBAPP_URL.startsWith('https://');
    const cacheBustedUrl = isHttps ? \`\${env.WEBAPP_URL}?lang=\${lang}&v=\${Date.now()}\` : env.WEBAPP_URL;
    const kb = new InlineKeyboard();
    if (isHttps) {
      kb.webApp(loc.btnOpenTerminal, cacheBustedUrl);
    }
    await ctx.reply(loc.startCaption, { reply_markup: kb });
  };
  bot.command('play', playHandler);
  bot.command('trade', playHandler);`
);

// Community Guide - just remove it as we have btnCommunity that links directly
content = content.replace(/bot\.command\('community', async \(ctx\) => \{[\s\S]*?\}\);/, '');

// Replace /start body
// We will search for 'bot.command('start', async (ctx) => {' and replace its body up to 'bot.callbackQuery(/lang_(.+)/'
content = content.replace(
  /bot\.command\('start', async \(ctx\) => \{[\s\S]*?bot\.callbackQuery\(\/lang_\(\.\+\)\//,
  `bot.command('start', async (ctx) => {
    const tgUser = ctx.from;
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    if (!tgUser) {
      await ctx.reply(loc.userInfoError);
      return;
    }

    const rawMatch = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const parsedReferrer = rawMatch ? Number(rawMatch) : NaN;
    const referrerTgId =
      Number.isInteger(parsedReferrer) && parsedReferrer > 0 && parsedReferrer !== tgUser.id
        ? parsedReferrer
        : null;

    try {
      let referrerUserId = null;
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
              const text = refLoc.referralBonus.replace('{{balance}}', bonus.referrerBalance.toLocaleString('en-US'));
              await bot.api.sendMessage(
                bonus.referrerTelegramId,
                text,
                { parse_mode: 'Markdown' },
              );
            } catch (notifyErr) {}
          }
        } catch (bonusErr) {}
      }

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? \`\${env.WEBAPP_URL}?lang=\${lang}&v=\${Date.now()}\` : env.WEBAPP_URL;
      
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
      const welcomeGifUrl = cryptoMemes[Math.floor(Math.random() * cryptoMemes.length)];

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
        .url(loc.btnCommunity, env.VIP_CHANNEL_URL);

      await ctx.replyWithAnimation(welcomeGifUrl, {
        caption: loc.startLines.join('\\n'),
        parse_mode: 'Markdown',
        reply_markup: langKb,
      });
    } catch (err) {
      console.error('[bot] /start error:', err);
      await ctx.reply(loc.startError);
    }
  });

  bot.callbackQuery(/lang_(.+)/`
);

// Replace /lang_ handler
content = content.replace(
  /bot\.callbackQuery\(\/lang_\(\.\+\)\/, async \(ctx\) => \{[\s\S]*?\}\);/,
  `bot.callbackQuery(/lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1] as SupportedLang;
    
    // Save to DB
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
      const cacheBustedUrl = isHttps ? \`\${env.WEBAPP_URL}?lang=\${lang}&v=\${Date.now()}\` : env.WEBAPP_URL;
      
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
        .url(loc.btnCommunity, env.VIP_CHANNEL_URL);

      await ctx.editMessageCaption({
        caption: loc.startLines.join('\\n'),
        parse_mode: 'Markdown',
        reply_markup: newKb
      });
    }

    await ctx.answerCallbackQuery({
      text: loc.langSet,
      show_alert: true,
    });
  });`
);

// Replace /balance
content = content.replace(
  /bot\.command\('balance', async \(ctx\) => \{[\s\S]*?\}\);/,
  `bot.command('balance', async (ctx) => {
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
  });`
);

// Replace handleLevelSelection, CB_PREMIUM, CB_COMMUNITY, and CB_HOW
content = content.replace(
  /const handleLevelSelection = async \(ctx: Context, level: string\) => \{[\s\S]*?\};/,
  ''
);

content = content.replace(
  /bot\.callbackQuery\(\/level_\(\.\+\)\/, async \(ctx\) => \{[\s\S]*?\}\);/,
  ''
);

content = content.replace(
  /bot\.callbackQuery\(CB_PREMIUM, async \(ctx\) => \{[\s\S]*?\}\);/,
  ''
);

content = content.replace(
  /bot\.callbackQuery\(CB_COMMUNITY, async \(ctx\) => \{[\s\S]*?\}\);/,
  ''
);

content = content.replace(
  /bot\.callbackQuery\(CB_HOW, async \(ctx\) => \{[\s\S]*?\}\);/,
  `bot.callbackQuery(CB_HOW, async (ctx) => {
    const lang = await getLang(ctx, engine);
    const loc = botLocales[lang];
    await ctx.answerCallbackQuery();
    await ctx.reply(loc.howItWorks, { parse_mode: 'Markdown' });
  });`
);

fs.writeFileSync(targetPath, content);
console.log('Update completed');
