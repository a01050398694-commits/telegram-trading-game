import { Bot, InlineKeyboard } from 'grammy';
import OpenAI from 'openai';
import { env } from '../env.js';
import { webAppUrl } from '../lib/webappUrl.js';
import type { PriceCache } from '../priceCache.js';

let openai: OpenAI | null = null;
if (env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

// 10 Distinct Personas
const PERSONAS = [
  "You are a crypto newbie. You ask basic questions, get FOMO easily, and talk casually. Use emojis like 🚀 and 😭.",
  "You are an experienced TA (Technical Analysis) nerd. You talk about support/resistance, RSI, MACD, and moving averages.",
  "You are a meme coin degenerate. You only care about PEPE, DOGE, SHIB. You type in all caps sometimes and say 'LFG' or 'WAGMI'.",
  "You are a bearish skeptic. You think everything is going to crash. You talk about macro economics and interest rates.",
  "You are a whale watcher. You track large transactions and warn people about dumps or pumps.",
  "You are a calm, zen trader. You talk about psychology, discipline, and risk management.",
  "You are a yield farmer who talks about staking and APYs, but you are trying perpetual futures for the first time.",
  "You are an aggressive scalp trader. You are constantly opening 100x leverage trades and sharing your adrenaline rush.",
  "You are a contrarian. If everyone is bullish, you short. If everyone is bearish, you long. You sound a bit arrogant.",
  "You are a helpful community veteran. You welcome people and occasionally remind them to practice on the paper trading app."
];

export class ShillEngine {
  private bots: Bot[] = [];
  private memory: { name: string; text: string }[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private priceCache: PriceCache | null = null;

  constructor() {
    // Initialize bots from tokens
    for (const token of env.SHILL_BOT_TOKENS) {
      if (token && token.length > 10) {
        this.bots.push(new Bot(token));
      }
    }
  }

  setPriceCache(pc: PriceCache) {
    this.priceCache = pc;
  }

  // Called by community.ts when a real user types
  pushUserMessage(username: string, text: string) {
    this.memory.push({ name: username, text });
    if (this.memory.length > 15) {
      this.memory.shift();
    }
  }

  async start() {
    if (this.bots.length === 0 || !openai || !env.COMMUNITY_CHAT_ID) {
      console.log('[ShillEngine] Not enough config to start shill engine.');
      return;
    }
    
    this.isRunning = true;
    this.scheduleNextTick();
    console.log(`[ShillEngine] Started with ${this.bots.length} bots.`);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextTick() {
    if (!this.isRunning) return;
    
    // Random interval between 3 and 10 minutes
    const minMs = 3 * 60 * 1000;
    const maxMs = 10 * 60 * 1000;
    const nextTick = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

    this.timer = setTimeout(() => {
      void this.tick();
    }, nextTick);
  }

  private async tick() {
    if (!this.isRunning || !openai || !env.COMMUNITY_CHAT_ID) return;

    try {
      // Pick a random bot
      const botIndex = Math.floor(Math.random() * this.bots.length);
      const bot = this.bots[botIndex];
      if (!bot) return;
      const persona = PERSONAS[botIndex % PERSONAS.length];

      // Get bot's own name to identify itself in history
      const me = await bot.api.getMe();
      const myName = me.first_name;

      // Construct history
      const historyText = this.memory.length > 0 
        ? this.memory.map(m => `${m.name}: ${m.text}`).join('\n')
        : "(No recent conversation)";

      let marketInfo = '';
      if (this.priceCache) {
        const snap = this.priceCache.snapshot();
        const btc = snap['btcusdt'];
        const eth = snap['ethusdt'];
        const sol = snap['solusdt'];
        if (btc && eth) {
          marketInfo = `\nCurrent Real-time Market Prices: BTC $${btc.toFixed(2)}, ETH $${eth.toFixed(2)}, SOL $${sol?.toFixed(2) ?? 'N/A'}.\n`;
        }
      }

      const systemPrompt = `${persona}
Your name is ${myName}.
You are chatting in a Telegram group called "Trader Club".
Always reply in ENGLISH.
Keep your message to 1-3 sentences. Casual, natural conversational tone.
NEVER act like an AI, an assistant, or a bot. You are a real human trader on Telegram. Use typos, slang (e.g., rekt, ngmi, tbh), and chat formatting naturally.
If there is a conversation history, reply naturally to what others said. If not, start a new topic using the market info.${marketInfo}
Occasionally (about 30% chance), find an excuse to suggest using the Trading Academy mini-app to practice trading.

Recent conversation history:
${historyText}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.85,
        max_tokens: 150,
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (reply) {
        const wantsToShillApp = reply.toLowerCase().includes('app') || reply.toLowerCase().includes('practice');
        let kb: InlineKeyboard | undefined;
        
        if (wantsToShillApp) {
          kb = new InlineKeyboard().webApp('🚀 Play Trading Game', webAppUrl());
        }

        await bot.api.sendMessage(env.COMMUNITY_CHAT_ID, reply, {
          reply_markup: kb
        });

        // Add to memory
        this.pushUserMessage(myName, reply);
        console.log(`[ShillEngine] ${myName} spoke.`);
      }
    } catch (err) {
      console.error('[ShillEngine] tick error:', err);
    } finally {
      this.scheduleNextTick();
    }
  }
}

// Singleton instance
export const shillEngine = new ShillEngine();
