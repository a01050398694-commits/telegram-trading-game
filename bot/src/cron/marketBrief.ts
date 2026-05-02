import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import OpenAI from 'openai';
import { env } from '../env.js';
import { webAppDeepLink } from '../lib/webappUrl.js';
import type { PriceCache } from '../priceCache.js';
import { checkAndIncrementCallBudget } from '../services/ai.js';

let openai: OpenAI | null = null;
if (env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export class MarketBriefCron {
  private timer: NodeJS.Timeout | null = null;
  private lastPrices: Record<string, number> = {};
  private dynamicChatId: string | null = null;

  constructor(
    private readonly bot: Bot,
    private readonly priceCache: PriceCache
  ) {}

  start() {
    // 10~15분 주기 랜덤화
    this.scheduleNextTick();
    // 서버 구동 시 초기화용으로 한번 호출 (발송은 안함)
    this.recordPrices();
  }

  private scheduleNextTick() {
    if (this.timer) clearTimeout(this.timer);
    // 10 to 15 mins
    const minMs = 10 * 60 * 1000;
    const maxMs = 15 * 60 * 1000;
    const nextMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    this.timer = setTimeout(() => {
      void this.tick();
      this.scheduleNextTick();
    }, nextMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private recordPrices() {
    const snap = this.priceCache.snapshot();
    for (const key of Object.keys(snap)) {
      const val = snap[key];
      if (val !== undefined) {
        this.lastPrices[key] = val;
      }
    }
  }

  async forceTick(chatId: string) {
    this.dynamicChatId = chatId;
    await this.tick();
  }

  private async tick() {
    const targetChat = this.dynamicChatId || env.COMMUNITY_CHAT_ID;
    if (!targetChat || !openai) return;

    try {
      const snap = this.priceCache.snapshot();
      const btcNow = snap['btcusdt'];
      const ethNow = snap['ethusdt'];
      const solNow = snap['solusdt'];

      if (!btcNow || !ethNow) return;

      const btcOld = this.lastPrices['btcusdt'] || btcNow;
      const ethOld = this.lastPrices['ethusdt'] || ethNow;

      const btcChange = btcOld ? ((btcNow - btcOld) / btcOld) * 100 : 0;
      const ethChange = ethOld ? ((ethNow - ethOld) / ethOld) * 100 : 0;

      // 기록 갱신
      this.recordPrices();

      // 주제 로테이션
      const hooks = [
        `"Use RSI or current chart to nudge practice trading. e.g. 'RSI's overbought af, short setup brewing? practice it first!'"`,
        `"Stir competitive ranking energy. e.g. 'today's #1 PnL is INSANE. think you can crack the elite club?'"`,
        `"Brief market + push scalping practice. e.g. 'BTC chopping. perfect for alt scalps — wanna sharpen entries?'"`
      ];
      const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];

      const prompt = `Current BTC: $${btcNow?.toFixed(2)}, ETH: $${ethNow?.toFixed(2)}. (Change vs last tick — BTC: ${btcChange > 0 ? '+' : ''}${btcChange.toFixed(2)}%, ETH: ${ethChange > 0 ? '+' : ''}${ethChange.toFixed(2)}%).
Drop a casual line into a Telegram trading community based on this data — like you're starting convo, not briefing.
Today's vibe: ${selectedHook}
- Length: 2-3 sentences, super short.
- NEVER sound like a market report. Talk like a real trader — slang welcome (rekt, ngmi, moon, lfg, etc.) + emojis.
- Slip in a nudge to tap the deep-link button mid-message.`;

      if (!checkAndIncrementCallBudget()) return;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 200,
      });

      const brief = response.choices[0]?.message?.content?.trim();
      if (!brief) return;

      const kb = new InlineKeyboard().url('🚀 Start Practice Trading', webAppDeepLink('market_brief'));

      await this.bot.api.sendMessage(targetChat, brief, {
        parse_mode: 'HTML',
        reply_markup: kb
      });
      console.log(`[marketBrief] Sent market update to ${targetChat}`);
    } catch (err) {
      console.error('[marketBrief] error:', err);
    }
  }
}
