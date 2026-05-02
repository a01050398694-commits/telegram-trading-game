import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import OpenAI from 'openai';
import { env } from '../env.js';
import { webAppUrl } from '../lib/webappUrl.js';
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
        `"RSI 등 기술적 지표나 현재 시황을 빗대어 모의투자를 유도해라. 예: RSI가 과매수네요, 조만간 숏 자리 아닐까요? 연습해보세요!"`,
        `"수익률이나 랭킹에 대한 경쟁심리를 자극해라. 예: 오늘 1등 수익률이 어마어마하네요! 당신도 엘리트 클럽에 도전하세요!"`,
        `"단순 시황을 브리핑하며 스캘핑을 권유해라. 예: 비트가 횡보하네요. 이럴 땐 알트 단타가 제격이죠. 타점 연습 어때요?"`
      ];
      const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];

      const prompt = `현재 비트코인 가격은 $${btcNow?.toFixed(2)}, 이더리움은 $${ethNow?.toFixed(2)} 입니다. (지난 주기 대비 변동폭 비트: ${btcChange > 0 ? '+' : ''}${btcChange.toFixed(2)}%, 이더: ${ethChange > 0 ? '+' : ''}${ethChange.toFixed(2)}%).
이 데이터를 바탕으로 텔레그램 트레이딩 커뮤니티 유저들에게 수다를 떠는 것처럼 먼저 말을 걸어주세요. 
이번 발언의 핵심 지침: ${selectedHook}
- 길이는 2~3문장으로 아주 짧게 쓰세요.
- 딱딱한 시황 브리핑 절대 금지, 진짜 커뮤니티의 사람(트레이더)처럼 자연스러운 말투, 비속어 필터링 없이 거친 슬랭(rekt, ngmi, 떡상 등)과 이모지를 사용하세요.
- 대화 중간에 무조건 딥링크 버튼을 누르게끔 넛지(Nudge)하세요.`;

      if (!checkAndIncrementCallBudget()) return;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 200,
      });

      const brief = response.choices[0]?.message?.content?.trim();
      if (!brief) return;

      const kb = new InlineKeyboard().webApp('🚀 모의 투자 시작하기', webAppUrl());

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
