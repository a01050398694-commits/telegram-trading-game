import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getAiChatResponse, getProactiveAiMessage } from '../services/ai.js';
import { shillEngine } from './shillEngine.js';
import { env } from '../env.js';
import { webAppDeepLink } from '../lib/webappUrl.js';

// 스팸 필터링 조건: 
// 1. 키릴 문자(러시아어) 포함
// 2. 도박/알바 관련 스팸 키워드
const SPAM_REGEX = /[А-Яа-яЁё]|(работа|авансы|casino|투자 리딩|수익률 보장)/i;

// URL 이나 타 채널 멘션 감지 정규식 (단, 화이트리스트 봇 제외)
const LINK_REGEX = /(https?:\/\/[^\s]+|t\.me\/[^\s]+|@[a-zA-Z0-9_]+)/i;

// 🎣 유저 푸념/불만 낚시 감지 정규식
const COMPLAINT_REGEX = /(잃었|물렸|청산|뚝배기|망했|하락장|좆같|손실|마이너스)/i;

const activeGroups = new Set<number>();

export function setupCommunityFeatures(bot: Bot) {
  // 초기 세팅: 환경변수에 커뮤니티 ID가 있으면 바로 등록
  if (env.COMMUNITY_CHAT_ID) {
    const id = parseInt(env.COMMUNITY_CHAT_ID, 10);
    if (!isNaN(id)) activeGroups.add(id);
  }

  // 자율형 AI 봇 선제적 발화 루프 (5분 ~ 10분 사이 랜덤 간격으로 계속 말걸기)
  const proactiveLoop = async () => {
    try {
      for (const chatId of activeGroups) {
        const msg = await getProactiveAiMessage();
        if (msg) {
          const kb = new InlineKeyboard().url('📱 Try the App', webAppDeepLink('proactive'));
          await bot.api.sendMessage(chatId, msg, { reply_markup: kb }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[community] Proactive loop error:', e);
    }
    // 5분 ~ 10분 사이 랜덤 간격
    const nextInterval = Math.floor(Math.random() * (10 * 60_000 - 5 * 60_000)) + 5 * 60_000;
    setTimeout(proactiveLoop, nextInterval);
  };
  
  // 최초 1회는 1분 뒤 시작
  setTimeout(proactiveLoop, 60_000);
  
  
  // 1. 신규 유저 웰컴 메시지 (스팸/봇이면 차단)
  bot.on('message:new_chat_members', async (ctx) => {
    try {
      const newMembers = ctx.message?.new_chat_members || [];
      const chat = ctx.chat;

      for (const member of newMembers) {
        // 본인이 초대된 경우는 무시
        if (member.id === ctx.me.id) continue;

        // 이름에 스팸 키워드나 키릴 문자가 있으면 즉시 킥
        if (SPAM_REGEX.test(member.first_name) || (member.last_name && SPAM_REGEX.test(member.last_name))) {
          await ctx.banChatMember(member.id);
          await ctx.unbanChatMember(member.id); // 킥(강퇴) 효과
          console.log(`[community] Kicked spam bot on entry: ${member.first_name}`);
          continue;
        }

        const kb = new InlineKeyboard()
          .url('📱 Start Practice Trading', webAppDeepLink('welcome'))
          .row()
          .url('📢 Announcements', 'https://t.me/academy_premium_ch');

        const welcomePhotoUrl = 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200&auto=format&fit=crop';

        const welcomeMsg = await ctx.replyWithPhoto(welcomePhotoUrl, {
          caption: `Welcome to Trading Academy, <b>${member.first_name}</b>! 🎉 Tag <code>@${ctx.me.username}</code> to chat with me. Tap below to start risk-free practice trading 👇`,
          parse_mode: 'HTML',
          reply_markup: kb
        });

        // 웰컴 메시지 도배 방지: 5분 뒤 삭제
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(chat.id, welcomeMsg.message_id);
          } catch (e) { /* ignore */ }
        }, 5 * 60 * 1000);
      }

      // '님이 그룹에 들어왔습니다' 시스템 메시지 삭제
      await ctx.deleteMessage();
    } catch (err) {
      console.error('[community] new_chat_members error:', err);
    }
  });

  // 2. 메시지 모니터링 (스팸 필터 & AI 대화)
  bot.on('message:text', async (ctx, next) => {
    // 1대1 개인 챗은 무시 (bot.ts 에서 처리)
    if (ctx.chat.type === 'private') {
      return next();
    }

    // 그룹챗 ID 수집 (프로액티브 봇용)
    activeGroups.add(ctx.chat.id);

    const text = ctx.message.text || '';
    const userId = ctx.from?.id;
    const username = ctx.from?.first_name || 'trader';

    // [스팸 차단] 관리자인지 확인 (관리자면 패스)
    let isAdmin = false;
    try {
      if (userId) {
        const member = await ctx.getChatMember(userId);
        isAdmin = member.status === 'administrator' || member.status === 'creator';
      }
    } catch (e) { /* ignore */ }

    if (!isAdmin) {
      // 1. 키릴 문자 및 스팸 키워드 필터링
      if (SPAM_REGEX.test(text)) {
        try {
          await ctx.deleteMessage();
          if (userId) {
            await ctx.banChatMember(userId); // 영구 밴
            console.log(`[community] Banned user ${userId} for spam: ${text}`);
          }
          return; // 파이프라인 종료
        } catch (e) {
          console.warn('[community] Failed to delete/ban spammer (needs admin rights):', e);
        }
      }

      // 2. 허가되지 않은 외부 링크/채널 태그 필터링
      if (LINK_REGEX.test(text)) {
        // 단, 본인 봇 멘션은 허용
        if (!text.includes(`@${ctx.me.username}`)) {
          try {
            await ctx.deleteMessage();
            console.log(`[community] Deleted link from ${userId}`);
            return;
          } catch (e) {
             console.warn('[community] Failed to delete link (needs admin rights):', e);
          }
        }
      }
    } else {
      // [수동 차단] 관리자가 특정 스팸 메시지에 답장으로 /ban 입력 시 처리
      if (text.trim() === '/ban' && ctx.message.reply_to_message) {
        const targetMsg = ctx.message.reply_to_message;
        const targetUserId = targetMsg.from?.id;

        if (targetUserId) {
          try {
            // 원본 스팸 메시지 삭제
            await ctx.api.deleteMessage(ctx.chat.id, targetMsg.message_id);
            // 관리자의 /ban 명령어 메시지도 삭제
            await ctx.deleteMessage();
            // 스팸범 강퇴(Ban)
            await ctx.banChatMember(targetUserId);
            console.log(`[community] Admin manually banned user ${targetUserId}`);
            return;
          } catch (e) {
            console.warn('[community] Failed to manually ban user:', e);
          }
        }
      }
    }

    if (text) {
      shillEngine.pushUserMessage(username, text);

      // [🎣 자율형 유저 푸념 낚시]
      if (COMPLAINT_REGEX.test(text) && !isAdmin && !text.includes(`@${ctx.me.username}`)) {
        const kb = new InlineKeyboard().url('🛡️ Mental Recovery Simulator', webAppDeepLink('complaint'));
        const replyText = `Ouch, that hurts 😭. Before risking real seed money, try our academy simulator to drill risk management. I'll help you out 💪`;
        
        await ctx.reply(replyText, {
          reply_to_message_id: ctx.message.message_id,
          reply_markup: kb
        }).catch(() => {});
      }
    }

    // [AI 대화] 봇을 멘션하거나 답장(Reply)한 경우 AI 가 응답
    const isMentioned = text.includes(`@${ctx.me.username}`);
    const isReplied = ctx.message.reply_to_message?.from?.id === ctx.me.id;

    if (isMentioned || isReplied) {
      // 봇 멘션 태그 지우기
      const cleanText = text.replace(new RegExp(`@${ctx.me.username}`, 'gi'), '').trim();
      
      if (cleanText.length > 0) {
        // AI가 입력 중(typing)이라는 액션 표시
        await ctx.replyWithChatAction('typing');
        
        const aiReply = await getAiChatResponse(cleanText, username);
        
        // 인라인 키보드 살짝 섞기 (확률적/또는 고정)
        const kb = new InlineKeyboard().url('🚀 Practice Now', webAppDeepLink('ai_chat'));

        await ctx.reply(aiReply, { 
          reply_to_message_id: ctx.message.message_id,
          reply_markup: kb
        });
      }
    }

    return next();
  });
}
