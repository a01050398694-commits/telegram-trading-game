import OpenAI from 'openai';
import { env } from '../env.js';

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
}

const SIGNAL_PROMPT = `You're a senior crypto trader posting a setup in a Telegram group.
Below are the actual numbers. Translate into 4-6 short lines:
- Direction line (long/short + symbol)
- 1 sentence 'why' pulling 1-2 bullets from rationale (use the numbers)
- Entry / SL / TP1 / TP2 (one line each, with $ prices)
- End with 'wanna paper-trade this in our app? 🚀' or similar nudge
Slang OK (rekt, ngmi, lfg, mooning, juicy, clean setup). Emojis welcome.
Do NOT add disclaimers (caller does that).
Do NOT mention you're an AI.`;

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

  // Why: AI gets the raw numbers + rationale, then writes the setup like a trader, not a robot.
  const userPayload = JSON.stringify({
    symbol: signal.symbol,
    direction: signal.direction,
    currentPrice: signal.currentPrice,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    tp1: signal.tp1,
    tp2: signal.tp2,
    rationale: signal.rationale,
    leverage: signal.leverage,
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
