import type { Bot } from 'grammy';
import type { Db } from '../db/supabase.js';
import type { TradingEngine } from './trading.js';
import { issuePromoCode } from '../services/invitemember.js';

// B-08 — 레퍼럴 미션 엔진.
//   · 3명 초대  → +$50,000 연습 자본 즉시 지급
//   · 10명 초대 → InviteMember 1개월 Academy Promo code 발급 + DM
//
// trading.ts 의 grantReferralBonus 는 "1:1 초대 즉시 $10,000 양쪽 지급" 규칙이고,
// 본 모듈은 마일스톤(누적) 보너스를 처리한다. 중복 지급은
// referral_missions 테이블의 milestone_*_claimed 플래그로 1회성 보장.

export const MILESTONE_3_REFERRALS = 3;
export const MILESTONE_3_BONUS_USD = 50_000;
export const MILESTONE_10_REFERRALS = 10;

export type MissionRow = {
  user_id: string;
  invited_count: number;
  milestone_3_claimed: boolean;
  milestone_10_claimed: boolean;
  promo_code: string | null;
  bonus_amount_granted: number;
};

export type MissionUpdateResult = {
  invitedCount: number;
  milestone3Awarded: boolean;
  milestone10Awarded: boolean;
  promoCode: string | null;
};

export class ReferralMissionEngine {
  constructor(
    private readonly db: Db,
    private readonly trading: TradingEngine,
    private readonly bot: Bot,
  ) {}

  private async ensureRow(userId: string): Promise<MissionRow> {
    const { data, error } = await this.db
      .from('referral_missions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`referralMission(select): ${error.message}`);
    if (data) return data as MissionRow;

    const { data: inserted, error: insertErr } = await this.db
      .from('referral_missions')
      .insert({ user_id: userId, invited_count: 0 })
      .select()
      .single();
    if (insertErr) throw new Error(`referralMission(insert): ${insertErr.message}`);
    return inserted as MissionRow;
  }

  // 초대자의 현재 invited_count 를 users.referred_by 로 다시 집계하고,
  // 마일스톤 도달 여부를 체크해 해당 보상을 지급한다. 신규 초대 발생 직후 호출.
  async evaluateMilestones(referrerUserId: string): Promise<MissionUpdateResult> {
    const count = await this.trading.getReferralCount(referrerUserId);
    const row = await this.ensureRow(referrerUserId);

    let milestone3Awarded = false;
    let milestone10Awarded = false;
    let promoCode: string | null = row.promo_code;
    const patch: Partial<MissionRow> = { invited_count: count };

    // 3명 마일스톤
    if (!row.milestone_3_claimed && count >= MILESTONE_3_REFERRALS) {
      // 지갑 직접 수정. optimistic lock 없이 1회성 insert 결과만 신뢰.
      const wallet = await this.trading.getWallet(referrerUserId);
      if (wallet) {
        const { error: walletErr } = await this.db
          .from('wallets')
          .update({ balance: wallet.balance + MILESTONE_3_BONUS_USD })
          .eq('user_id', referrerUserId);
        if (walletErr) {
          console.error('[referralMission] milestone_3 wallet update failed:', walletErr);
        } else {
          milestone3Awarded = true;
          patch.milestone_3_claimed = true;
          patch.bonus_amount_granted = row.bonus_amount_granted + MILESTONE_3_BONUS_USD;
        }
      }
    }

    // 10명 마일스톤 — Promo code 발급
    if (!row.milestone_10_claimed && count >= MILESTONE_10_REFERRALS) {
      const result = issuePromoCode();
      if (result.ok) {
        milestone10Awarded = true;
        promoCode = result.code;
        patch.milestone_10_claimed = true;
        patch.promo_code = result.code;
      } else {
        console.warn('[referralMission] milestone_10 promo issue skipped:', result.reason);
      }
    }

    // patch 업데이트
    if (Object.keys(patch).length > 0) {
      const { error: upErr } = await this.db
        .from('referral_missions')
        .update(patch)
        .eq('user_id', referrerUserId);
      if (upErr) {
        console.error('[referralMission] patch failed:', upErr);
      }
    }

    // DM 발송 — 보상 발생 시
    const user = await this.trading.getUserById(referrerUserId);
    if (user?.telegram_id) {
      if (milestone3Awarded) {
        await this.sendDm(
          user.telegram_id,
          `🎉 친구 3명을 초대하셨습니다!\n\n연습 자본에 *+$${MILESTONE_3_BONUS_USD.toLocaleString('en-US')}* 가 추가됐어요. 계속해서 초대해 10명 달성 시 Academy 1개월 쿠폰을 받을 수 있습니다.`,
        );
      }
      if (milestone10Awarded && promoCode) {
        await this.sendDm(
          user.telegram_id,
          `🏆 10명 초대 달성!\n\nAcademy 1개월 *Promo code* 가 발급되었습니다:\n\n\`${promoCode}\`\n\n구독 봇에서 코드를 적용해 주세요.`,
        );
      }
    }

    return {
      invitedCount: count,
      milestone3Awarded,
      milestone10Awarded,
      promoCode,
    };
  }

  // UI 표시용 — 현재 미션 상태 조회. 없으면 기본값으로 행 생성.
  async getStatus(userId: string): Promise<MissionRow> {
    return this.ensureRow(userId);
  }

  private async sendDm(telegramId: number, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.warn(`[referralMission] DM to ${telegramId} failed:`, (err as Error).message);
    }
  }
}
