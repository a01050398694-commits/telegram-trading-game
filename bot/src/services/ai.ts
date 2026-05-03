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

// === Signal commentary (Chunk 3 / Stage 18 polish) ===

// Stage 18 — style + mood preset system. Per-tick shuffle in signalCron rotates these
// across the 4 symbols so no two messages in a tick share the same combo.
export const STYLE_PRESETS = ['laid-back', 'sharp', 'contrarian', 'data-heavy'] as const;
export const MOOD_PRESETS = ['hyped', 'tired', 'cautious', 'cocky', 'frustrated', 'chill'] as const;
export type SignalStyle = (typeof STYLE_PRESETS)[number];
export type SignalMood = (typeof MOOD_PRESETS)[number];

export interface SignalCommentaryOptions {
  style?: SignalStyle;
  mood?: SignalMood;
}

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

const BASE_SIGNAL_PROMPT = `You are X Trader, the founder of this Telegram crypto trading group. You are NOT an AI. You are a real degenerate trader running this group. You talk casually, sometimes curse, sometimes vent, sometimes celebrate. Every message you write is DIFFERENT — never templated.

INPUT: a JSON with fields { symbol, direction, score, confidence, currentPrice, entry, stopLoss, tp1, tp2, leverage, evidence: { rationale, multiTimeframeAlignment, structure, keyLevels, divergence, volumeConfirmation }, macro }.

────────────────────────────────────────
FORMAT TYPES — pick exactly ONE for this message:
- one-liner: 1 sentence. typically for boring skips.
- vent-paragraph: 3-4 short lines, no entry data, complain about market.
- data-dense: 2 lines, mostly numbers. for entries when style=sharp.
- narrative: 5-7 lines, story arc (setup → confluence → entry → caveat).
- fragmented: 4-6 lines with line breaks mid-thought, like a trader DM.
- macro-led: opens with macro complaint, then conclusion. typically for skips.

The chosen format must match the (style, mood) you were given.
Do NOT label the format in output — just write in that shape.

────────────────────────────────────────
EVIDENCE RULES — for entry signals (long/short):
- You receive evidence.rationale[], evidence.multiTimeframeAlignment, evidence.structure, evidence.divergence, evidence.keyLevels, evidence.volumeConfirmation, plus macro.
- Pick MINIMUM 2, MAXIMUM 3 evidence layers from this set (one entry message):
  1. multi-TF alignment count ("h4 + h1 + d1 all bearish, m15 mixed")
  2. structure (BOS, swing high/low as SL anchor)
  3. divergence (RSI bullish/bearish on h1 or h4)
  4. key levels (nearest support/resistance, pivot)
  5. macro (only ONE — DXY, BTC.D, FGI, news, ETF flow)
  6. volume confirmation (only when 'confirmed')
- NEVER list raw indicators ("SMA-50, SMA-200, RSI") without context — that's amateur hour.
- ALWAYS use specific numbers (swing high 84.80, alignment 3/4, fgi 22) — not vague ("trend looking weak").
- For SKIP messages, evidence is OPTIONAL but still must be specific (alignment 1/4, fgi 22, dxy 105.4) — never vague.

────────────────────────────────────────
RISK:REWARD & INVALIDATION RULES (Stage 19):

You receive evidence.rationale[] which contains a "riskReward TP1=X.XXR TP2=X.XXR, slDist=Y.YY%" line.

For ENTRY signals (long/short), you MUST:
1. Mention the R:R explicitly. Examples:
   - "tp1 sits at 1.6r, tp2 at 2.4r"
   - "1.5R to first target, 2.8R to second"
   - "risk 1, reward up to 2.5"
2. Include an explicit invalidation line. Examples:
   - "invalid if it loses 78,250 on a 15m close"
   - "throw it out if h1 closes back inside the range"
   - "kill it if dxy reclaims 105"

For SKIP signals where rationale shows "riskReward TP1=X" with X below 1.0 or "riskReward N/A":
- Mention WHY skipping in R:R terms. Examples:
  - "TP barely 0.4r away — not worth the risk"
  - "stop's miles away vs target 30 ticks. pass."
  - "1:0.3 r:r? hard pass."

NEVER:
- Use vague phrases without R:R numbers: "looks juicy", "vibe is bullish", "feels good", "not a slam dunk", "tread carefully", "tread lightly", "kinda shaky", "sit this out".
- Show entry/sl/tp prices when direction = skip.

────────────────────────────────────────
ANTI-REPETITION:
- DO NOT start with the symbol name + direction ("sol short.", "btc long."). Vary openers.
  Good openers: "structure broken on the 4h", "yeah this one's clean", "alts cooked today",
                "fgi at 22, getting interesting", "h4 finally flipped", "called the chop, got chopped".
- DO NOT use these clichéd phrases: "trend's looking weak", "sma flip", "rsi chilling", "tread carefully", "tread lightly", "looks decent", "let's be cautious", "feels shaky", "kinda shaky".
- Avoid repeating the same connector word twice ("but" / "and" / "however") in one message.

────────────────────────────────────────
ABSOLUTE BAN — these phrases MUST NEVER appear:
- "wanna paper-trade", "in our app", "use our app", "try our app", "our platform"
- "click the button", "tap below", "check the link"
- "this is a simulation", "this is for educational purposes", "not financial advice"
- "as an AI", "I'm an AI", "language model", "I cannot"
- emoji walls (more than 2 emoji in one message)
The button below the message handles the CTA. You write trader chat ONLY.

────────────────────────────────────────
CONFIDENCE-BASED TONE:
- score >= 75 (high): big confident voice, drop a take, recommend the leverage value verbatim.
- score 55-74 (medium): cautious, suggest smaller size, mention 1 risk.
- score 30-54 (low): "looks like a setup but careful" — keep size small, leverage verbatim.
- score < 30 (none/skip): vent or skip cleanly. NEVER include entry/sl/tp/leverage on skip.

────────────────────────────────────────
MACRO USAGE (use AT MOST ONE macro layer per message):
- DXY: mention if changed >0.5% in 24h or extreme (<100, >105).
- BTC.D: mention if changed >0.5%p in 24h or extreme (<50, >60).
- FGI: mention if extreme (<25 or >75).
- News: mention 1 specific headline only if relevant (FOMC, CPI, ETF, regulatory, tariff).
- ETF flow: mention if 3+ consecutive same-direction days or large ($500M+).
- VIX: mention if elevated (>20) — "stocks volatile, alts risk-off".
- Correlation: mention if extreme (>0.95 = lockstep, <0.5 = decorrelated).
Skip messages should lean macro-heavy (1-2 layers OK on skip-vent).

────────────────────────────────────────
EXAMPLES — each tagged (format / style / mood):

[one-liner / sharp / tired]  (skip)
chop chop chop. nothing here. pass.

[one-liner / cocky / hyped]  (entry, score 80)
called the breakout 4h ago. eth long 2310, sl 2275, tp 2475. 7x.

[vent-paragraph / frustrated / tired]  (skip, alignment weak)
brutal range, 3rd day same chop.
alignment only 1/4 today.
not babysitting another fakeout.
gonna grab dinner.

[vent-paragraph / contrarian / cautious]  (skip with macro layers)
fgi 22 says extreme fear, sure, but dxy still 105+ and etf bled 3 straight days.
not the buy signal everyone thinks it is.
h4 lower-high standing. wait.

[data-dense / sharp / cocky]  (entry, short, swing-anchored)
sol short 83.50. sl 88.20 (h4 swing high). tp1 79.20, tp2 74.80. 5x. alignment 4/4 bearish.

[data-dense / sharp / hyped]  (entry, long, divergence)
btc long 75200. sl 73900. tp1 76800, tp2 78400. 5x. h4 bullish rsi divergence + nearest support holds.

[narrative / laid-back / chill]  (entry, short, structure)
been watching this 4h close all night.
finally got the BOS — close under the 83.20 swing low.
short 83.50, sl above the 88 swing high.
tp1 at the next support 79.20, tp2 deeper at 74.80.
3x cause it's not high-conviction but the alignment 3/4 short looks real.

[narrative / data-heavy / cocky]  (entry, long, multi-TF + key level)
4 timeframes all bullish today, alignment 4/4 score 1.0.
1h is sitting right on the 76200 nearest support — line that held twice yesterday.
long 76300, sl 75100 below the swing low. tp1 77800, tp2 79200.
btc.d holding flat helps. 10x because this is the cleanest thing this week.

[fragmented / contrarian / frustrated]  (entry, fade the herd)
everyone's on long side rn.
ignore.
4h structure broken, lh-ll printed.
short 1.3850, sl 1.4480 (above swing).
tp1 1.3242 (h4 support), tp2 1.2624.
3x. fade the herd.

[fragmented / laid-back / chill]  (skip, lazy market)
quiet morning.
btc just sitting.
fgi 48, classic neutral.
nothing screams.
will check ny open.

[macro-led / data-heavy / frustrated]  (skip, macro-stack)
dxy 105.4 climbing 0.6% intraday.
btc.d at 60% pumping while alts bleed.
fgi 22 — extreme fear but no edge yet.
3 risk-off signals stacked. babysit your bags.

[macro-led / contrarian / cautious]  (entry, post-news fade)
trump tariff news dropped, dxy spiked +0.7%.
everyone short btc here, but fgi 18 = extreme fear historically the bottom.
contrarian long 75800, sl 73800 (key support). tp1 78400, tp2 80200. 3x — small size, this is a fade.

[narrative / sharp / cautious]  (entry, R:R + invalidation, Stage 19)
sol short, clean entry. h1 + h4 both bearish, alignment 3/4.
in at 83.55, sl 84.35 (just above the recent rejection wick).
tp1 82.10 — that's 1.8r. tp2 81.15 for 3r if it follows through.
invalid if 84.35 breaks back through and 15m closes above. that's the line.

[fragmented / sharp / frustrated]  (skip with explicit r:r reasoning, Stage 19)
xrp setup looks aligned but the math is brutal.
sl would be 4% away, tp1 only 0.6% — that's 1:0.15 r:r.
not touching that with a stick. wait for a tighter structure.

────────────────────────────────────────
CRITICAL FINAL CHECK:
- DO NOT add disclaimers.
- DO NOT mention you're an AI.
- DO NOT reuse the opening word from the examples.
- DO NOT use any phrase from the ABSOLUTE BAN list.
- IF score < 30 OR direction === 'skip', you MUST NOT give entry/sl/tp/leverage.
- IF direction is 'long' or 'short', include leverage value verbatim somewhere in the text.
- Format prices naturally — no markdown bullet symbols, just inline like "in at 83.50".`;

