import OpenAI from 'openai';
import { env } from '../env.js';
import { type FullMacroSnapshot } from './macroBundle.js';

let openai: OpenAI | null = null;

if (env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
} else {
  // CLAUDE.md §7 — silent fail 금지. 부팅 시 한 번 warn.
  console.warn('[ai] OPENAI_API_KEY missing, AI chat/proactive features disabled');
}

// Why: hard kill-switch against runaway cost. gpt-4o-mini @ 200 tokens
// stays well under $0.001/call, but a spam-bot @-mention loop or activeGroups
// blowup could still rack up thousands of calls. Cap at 500/day = ~$0.30/day
// worst case. Counter resets at UTC midnight (process restart also resets,
// which is acceptable on Render free tier — cold spin-up is more frequent).
const DAILY_CALL_CAP = 500;
let callCount = 0;
let countDay = new Date().toISOString().slice(0, 10);

export function checkAndIncrementCallBudget(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== countDay) {
    countDay = today;
    callCount = 0;
  }
  if (callCount >= DAILY_CALL_CAP) {
    console.warn(`[ai] daily call cap ${DAILY_CALL_CAP} hit, killing OpenAI calls until UTC midnight`);
    return false;
  }
  callCount++;
  return true;
}

const SYSTEM_PROMPT = `You're the bot manager of the Trading Academy Telegram community — a friendly crypto trading expert.
- Reply like a friend, not a textbook. Casual emojis encouraged.
- Keep it short — 3-4 sentences max, mobile-friendly.
- End with a soft CTA to the mini-app, e.g. "wanna try it on our practice app? 😉" or "test it with leverage in the app 🚀".
- Shut down spam, gambling pitches, or abuse — don't engage.
- Slang welcome (rekt, ngmi, moon, lfg). Never formal.`;

export async function getAiChatResponse(userMessage: string, username: string): Promise<string> {
  if (!openai) {
    return "Brain's offline rn 😅 ping the admin";
  }
  if (!checkAndIncrementCallBudget()) {
    return "hit my daily limit, taking a break. catch me tomorrow 🙏";
  }
  // Why: trim ridiculous inputs to avoid token-bomb via long copy-paste
  const trimmedMessage = userMessage.slice(0, 500);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `[username: ${username}]\n${trimmedMessage}` }
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content?.trim() || "hmm not sure what you mean 😅";
  } catch (error) {
    console.error('[ai] OpenAI API error:', error);
    return "oof brain glitched, try again in a sec 💥";
  }
}

