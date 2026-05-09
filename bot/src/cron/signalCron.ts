import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { env } from '../env.js';
import { webAppDeepLink } from '../lib/webappUrl.js';
import type { PriceCache } from '../priceCache.js';
import {
  fetchMultiTimeframeKlines,
  type FuturesSymbol,
  type MultiTimeframeKlines,
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
import {
  getSignalCommentary,
  STYLE_PRESETS,
  MOOD_PRESETS,
  type SignalStyle,
  type SignalMood,
} from '../services/ai.js';
import { getFullMacroSnapshot } from '../services/macroBundle.js';
// Stage 20 imports
import { detectRegime, applyRegimeFilter } from '../services/marketRegime.js';
import { isInCooldown } from '../services/drawdownBrake.js';
import { formatTradePlan } from '../services/tradePlan.js';
import { trackSignalOutcome, recordNonBroadcast } from '../services/signalOutcome.js';
// Stage 22 imports — validator + dedup
import { validateSignal } from '../services/signalValidator.js';
import { setupHash, checkDuplicate } from '../services/signalDedup.js';
import { dropInProgress } from '../services/marketData.js';
import { createSupabase } from '../db/supabase.js';

interface SignalPreset {
  style: SignalStyle;
  mood: SignalMood;
}

// Why: per-tick shuffle so 4 symbols never share the same (style, mood) — biggest fix
// for the "양산형 봇" repetition that Stage 17 left behind.
function shuffleAndAssign(symbols: readonly string[]): Map<string, SignalPreset> {
  const styles = [...STYLE_PRESETS].sort(() => Math.random() - 0.5);
  const moods = [...MOOD_PRESETS].sort(() => Math.random() - 0.5);
  const map = new Map<string, SignalPreset>();
  symbols.forEach((sym, i) => {
    map.set(sym, {
      style: styles[i % styles.length] as SignalStyle,
      mood: moods[i % moods.length] as SignalMood,
    });
  });
  return map;
}

// Stage 22 — env-driven configuration with restored cooldowns + boot-tick gate.
//   COOLDOWN_MS / SKIP_COOLDOWN_MS were 0 pre-Stage-22 → same setup fired 5× in 2h on
//   2026-05-06 because Render restarts replayed the boot tick. Restored to 60min/15min;
//   the DB-backed setupHash check (G5) catches semantic duplicates within 6h regardless.
const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] as const;
const SIGNAL_SYMBOLS = (env.SIGNAL_SYMBOLS as readonly string[])
  .map((s) => s.toUpperCase())
  .filter((s): s is FuturesSymbol =>
    (SUPPORTED_SYMBOLS as readonly string[]).includes(s)
  );