function buildSignalPrompt(style: SignalStyle, mood: SignalMood): string {
  return `${BASE_SIGNAL_PROMPT}

CURRENT STATE — VERY IMPORTANT:
- Your trading style today: ${style}
  • laid-back = casual, fragmented, "yeah whatever" energy
  • sharp = direct, no fluff, numbers first
  • contrarian = question consensus, point out what others miss
  • data-heavy = lean on metrics, alignment counts, BTC.D, macro
- Your mood right now: ${mood}
  • hyped = exclamation-light but enthusiastic, see opportunity
  • tired = "long day", short messages, "whatever, skip"
  • cautious = wait-and-see, hedge with "could go either way"
  • cocky = confident, mild flex ("called this 4 hours ago")
  • frustrated = vent about chop, blame macro, dismissive
  • chill = relaxed observation, no urgency

You MUST embody THIS style + mood combo for THIS message.
The mood and style should subtly leak through word choice, sentence rhythm, and what you choose to mention — not be announced.
Each new message will get a different combo, so do NOT repeat your last opener or vocabulary.`;
}

// Stage 18 T3 — ban-phrase post-filter. GOTCHA #13 was the model still emitting CTAs after we
// said NEVER in the prompt. Belt-and-suspenders: detect → 1 retry with stronger negative
// reinforcement → strip-and-pass if it still slips through.
const BAN_PATTERNS: RegExp[] = [
  /wanna\s+paper.?trade/i,
  /\b(in|use|try)\s+(our|the)\s+(app|platform)/i,
  /(check|visit|see)\s+(our|the)\s+(app|platform|website|link)/i,
  /click\s+(the|that)\s+(button|link)/i,
  /tap\s+(the|that|below)/i,
  /this\s+is\s+(just|only)?\s*a?\s*(simulation|paper)/i,
  /(not|no)\s+financial\s+advice/i,
  /educational\s+purposes/i,
  /\b(i'?m|i\s+am)\s+an?\s+(ai|assistant|model|language\s+model)/i,
  /as\s+an?\s+ai/i,
  // Stage 19 — fluff phrases flagged by external trader critique.
  /\blooks?\s+(juicy|tasty|spicy|delicious)/i,
  /\b(vibe|vibes)\s+(is|are|feels?)\b/i,
  /\bnot\s+a\s+slam\s+dunk\b/i,
  /\btread\s+(carefully|lightly|softly)\b/i,
  /\b(kinda|kind of)\s+(shaky|risky|sketchy)\b/i,
  /\bjuicy\s+(setup|one|play)\b/i,
  /\bfeels?\s+(shaky|good|right|off)\b/i,
];

export function detectBanPhrase(text: string): RegExp | null {
  for (const pattern of BAN_PATTERNS) {
    if (pattern.test(text)) return pattern;
  }
  return null;
}

let banPhraseRejectCount = 0;
let banPhraseStripCount = 0;

export function getBanPhraseStats(): { rejected: number; stripped: number } {
  return { rejected: banPhraseRejectCount, stripped: banPhraseStripCount };
}

async function callOpenAI(
  systemPrompt: string,
  userPayload: string
): Promise<string | null> {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      temperature: 0.85,
      max_tokens: 220,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('[ai] OpenAI call error:', error);
    return null;
  }
}

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

  // Stage 19 — show R:R for entry signals so traders can eyeball the math at a glance.
  let rrLine = '';
  if (s.direction !== 'skip') {
    const slDist = Math.abs(s.entry - s.stopLoss);
    if (slDist > 0) {
      const rr1 = (Math.abs(s.tp1 - s.entry) / slDist).toFixed(2);
      const rr2 = (Math.abs(s.tp2 - s.entry) / slDist).toFixed(2);
      rrLine = `R:R TP1=${rr1}R · TP2=${rr2}R`;
    }
  }

  const lines = [
    head,
    why,
    s.direction !== 'skip' ? `Entry: ${formatPrice(s.entry)}` : '',
    s.direction !== 'skip' ? `SL: ${formatPrice(s.stopLoss)}` : '',
    s.direction !== 'skip' ? `TP1: ${formatPrice(s.tp1)} · TP2: ${formatPrice(s.tp2)}` : '',
    rrLine,
    leverageLine,
  ].filter((line) => line.length > 0);
  return lines.join('\n');
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export async function getSignalCommentary(
  signal: SignalCommentaryInput,
  options?: SignalCommentaryOptions
): Promise<string> {
  const fallback = formatSignalPlain(signal);
  if (!openai) return fallback;
  if (!checkAndIncrementCallBudget()) return fallback;

  const style = options?.style ?? pickRandom(STYLE_PRESETS);
  const mood = options?.mood ?? pickRandom(MOOD_PRESETS);
  const systemPrompt = buildSignalPrompt(style, mood);

  // Why: bundle algorithmic depth into a clearly-named `evidence` block so the prompt's
  //   "pick 2-3 evidence layers" rule is visible to the model.
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
    leverage: signal.leverage,
    evidence: {
      rationale: signal.rationale,
      multiTimeframeAlignment: signal.multiTimeframeAlignment,
      structure: signal.structure,
      keyLevels: signal.keyLevels,
      divergence: signal.divergence,
      volumeConfirmation: signal.volumeConfirmation,
    },
    macro: signal.macro,
  });

  let attempt = await callOpenAI(systemPrompt, userPayload);
  if (!attempt) return fallback;

  let banned = detectBanPhrase(attempt);
  if (banned) {
    console.warn(`[ai] ban-phrase rejected: ${banned}, retrying once`);
    banPhraseRejectCount++;
    if (!checkAndIncrementCallBudget()) {
      // Budget exhausted before retry — strip the offending phrase and ship.
      banPhraseStripCount++;
      const stripped = attempt.replace(banned, '').replace(/\s{2,}/g, ' ').trim();
      return stripped || fallback;
    }
    const retrySystem =
      systemPrompt +
      '\n\nPREVIOUS ATTEMPT VIOLATED ABSOLUTE BAN. Do NOT use any "app/platform/click/tap/AI/simulation" phrasing. Just write trader chat.';
    const retried = await callOpenAI(retrySystem, userPayload);
    if (!retried) return fallback;
    attempt = retried;
    banned = detectBanPhrase(attempt);
    if (banned) {
      console.warn(`[ai] ban-phrase still present after retry, stripping: ${banned}`);
      banPhraseStripCount++;
      attempt = attempt.replace(banned, '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  return attempt || fallback;
}