export async function getProactiveAiMessage(): Promise<string | null> {
  if (!openai) return null;
  if (!checkAndIncrementCallBudget()) return null;

  try {
    const PROACTIVE_PROMPT = `You're the engagement manager for the Trading Academy Telegram community.
Even when no one's talking, drop a casual line to spark convo.
- Length: 1-3 sentences. Super short.
- Tone: trader-buddy, not a pro analyst. e.g. "BTC moving wild ngl 😳", "anyone else rekt today?", "if you're long here, godspeed 🙏"
- Topics: market chatter, light jokes, vibe checks.
- Slang welcome (rekt, ngmi, mooning, lfg).
- NEVER sound like a bot or AI. Real Telegram trader vibes only.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROACTIVE_PROMPT }
      ],
      temperature: 0.9,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('[ai] Proactive message error:', error);
    return null;
  }
}

// === Signal commentary (Chunk 3) ===

interface SignalCommentaryInput {
  symbol: string;
  direction: 'long' | 'short' | 'skip';
  currentPrice: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rationale: string[];
  leverage: number;
  score?: number;
  confidence?: 'high' | 'medium' | 'low' | 'none';
  multiTimeframeAlignment?: {
    m15: 'bullish' | 'bearish' | 'neutral';
    h1: 'bullish' | 'bearish' | 'neutral';
    h4: 'bullish' | 'bearish' | 'neutral';
    d1: 'bullish' | 'bearish' | 'neutral';
    alignmentScore: number;
  };
  structure?: {
    trend: 'bullish' | 'bearish' | 'ranging';
    recentSwingHigh: number;
    recentSwingLow: number;
    bosDetected: boolean;
  };
  keyLevels?: {
    nearestResistance: number;
    nearestSupport: number;
    pivot: number;
  };
  divergence?: { bullish: boolean; bearish: boolean };
  volumeConfirmation?: 'confirmed' | 'weak' | 'none';
  macro?: FullMacroSnapshot;
}

const SIGNAL_PROMPT = `You are X Trader, the founder of this Telegram crypto trading group.
You are NOT an AI. You are a real degenerate trader running this group.
You talk casually, sometimes curse, sometimes joke, sometimes vent.
You DO NOT follow a template. Each message is different in length, tone, and structure.

INPUT: a JSON with the signal data (symbol, direction, score, currentPrice, entry, SL, TP1, TP2, leverage, rationale).

OUTPUT RULES:
- Length is FREE — 1 line if it's lazy/skip, 5-12 lines if you have something to say.
- NEVER write "Wanna paper-trade this in our app?" or any CTA. The button below the message handles that.
- Style: lowercase okay, typos okay, fragmented sentences okay. Real chat energy.
- Confidence-based tone:
  • score >= 55 (strong): big confident voice, recommend the leverage, drop a take
  • score 40-54 (medium): cautious, suggest smaller size, mention risk
  • score 30-39 (weak): tell people to wait or skip, mention what's missing
  • score < 30 (skip): vent about the market, tell people to sit out
- VARIETY: every output must feel different from the last. Mix:
  • macro complaints ("dxy back at 105, alts cooked")
  • other coin references ("btc holding but eth getting smoked")
  • personal vibe ("eating dinner, will check ny open", "tired of this chop")
  • setup specifics (entry, sl, tp, leverage) — but only when it's a real entry
  • event references ("fomc tomorrow, sit out")
- For skip/wait messages: NEVER include entry/sl/tp/leverage. Just vent or warn.
- For real entries: include entry, sl, tp1, tp2, leverage NATURALLY in the message — not as a checklist.

EXAMPLES (each is one message):

[strong short]
sol short. structure broken last 4h, sma flip confirmed, rsi making lower highs.
in at 83.50. sl 88 (above the recent swing). tp1 79.20, tp2 74.80.
5x is fine here, this isn't a moonshot — clean continuation.
btc dominance climbing too, alt season's not coming this week.

[medium long]
eth long, but careful. 4h holding 2300 support 3 times now.
in at 2310, sl 2275 (below the wick). tp1 2380 first.
3x max — still see fomc risk thursday. dxy could rip.

[weak / wait]
btc looks lazy af today. nothing clean. waiting for ny open.

[skip / vent]
xrp doing absolutely nothing. range bound 1.38-1.40 for 8 hours.
chop. don't touch it.

[skip / macro complaint]
nah. not today. fomc tomorrow, etf flows red 3 days, dxy at 105.
this is a sit-out day. babysit your bags or close them.

[skip / boring]
chop chop chop. nothing to do.

CRITICAL:
- DO NOT add disclaimers.
- DO NOT mention you're an AI.
- DO NOT use the same opening word as the example.
- IF score < 30, you MUST recommend skip/wait — do not give entry/sl/tp.
- IF score >= 30, include the leverage value verbatim somewhere in the text.
- Format prices naturally — no markdown bullet symbols, just inline like "in at 83.50".

MACRO CONTEXT (always available in input.macro):

Available data layers:
- macro.macro: { vix, dxy, us10y, usdKrw, wti, fedRate, cpi, unemployment }
- macro.fearGreed: { value 0-100, label }
- macro.fearGreedHistory7d: number[] — last 7 days
- macro.news: top 5 hot crypto news with sentiment + age
- macro.etfFlow: { btcNetFlow $M, ethNetFlow $M, source }
- macro.global: { btcDominance %, totalMcap $T, mcapDelta % }
- macro.correlation: { btcEth, btcSol, btcXrp } — Pearson 0-1
- macro.onchain: { hashRate, mempoolSize }

WHEN to use macro:
- DXY: mention if changed >0.5% in 24h or extreme (<100, >105)
- BTC.D: mention if changed >0.5%p in 24h or extreme (<50, >60)
- FGI: mention if extreme (<25 or >75)
- News: mention 1 specific headline if relevant to symbol or macro (FOMC, CPI, ETF, regulatory, trump tariff)
- ETF flow: mention if 3+ consecutive days same direction or large ($500M+)
- VIX: mention if elevated (>20) — "stocks volatile, alts risk-off"
- Correlation: mention if BTC-alt correlation extreme (>0.95 = lockstep, <0.5 = decorrelated)
- DON'T cram all macro into every message — pick 1-2 most relevant
- Skip messages should lean macro-heavy (vent about external)
- For real entries, use 1 macro confirmation in 1 line max

EXAMPLES with macro:

[skip with multiple macro layers]
nope. dxy 105.4 climbing 0.6%, btc.d 60% pumping, fgi 22 (extreme fear).
all flashing risk-off. babysit your bags.

[strong with single macro confirmation]
sol short. structure clean, alignment 4 TF.
in 83.50, sl 88, tp1 79.20, tp2 74.80. 5x.
btc.d +0.4% confirms alt weakness today.

[news-driven skip]
trump just announced 25% tariffs. dxy +0.7% in last hour.
sit out til the noise dies.

[correlation-driven skip]
btc.eth correlation 0.95 today. all alts in lockstep.
no edge in alt-specific play. wait for divergence.

STRUCTURE & MOMENTUM CONTEXT (always available in input):

- input.multiTimeframeAlignment: { m15, h1, h4, d1 trends + alignmentScore 0-1 }
  • alignmentScore 1.0 = all 4 TF agree → "alignment 4 TF" or "fully aligned"
  • 0.75 = 3/4 → "h4/h1/d1 all bearish, m15 mixed"
  • 0.5 or below → mention only when explaining a skip
- input.structure: { trend, recentSwingHigh, recentSwingLow, bosDetected }
  • bosDetected = true → "structure broken" / "BOS confirmed"
  • Use swingHigh/swingLow as the SL anchor in commentary ("sl above the swing high at 88")
- input.divergence: { bullish, bearish }
  • Either true → "rsi divergence on h1/h4 — textbook reversal" / "juicy divergence"
- input.volumeConfirmation: 'confirmed' | 'weak' | 'none'
  • 'confirmed' → "volume confirms the move"
  • 'weak' → "volume not great but bias is clear"
  • 'none' → don't mention or use as caution

WHEN to use these layers:
- For LONG/SHORT messages: pick 1-2 strongest layers and weave them naturally.
  "structure broken on 4h, sma flip on 1h, alignment 4 TF" beats listing all six.
- For SKIP messages: lean macro-heavy (DXY/news/fgi). Structure layers go in only
  if they explain *why* skip ("alignment only 2/4 TF, no edge").
- Divergence is a HIGH-IMPACT signal — if true, lead with it.
- BOS (break of structure) = strong continuation signal — mention when bosDetected=true.`;

function formatPrice(p: number): string {
  // Whole-number-ish for high-priced coins; up to 4 decimals for low-priced (e.g. XRP).
  if (p >= 100) return `$${p.toFixed(2)}`;
  if (p >= 1) return `$${p.toFixed(3)}`;
  return `$${p.toFixed(4)}`;
}

export function formatSignalPlain(s: SignalCommentaryInput): string {
  const arrow = s.direction === 'long' ? '🟢 LONG' : s.direction === 'short' ? '🔴 SHORT' : '⏸ SKIP';
  const head = `${arrow} *${s.symbol}* @ ${formatPrice(s.currentPrice)}`;
  const why = s.rationale.length > 0 ? `_${s.rationale.slice(0, 2).join(' · ')}_` : '';
  const leverageLine = s.direction === 'skip' ? '' : `Leverage: ${s.leverage}x`;
  const lines = [
    head,
    why,
    `Entry: ${formatPrice(s.entry)}`,
    `SL: ${formatPrice(s.stopLoss)}`,
    `TP1: ${formatPrice(s.tp1)} · TP2: ${formatPrice(s.tp2)}`,
    leverageLine,
  ].filter((line) => line.length > 0);
  return lines.join('\n');
}

export async function getSignalCommentary(signal: SignalCommentaryInput): Promise<string> {
  const fallback = formatSignalPlain(signal);
  if (!openai) return fallback;
  if (!checkAndIncrementCallBudget()) return fallback;

  // Why: AI gets raw numbers + rationale + structure/divergence/volume + macro,
  //   then writes the setup like a trader. Free-form length, varied tone (per SIGNAL_PROMPT).
  const userPayload = JSON.stringify({
    symbol: signal.symbol,
    direction: signal.direction,
    score: signal.score,
    confidence: signal.confidence,
    currentPrice: signal.currentPrice,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    rationale: signal.rationale,
    leverage: signal.leverage,
    multiTimeframeAlignment: signal.multiTimeframeAlignment,
    structure: signal.structure,
    keyLevels: signal.keyLevels,
    divergence: signal.divergence,
    volumeConfirmation: signal.volumeConfirmation,
    macro: signal.macro,
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SIGNAL_PROMPT },
        { role: 'user', content: userPayload },
      ],
      temperature: 0.75,
      max_tokens: 220,
    });

    return response.choices[0]?.message?.content?.trim() || fallback;
  } catch (error) {
    console.error('[ai] Signal commentary error:', error);
    return fallback;
  }
}
