import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { env } from '../env.js';
import { webAppDeepLink } from '../lib/webappUrl.js';
import type { PriceCache } from '../priceCache.js';
import {
  fetchMultiTimeframeKlines,
  type FuturesSymbol,
} from '../services/marketData.js';
import {
  computeRSI,
  computeSMA,
  computeEMA,
  computeMACD,
  computeATR,
  detectMACDCross,
  type TAIndicators,
} from '../lib/ta.js';
import { buildSignal } from '../services/signalEngine.js';
import { getSignalCommentary } from '../services/ai.js';
import { getFullMacroSnapshot } from '../services/macroBundle.js';

const SIGNAL_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] as const;
const DISCLAIMER = '';
const COOLDOWN_MS = 2 * 3600_000;
const SKIP_COOLDOWN_MS = 1 * 3600_000;
const HOURLY_CAP = 8;
const DAILY_CAP = 50;
const TICK_INTERVAL_MS = 30 * 60_000;
const SYMBOL_SPACING_MS = 1500;

/**
 * Compute the full TAIndicators bag from raw OHLC arrays.
 * Pivot is left null here — caller can derive from last closed candle if needed.
 * Mirrors AskBit fetchTAIndicators's local computations but without I/O.
 */
export function computeAllIndicators(
  closes: number[],
  highs: number[],
  lows: number[],
  symbol: string
): TAIndicators {
  const currentPrice = closes.at(-1) ?? 0;
  return {
    symbol,
    rsi14: computeRSI(closes, 14),
    sma20: computeSMA(closes, 20),
    sma50: computeSMA(closes, 50),
    sma200: computeSMA(closes, 200),
    ema12: computeEMA(closes, 12),
    ema26: computeEMA(closes, 26),
    macd: computeMACD(closes),
    atr14: computeATR(highs, lows, closes, 14),
    macdCross: detectMACDCross(closes),
    pivotLevels: null,
    support: null,
    resistance: null,
    currentPrice,
    priceChange30d: 0,
  };
}

export class SignalCron {
  private timer: NodeJS.Timeout | null = null;
  private hourlyCount = 0;
  private hourlyResetAt = 0;
  private dailyCount = 0;
  private dailyResetAt = 0;
  private lastPostedAt = new Map<string, number>();
  private lastSkipPostedAt = new Map<string, number>();

  constructor(
    private readonly bot: Bot,
    private readonly priceCache: PriceCache
  ) {
    const now = Date.now();
    this.hourlyResetAt = now + 3600_000;
    this.dailyResetAt = now + 86400_000;
  }

  start(): void {
    if (!env.COMMUNITY_CHAT_ID) {
      console.warn('[signalCron] COMMUNITY_CHAT_ID missing, signals disabled');
      return;
    }
    console.log(
      `[signalCron] start — interval=${TICK_INTERVAL_MS / 60_000}min, dryRun=${env.SIGNAL_CRON_DRY_RUN}`
    );
    console.log('[signalCron] firing immediate first tick on boot');
    void this.tick().finally(() => this.scheduleNext());
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNext());
    }, TICK_INTERVAL_MS);
  }

  private resetCountersIfDue(): void {
    const now = Date.now();
    if (now >= this.hourlyResetAt) {
      this.hourlyCount = 0;
      this.hourlyResetAt = now + 3600_000;
    }
    if (now >= this.dailyResetAt) {
      this.dailyCount = 0;
      this.dailyResetAt = now + 86400_000;
    }
  }

  private async tick(): Promise<void> {
    if (!env.COMMUNITY_CHAT_ID) return;
    this.resetCountersIfDue();

    const isDryRun = env.SIGNAL_CRON_DRY_RUN === 'true';
    const snap = this.priceCache.snapshot();
    // Why: macro context (DXY/BTC.D/news/ETF/correlation) is shared across all symbols this tick.
    // 30-min internal cache, so a tick every 30 min refetches; per-source safeCollect on top.
    const macro = await getFullMacroSnapshot();

    for (const symbol of SIGNAL_SYMBOLS) {
      try {
        if (this.hourlyCount >= HOURLY_CAP) {
          console.log('[signalCron] hourly cap reached, stopping this tick');
          break;
        }
        if (this.dailyCount >= DAILY_CAP) {
          console.log('[signalCron] daily cap reached, stopping this tick');
          break;
        }

        const lastPosted = this.lastPostedAt.get(symbol) ?? 0;
        if (Date.now() - lastPosted < COOLDOWN_MS) continue;

        const mtf = await fetchMultiTimeframeKlines(symbol as FuturesSymbol);
        if (!mtf) {
          console.warn(`[signalCron] fetchMultiTimeframeKlines null for ${symbol}, skipping`);
          continue;
        }

        const livePrice = snap[symbol.toLowerCase()];
        const lastClose = mtf.h1.closes.at(-1) ?? mtf.d1.closes.at(-1) ?? 0;
        const currentPrice = livePrice ?? lastClose;

        const signal = buildSignal({
          symbol: symbol as FuturesSymbol,
          currentPrice,
          klines: mtf,
        });

        if (signal.direction === 'skip') {
          const lastSkip = this.lastSkipPostedAt.get(symbol) ?? 0;
          if (Date.now() - lastSkip < SKIP_COOLDOWN_MS) continue;
        }

        if (isDryRun) {
          console.log('[signalCron][DRY]', JSON.stringify(signal));
        } else {
          const commentary = await getSignalCommentary({ ...signal, macro });
          const kb = new InlineKeyboard().url(
            '🚀 Practice This Setup',
            webAppDeepLink('signal')
          );
          await this.bot.api.sendMessage(
            env.COMMUNITY_CHAT_ID,
            commentary + DISCLAIMER,
            { reply_markup: kb, parse_mode: 'Markdown' }
          );
          console.log(
            `[signalCron] posted ${signal.direction} ${symbol} score=${signal.score}`
          );
        }

        if (signal.direction === 'skip') {
          this.lastSkipPostedAt.set(symbol, Date.now());
        } else {
          this.lastPostedAt.set(symbol, Date.now());
        }
        this.hourlyCount++;
        this.dailyCount++;

        await new Promise((r) => setTimeout(r, SYMBOL_SPACING_MS));
      } catch (err) {
        // Why: any single-symbol failure must not abort the whole tick.
        console.warn(`[signalCron] symbol ${symbol} error:`, err);
      }
    }
  }
}
