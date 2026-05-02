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

