import { Bot, InlineKeyboard, type Context } from 'grammy';
import { env } from './env.js';
import type { TradingEngine } from './engine/trading.js';
import type { ReferralMissionEngine } from './engine/referralMission.js';
import { STARS_PAYLOAD_PREFIX } from './server.js';

// B-08 — /start 레퍼럴 처리 시 마일스톤 평가를 주입받기 위한 컨테이너.
// 순환 의존(ReferralMissionEngine ↔ Bot) 을 피하기 위해 생성 후 setter 로 주입.
export type BotContext = {
  referralMission: ReferralMissionEngine | null;
};

function formatBalance(n: number): string {
  // Stage 6: USD 정수 달러 단위. $100,000 포맷.
  return `$${n.toLocaleString('en-US')}`;
}

// Stage 8.0 — callback_data 상수. 매직스트링 방지.
const CB_HOW = 'how_to_play';
const CB_PREMIUM = 'academy_info';

// Stage 8.13 — 한국어 판정 헬퍼.
// Telegram User.language_code 는 RFC4646 ("ko", "ko-KR" 등) — 둘 다 맞추려 startsWith 사용.
function isKorean(ctx: Context): boolean {
  return ctx.from?.language_code?.startsWith('ko') ?? false;
}

// /start 인라인 키보드. 라벨은 isKo 로 분기.
function buildStartKeyboard(isHttps: boolean, webappUrl: string, isKo: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (isHttps) {
    kb.webApp(isKo ? '🎓 트레이딩 아카데미 입장' : '🎓 Open Trading Academy', webappUrl).row();
  }
  kb.text(isKo ? '📖 게임 방법' : '📖 How It Works', CB_HOW).text(
    isKo ? '📘 아카데미 멤버십' : '📘 Academy Membership',
    CB_PREMIUM,
  );
  return kb;
}