const DISCLAIMER = '';
const COOLDOWN_MS = 60 * 60_000;
const SKIP_COOLDOWN_MS = 15 * 60_000;
const HOURLY_CAP = 8;
const DAILY_CAP = 60;
const TICK_INTERVAL_MS = env.SIGNAL_TICK_INTERVAL_MIN * 60_000;
const SYMBOL_SPACING_MS = 1500;
// Boot-tick gate: skip the immediate-on-boot tick if any broadcast happened within
// this window. Why: Render free-plan restart loop pre-Stage-22 fired 5 boot ticks in
// 3 hours. Even with dedup, this avoids the cost of running buildSignal for nothing.
const BOOT_TICK_GATE_MS = 30 * 60_000;

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
    // Stage 22 — boot-tick gate. Render free-plan restart loops would otherwise
    //   replay the boot tick on every redeploy. If a broadcast happened in the last
    //   30 minutes, defer to the regular schedule.
    void this.maybeBootTick();
  }

  private async maybeBootTick(): Promise<void> {
    try {
      const supabase = createSupabase();
      const { data, error } = await supabase
        .from('signal_outcomes')
        .select('broadcast_at')
        .in('status', ['open', 'closed'])
        .order('broadcast_at', { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0) {
        const lastTs = new Date(data[0]!.broadcast_at as string).getTime();
        const ageMs = Date.now() - lastTs;
        if (ageMs >= 0 && ageMs < BOOT_TICK_GATE_MS) {
          console.log(
            `[signalCron] skipping boot tick — last broadcast ${Math.round(ageMs / 60_000)}min ago, < ${BOOT_TICK_GATE_MS / 60_000}min gate`,
          );
          this.scheduleNext();
          return;
        }
      }
    } catch (err) {
      console.warn('[signalCron] boot-tick gate check failed, proceeding:', err instanceof Error ? err.message : err);
    }
    console.log('[signalCron] firing immediate first tick on boot');
    void this.tick().finally(() => this.scheduleNext());
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Stage 21 — admin-triggered immediate tick. Used to "send one right now"
  // without waiting for the 83-min interval. Does NOT disturb the schedule:
  // the next regular tick still fires at the same wall-clock as before.
  async forceTick(): Promise<{ posted: boolean; reason?: string }> {
    if (!env.COMMUNITY_CHAT_ID) {
      return { posted: false, reason: 'COMMUNITY_CHAT_ID missing' };
    }
    console.log('[signalCron] forceTick triggered (manual)');
    const before = this.dailyCount;
    await this.tick();
    const after = this.dailyCount;
    return { posted: after > before };
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
    // Stage 21 — outer try/catch makes the cron unkillable: no thrown error
    // from macro fetch, signal build, or send can prevent scheduleNext() from
    // firing. The previous shape relied on the .finally() chain alone, which
    // worked for the timer but emitted unhandled-rejection noise to Sentry
    // every time getFullMacroSnapshot() upstream went down.
    try {
      if (!env.COMMUNITY_CHAT_ID) return;
      this.resetCountersIfDue();

      const isDryRun = env.SIGNAL_CRON_DRY_RUN === 'true';
      const snap = this.priceCache.snapshot();
      // Why: macro context (DXY/BTC.D/news/ETF/correlation) is shared across all symbols this tick.
      // 30-min internal cache, so a tick every 30 min refetches; per-source safeCollect on top.
      // Macro is best-effort — if every source hangs we still post the signal with stale/null
      // macro rather than skipping the entire tick.
      const macro = await getFullMacroSnapshot().catch((err) => {
        console.warn('[signalCron] macro fetch threw, continuing with empty macro:', err instanceof Error ? err.message : err);
        return null as unknown as Awaited<ReturnType<typeof getFullMacroSnapshot>>;
      });
      // Stage 18 — fresh (style, mood) per symbol per tick.
      const presetMap = shuffleAndAssign(SIGNAL_SYMBOLS);

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

        const mtf = await fetchMultiTimeframeKlines(symbol as FuturesSymbol);
        if (!mtf) {
          console.warn(`[signalCron] fetchMultiTimeframeKlines null for ${symbol}, skipping`);
          continue;
        }

        const livePrice = snap[symbol.toLowerCase()];
        const lastClose = mtf.h1.closes.at(-1) ?? mtf.d1.closes.at(-1) ?? 0;
        const currentPrice = livePrice ?? lastClose;

        // Stage 22 — closed-candle-only TA. fetchKlines returns the live in-progress
        //   candle as the last element; we drop it before computing TA so RSI/MACD/
        //   structure don't repaint as the candle evolves.
        const closedMtf: MultiTimeframeKlines = {
          m15: dropInProgress(mtf.m15),
          h1: dropInProgress(mtf.h1),
          h4: dropInProgress(mtf.h4),
          d1: dropInProgress(mtf.d1),
        };
        // Why: SMA200 needs >=200 closed bars. If fetch limit ever drops below 201,
        //   trend resolves to neutral on every TF and we silently broadcast 0 signals
        //   (the 2026-05-09 → 2026-05-10 blackout). Loud warning so this is never
        //   silent again — operators see it in Render logs and can intervene.
        const minClosed = Math.min(
          closedMtf.m15.closes.length,
          closedMtf.h1.closes.length,
          closedMtf.h4.closes.length,
          closedMtf.d1.closes.length,
        );
        if (minClosed < 200) {
          console.warn(
            `[signalCron] ${symbol} closed-bar starvation: ${minClosed} bars < 200 (SMA200 will return null, trend will be neutral). Bump MTF_FETCH_LIMIT in marketData.ts.`,
          );
        }
        const signal = buildSignal({
          symbol: symbol as FuturesSymbol,
          currentPrice,
          klines: closedMtf,
        });

        // Stage 20 — regime filter (BTC.D + DXY + FGI). Suppress alt-LONG in btc-strong, etc.
        const regime = detectRegime(macro);
        const regimeDecision = applyRegimeFilter(symbol, signal.direction, regime);
        if (regimeDecision.shouldSkip && signal.direction !== 'skip') {
          signal.direction = 'skip';
          signal.rationale.push(`regime filter: ${regimeDecision.reason}`);
        }

        // Stage 20 — drawdown brake (5 consecutive losses → 4h cooldown). DB-reconciled.
        const brake = await isInCooldown();
        if (brake.active && signal.direction !== 'skip') {
          signal.direction = 'skip';
          signal.rationale.push(
            `drawdown brake: cooldown until ${new Date(brake.until).toISOString()}`
          );
        }

        // Stage 22 — engine produced a skip → record it so operators can see ticks are alive.
        if (signal.direction === 'skip') {
          const lastSkip = this.lastSkipPostedAt.get(symbol) ?? 0;
          if (Date.now() - lastSkip < SKIP_COOLDOWN_MS) {
            // even cooldown-suppressed skip is recorded so the audit trail is complete
            await recordNonBroadcast({
              signal,
              status: 'skipped',
              validationFailedGate: null,
            }).catch((err) => console.warn('[signalCron] skipped insert err:', err));
            continue;
          }
          await recordNonBroadcast({
            signal,
            status: 'skipped',
            validationFailedGate: null,
          }).catch((err) => console.warn('[signalCron] skipped insert err:', err));
          this.lastSkipPostedAt.set(symbol, Date.now());
          continue;
        }

        // Stage 22 — validator gate (G1..G7, G9). G5 dedup runs after.
        const atr1h = computeATR(
          closedMtf.h1.highs,
          closedMtf.h1.lows,
          closedMtf.h1.closes,
          14,
        );
        const validation = validateSignal(signal, { atr1h, macro, now: Date.now() });
        if (!validation.ok && validation.failure) {
          signal.rationale.push(`validator: ${validation.failure.gate} — ${validation.failure.reason}`);
          await recordNonBroadcast({
            signal,
            status: 'invalid',
            validationFailedGate: validation.failure.gate,
          }).catch((err) => console.warn('[signalCron] invalid insert err:', err));
          console.log(
            `[signalCron] ${symbol} ${signal.direction} rejected by ${validation.failure.gate}: ${validation.failure.reason}`,
          );
          continue;
        }

        // Stage 22 — dedup gate (G5).
        const hash = setupHash(signal);
        const dup = await checkDuplicate(signal);
        if (dup.isDuplicate) {
          signal.rationale.push(
            `dedup: setup_hash=${hash} matched within ${dup.windowHours}h${dup.matchedAt ? ` (last broadcast ${dup.matchedAt})` : ''}`,
          );
          await recordNonBroadcast({
            signal,
            status: 'deduped',
            setupHash: hash,
            dedupWindowHours: dup.windowHours,
          }).catch((err) => console.warn('[signalCron] deduped insert err:', err));
          console.log(`[signalCron] ${symbol} ${signal.direction} deduped: ${hash}`);
          continue;
        }

        // Stage 22 — entry cooldown final guard (per-symbol 60min, in addition to dedup hash).
        const lastPosted = this.lastPostedAt.get(symbol) ?? 0;
        if (Date.now() - lastPosted < COOLDOWN_MS) {
          await recordNonBroadcast({
            signal,
            status: 'deduped',
            setupHash: hash,
            dedupWindowHours: COOLDOWN_MS / 3600_000,
          }).catch((err) => console.warn('[signalCron] cooldown insert err:', err));
          console.log(`[signalCron] ${symbol} symbol cooldown active, skipping`);
          continue;
        }

        if (isDryRun) {
          console.log('[signalCron][DRY]', JSON.stringify({ ...signal, setupHash: hash }));
        } else {
          // Stage 20 — env flag drives commentary mode. Default: trade-plan (no AI fluff).
          const useAi = env.SIGNAL_AI_COMMENTARY === 'true';
          const preset = presetMap.get(symbol);
          const commentary = useAi
            ? await getSignalCommentary({ ...signal, macro }, preset)
            : formatTradePlan(signal, { macro });
          const finalMessage = useAi ? commentary + DISCLAIMER : commentary;
          const kb = new InlineKeyboard().url(
            '🚀 Practice This Setup',
            webAppDeepLink('signal')
          );
          await this.bot.api.sendMessage(
            env.COMMUNITY_CHAT_ID,
            finalMessage,
            // Why: trade-plan is plain text with $, (), %, → that collide with Markdown.
            // AI mode keeps Markdown for *bold* / _italic_ in persona output.
            useAi
              ? { reply_markup: kb, parse_mode: 'Markdown' }
              : { reply_markup: kb }
          );
          console.log(
            `[signalCron] posted ${signal.direction} ${symbol} score=${signal.score} regime=${regime} mode=${useAi ? 'ai' : 'plan'} hash=${hash}`
          );

          // Stage 20 — fire-and-forget outcome tracking. Errors logged inside trackSignalOutcome.
          if (env.SIGNAL_OUTCOME_TRACKING === 'true') {
            void trackSignalOutcome({
              signal,
              entryTime: Date.now(),
              entryPrice: signal.entry,
              setupHash: hash,
            }).catch((err) => console.error('[signalCron] outcome track error:', err));
          }
        }

        this.lastPostedAt.set(symbol, Date.now());
        this.hourlyCount++;
        this.dailyCount++;

        await new Promise((r) => setTimeout(r, SYMBOL_SPACING_MS));
      } catch (err) {
        // Why: any single-symbol failure must not abort the whole tick.
        console.warn(`[signalCron] symbol ${symbol} error:`, err);
      }
    }
    } catch (err) {
      // Stage 21 — outermost guard. Anything that escaped the per-symbol try
      // (macro post-processing, presetMap math, env reads) lands here. We
      // log + return; the .finally() in start()/scheduleNext() still reschedules.
      console.error('[signalCron] tick fatal (caught, will reschedule):', err);
    }
  }
}
