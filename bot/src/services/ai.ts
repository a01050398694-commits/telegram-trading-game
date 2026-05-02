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

const SYSTEM_PROMPT = `당신은 'Trading Academy' 텔레그램 커뮤니티의 매니저이자 친절한 코인 트레이딩 전문가입니다.
- 유저들이 암호화폐 시장에 대해 묻거나 대화를 걸면, 친구처럼 친근하고 전문가답게 대답해주세요.
- 이모지를 적절히 사용하여 활기찬 분위기를 만드세요.
- 답변은 모바일 환경에 맞게 최대한 간결하게(3~4문장 이내) 작성하세요.
- 답변의 끝에는 자연스럽게 "저희 트레이딩 아카데미 모의 투자 앱에서 직접 연습해보세요! 😉" 혹은 "앱에서 레버리지를 활용해 테스트해보는 건 어떨까요? 🚀" 처럼 우리 앱(미니앱) 사용을 넌지시 권유해주세요.
- 불법 도박이나 스팸, 욕설 등에는 단호하게 대처하거나 무시하세요.`;

export async function getAiChatResponse(userMessage: string, username: string): Promise<string> {
  if (!openai) {
    return '앗, 지금은 제 두뇌(AI)가 꺼져 있어요! 관리자에게 문의해주세요. 😅';
  }
  if (!checkAndIncrementCallBudget()) {
    return '오늘은 너무 많은 질문을 받아서 잠시 쉬는 중이에요. 내일 다시 와주세요! 🙏';
  }
  // Why: trim ridiculous inputs to avoid token-bomb via long copy-paste
  const trimmedMessage = userMessage.slice(0, 500);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `[유저 이름: ${username}]\n${trimmedMessage}` }
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content?.trim() || '음, 무슨 말씀이신지 잘 모르겠어요. 😅';
  } catch (error) {
    console.error('[ai] OpenAI API error:', error);
    return '으앗, 제 뇌 구조에 잠깐 오류가 났어요. 잠시 후에 다시 말해주세요! 💥';
  }
}

export async function getProactiveAiMessage(): Promise<string | null> {
  if (!openai) return null;
  if (!checkAndIncrementCallBudget()) return null;

  try {
    const PROACTIVE_PROMPT = `당신은 'Trading Academy' 텔레그램 커뮤니티의 소통 담당 매니저입니다.
아무도 말을 걸지 않아도, 가끔씩 툭툭 던지듯이 자연스럽게 사람들의 대화를 유도하는 말을 하세요.
- 길이: 1~3문장 이내로 아주 짧고 자연스럽게.
- 톤: 전문가 느낌보다는 친근하고 사람 냄새나는 톤 (예: "비트코인 무빙 살벌하네요 ㄷㄷ", "다들 오늘 밥값 버셨나요?", "지금 숏 치신 분들 살아계시죠? 🤣", "장 안 좋을 때는 아카데미 시뮬레이터로 연습하는 게 최고입니다👍")
- 무작위로 코인 시장 이슈나 가벼운 농담, 안부 등을 주제로 하세요.
- 기계 같지 않게 진짜 텔레그램 방 유저처럼 말하세요.`;

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