export function createBot(engine: TradingEngine, context: BotContext): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  // -------------------------------------------------------------------------
  // /premium — 임시 우회 기능 (수동 프리미엄 권한 부여)
  // -------------------------------------------------------------------------
  bot.command('premium', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      import('./services/premiumCache.js').then(({ grantManualPremium }) => {
        grantManualPremium(userId);
      });
      await ctx.reply('✅ 결제가 확인되었습니다! 이제 미니앱을 열어 프리미엄 콘텐츠를 즐겨보세요.');
    }
  });

  // -------------------------------------------------------------------------
  // /start — Stage 8.0 교육 리브랜딩 + Stage 8.13 한국어 분기.
  // -------------------------------------------------------------------------
  bot.command('start', async (ctx) => {
    const tgUser = ctx.from;
    const isKo = isKorean(ctx);
    if (!tgUser) {
      await ctx.reply(isKo ? '유저 정보를 읽을 수 없습니다. 다시 시도해 주세요.' : 'Unable to read user info. Please try again.');
      return;
    }

    // Stage 9 — 레퍼럴 파싱. `/start 123456` 혹은 t.me/bot?start=123456 형식.
    // grammy 의 ctx.match 는 첫 command arg (없으면 "") 를 담는다.
    // tgUser.id 자기 자신 초대 금지, 음수·NaN 방어.
    const rawMatch = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const parsedReferrer = rawMatch ? Number(rawMatch) : NaN;
    const referrerTgId =
      Number.isInteger(parsedReferrer) && parsedReferrer > 0 && parsedReferrer !== tgUser.id
        ? parsedReferrer
        : null;

    try {
      // upsertUser 먼저 — 초대자 uuid 를 referred_by 로 기록하려면 초대자가 이미 DB 에 있어야 함.
      let referrerUserId: string | null = null;
      if (referrerTgId !== null) {
        const ref = await engine.getUserByTelegramId(referrerTgId);
        referrerUserId = ref?.id ?? null;
      }

      const { user, isNew } = await engine.upsertUser({
        telegram_id: tgUser.id,
        username: tgUser.username ?? null,
        first_name: tgUser.first_name ?? null,
        language_code: tgUser.language_code ?? null,
        referred_by: referrerUserId,
      });

      // Stage 10 — 최초 1회 시드 → 그 다음 레퍼럴 보너스 +$10,000 상가산.
      // 순서 중요: grantInitialSeed 가 신규 지갑 balance 를 $100,000 으로 세팅하므로
      // 보너스를 먼저 주면 덮인다. 재접속 유저에겐 granted=false 로 단순 잔고 조회.
      const { granted, balance: seedBalance } = await engine.grantInitialSeed(user.id);
      let balance = seedBalance;

      // 레퍼럴 보너스 — 신규 유저이고 유효한 초대자일 때만 지급.
      // 성공하면 양쪽에 $10,000 추가 후 초대자에게 DM.
      let bonusGranted = false;
      if (isNew && referrerTgId !== null && referrerUserId !== null) {
        try {
          const bonus = await engine.grantReferralBonus(user.id, referrerTgId);
          if (bonus) {
            bonusGranted = true;
            balance = bonus.newBalance;
            try {
              await bot.api.sendMessage(
                bonus.referrerTelegramId,
                isKo
                  ? `🎉 누군가 당신의 초대 링크로 *트레이딩 아카데미* 에 가입했습니다!\n\n연습 지갑에 *+$10,000* 보너스가 반영됐어요. (현재 잔고: $${bonus.referrerBalance.toLocaleString('en-US')})`
                  : `🎉 Someone joined the *Trading Academy* via your invite link!\n\n*+$10,000* bonus has been added to your practice wallet. (Balance: $${bonus.referrerBalance.toLocaleString('en-US')})`,
                { parse_mode: 'Markdown' },
              );
            } catch (notifyErr) {
              console.warn('[bot] referral notify failed:', notifyErr);
            }
          }
        } catch (bonusErr) {
          // 보너스 실패는 /start 흐름을 막지 않음 — 단, 로그는 남긴다.
          console.error('[bot] grantReferralBonus:', bonusErr);
        }

        // B-08 — 초대자의 레퍼럴 마일스톤(3명/10명) 평가. 실패는 무시.
        if (context.referralMission && referrerUserId) {
          try {
            await context.referralMission.evaluateMilestones(referrerUserId);
          } catch (missionErr) {
            console.error('[bot] referral mission evaluate:', missionErr);
          }
        }
      }
      // bonusGranted 참조용 (린트 unused 방지).
      void bonusGranted;

      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?v=${Date.now()}` : env.WEBAPP_URL;
      const keyboard = buildStartKeyboard(isHttps, cacheBustedUrl, isKo);

      const lines = isKo
        ? [
            '*🎓 트레이딩 아카데미*',
            '',
            '라이브 바이낸스 데이터로 돌아가는 안전한 교육용 모의 투자 시뮬레이터입니다.',
            '실제 자금은 일절 사용되지 않으며, 트레이더의 규율을 연습하기 위한 체계적 환경입니다.',
            '',
            `최초 가입 축하금 *${formatBalance(Number(env.DAILY_ALLOWANCE))}* 의 모의 투자금이 딱 한 번 지급됩니다.`,
            '',
            granted
              ? `✅ 최초 시드 *${formatBalance(balance)}* 가 지급되었습니다.`
              : `💰 현재 연습 잔고: *${formatBalance(balance)}* _(이미 초기 시드를 수령했습니다)_`,
            '',
            isHttps
              ? '👇 아래 버튼을 눌러 학습을 시작하세요.'
              : '⚠️ 개발 모드 — 미니앱은 HTTPS 배포 후 활성화됩니다. 우선 `/balance` 명령어를 사용하세요.',
          ]
        : [
            '*🎓 Trading Academy*',
            '',
            'A safe, educational paper-trading simulator powered by live Binance data.',
            'No real money involved — only structured practice for disciplined traders.',
            '',
            `A one-time initial practice seed of *${formatBalance(Number(env.DAILY_ALLOWANCE))}* is granted on your first join.`,
            '',
            granted
              ? `✅ Your initial practice seed of *${formatBalance(balance)}* is ready.`
              : `💰 Current practice balance: *${formatBalance(balance)}* _(initial seed already claimed)_`,
            '',
            isHttps
              ? '👇 Tap below to start your lesson.'
              : '⚠️ Dev mode — Mini App activates after HTTPS deploy. Use `/balance` for now.',
          ];

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err) {
      console.error('[bot] /start error:', err);
      await ctx.reply(isKo ? '⚠️ 시작 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' : '⚠️ Something went wrong while starting. Please try again shortly.');
    }
  });

  // -------------------------------------------------------------------------
  // /balance — 연습 잔고 조회
  // -------------------------------------------------------------------------
  bot.command('balance', async (ctx) => {
    const tgUser = ctx.from;
    const isKo = isKorean(ctx);
    if (!tgUser) {
      await ctx.reply(isKo ? '유저 정보를 읽을 수 없습니다.' : 'Unable to read user info.');
      return;
    }

    try {
      const user = await engine.getUserByTelegramId(tgUser.id);
      if (!user) {
        await ctx.reply(isKo ? '먼저 /start 로 아카데미에 등록하세요.' : 'Send /start first to enroll in the Academy.');
        return;
      }

      const wallet = await engine.getWallet(user.id);
      if (!wallet) {
        await ctx.reply(isKo ? '연습 지갑을 찾을 수 없습니다. /start 를 다시 실행하세요.' : 'No practice wallet found. Run /start again.');
        return;
      }

      const openCount = await engine.countOpenPositions(user.id);

      const status = wallet.is_liquidated
        ? isKo
          ? '🔴 *리셋 필요* — 리스크 관리 수업이 발동되었습니다'
          : '🔴 *Reset required* — risk management lesson triggered'
        : isKo
          ? '🟢 활성'
          : '🟢 Active';

      const lines = isKo
        ? [
            '*💼 연습 지갑*',
            `잔고: *${formatBalance(wallet.balance)}*`,
            `상태: ${status}`,
            `오픈 포지션: ${openCount}건`,
          ]
        : [
            '*💼 Practice Wallet*',
            `Balance: *${formatBalance(wallet.balance)}*`,
            `Status: ${status}`,
            `Open positions: ${openCount}`,
          ];

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot] /balance error:', err);
      await ctx.reply(isKo ? '⚠️ 잔고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '⚠️ Could not fetch balance. Try again shortly.');
    }
  });

  bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
  });

  // -------------------------------------------------------------------------
  // Stage 8.13 — 인라인 콜백 한국어 분기.
  // -------------------------------------------------------------------------
  bot.callbackQuery(CB_HOW, async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const isKo = isKorean(ctx);
      const lines = isKo
        ? [
            '*📖 트레이딩 아카데미 사용법*',
            '',
            '1️⃣ /start — 가입 시 최초 1회 *$100K* 의 모의 투자금이 지급됩니다.',
            '2️⃣ 🎓 미니앱을 열어 바이낸스의 60+ 라이브 마켓을 둘러보세요.',
            '3️⃣ 1~125배 레버리지로 롱/숏 의사결정을 연습하고 실시간 PnL 을 검토하세요.',
            '4️⃣ 포지션을 종료해 학습 결과를 확정하세요 — 승리와 손실 모두 훌륭한 수업입니다.',
            '5️⃣ 일일 상위 10명에게 21:50~24:00 KST 엘리트 애널리스트 클럽 초대장이 발송됩니다.',
            '',
            '⚠️ 본 앱은 *모의 투자 시뮬레이터* 입니다 — 실제 자금 손실 위험이 전혀 없습니다.',
            '연습 잔고가 소진되면 150⭐ 로 리셋해야 계속할 수 있습니다 — 추가 무료 지급은 없습니다.',
          ]
        : [
            '*📖 How the Trading Academy Works*',
            '',
            '1️⃣ /start — Receive a one-time $100K of simulated practice capital on your first join.',
            '2️⃣ 🎓 Open the Mini App and explore 60+ live markets from Binance.',
            '3️⃣ Practice long/short decisions with 1~125x leverage and review live PnL.',
            '4️⃣ Close positions to realize learning outcomes — wins and losses teach equally.',
            '5️⃣ Top 10 daily learners earn a 21:50~24:00 KST Elite Analyst Club chat invite.',
            '',
            '⚠️ This is a *paper-trading simulator* — there is never real money at risk.',
            'If your practice balance is depleted, you must reset via 150⭐ to continue — no further free grants.',
          ];
      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot] how_to_play:', err);
    }
  });

  bot.callbackQuery(CB_PREMIUM, async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const isKo = isKorean(ctx);
      const lines = isKo
        ? [
            '*📘 아카데미 멤버십*',
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '*Free* — $0',
            '  ✓ 멀티코인 연습 차트',
            '  ✓ 최초 $100K 연습 시드',
            '',
            '*Academy* — 월 $29.99',
            '  ✓ Free 플랜 전체 포함',
            '  ✓ 엘리트 애널리스트 클럽 채팅 입장',
            '  ✓ 글로벌 모의 트레이딩 토너먼트 출전권',
            '',
            '*🏆 Lifetime Academy* — *월 $7.99 평생 고정*',
            '  ✓ 위 혜택 전체 포함',
            '  ✓ 리스크 리셋 30% 할인',
            '  ✓ 공식 제휴 거래소 UID 1회 인증 시 평생 무료',
            '━━━━━━━━━━━━━━━━━━━━',
            '',
            '👉 미니앱의 아카데미 탭에서 UID 인증을 제출하세요.',
          ]
        : [
            '*📘 Academy Membership*',
            '',
            '━━━━━━━━━━━━━━━━━━━━',
            '*Free* — $0',
            '  ✓ Multi-coin practice charts',
            '  ✓ One-time $100K practice seed',
            '',
            '*Academy* — $29.99/mo',
            '  ✓ Everything in Free',
            '  ✓ Elite Analyst Club chat access',
            '  ✓ Global Paper Trading Tournament eligibility',
            '',
            '*🏆 Lifetime Academy* — *$7.99/mo forever*',
            '  ✓ Everything above',
            '  ✓ Risk Management Reset −30%',
            '  ✓ One-time partner exchange UID verification',
            '━━━━━━━━━━━━━━━━━━━━',
            '',
            '👉 Open the Academy tab in the Mini App to submit your verification.',
          ];
      const isHttps = env.WEBAPP_URL.startsWith('https://');
      const cacheBustedUrl = isHttps ? `${env.WEBAPP_URL}?v=${Date.now()}` : env.WEBAPP_URL;
      const keyboard = isHttps
        ? new InlineKeyboard().webApp(isKo ? '📘 아카데미 열기' : '📘 Open Academy', cacheBustedUrl)
        : undefined;
      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
    } catch (err) {
      console.error('[bot] academy_info:', err);
    }
  });

  // -------------------------------------------------------------------------
  // Stars 결제: pre_checkout_query → 항상 승인.
  // -------------------------------------------------------------------------
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      console.error('[bot] pre_checkout_query:', err);
      await ctx.answerPreCheckoutQuery(false, 'Payment processing error — please try again.');
    }
  });

  // -------------------------------------------------------------------------
  // Stars 결제 성공: payload 검증 후 revivePaidUser.
  // -------------------------------------------------------------------------
  bot.on(':successful_payment', async (ctx) => {
    const payment = ctx.message?.successful_payment;
    if (!payment) return;
    const isKo = isKorean(ctx);

    const payload = payment.invoice_payload;
    if (!payload.startsWith(STARS_PAYLOAD_PREFIX)) {
      console.warn('[bot] unknown payment payload:', payload);
      return;
    }
    const userId = payload.slice(STARS_PAYLOAD_PREFIX.length).split(':')[0];
    if (!userId) {
      console.error('[bot] malformed payment payload:', payload);
      return;
    }

    try {
      const { balance } = await engine.revivePaidUser(userId);
      const lines = isKo
        ? [
            '✅ *리스크 관리 리셋 완료*',
            `연습 잔고가 *${formatBalance(balance)}* 로 복원되었습니다.`,
            '미니앱으로 돌아가 학습을 이어가세요.',
          ]
        : [
            '✅ *Risk Management Reset Complete*',
            `Practice balance restored to *${formatBalance(balance)}*.`,
            'Return to the Mini App to continue your lesson.',
          ];
      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot] revivePaidUser failed:', err);
      await ctx.reply(isKo ? '⚠️ 결제는 성공했지만 잔고 업데이트에 실패했습니다. 지원팀에 문의해 주세요.' : '⚠️ Payment succeeded but balance update failed. Please contact support.');
    }
  });

  // 전역 에러 핸들러 — polling 루프 보호
  bot.catch((err) => {
    console.error('[bot] error:', err);
  });

  return bot;
}
