import type { Db } from '../db/supabase.js';
import type {
  PositionInsert,
  PositionRow,
  PositionSide,
  PositionType,
  UserInsert,
  UserRow,
  VerificationInsert,
  VerificationRow,
  WalletRow,
} from '../db/types.js';
import { env } from '../env.js';

// Stage 9 — 레퍼럴 보너스 고정값. $10,000 = 10_000 (USD 정수 달러 단위).
const REFERRAL_BONUS = 10_000;
import {
  calculateLiquidationPrice,
  calculatePnl,
  isLiquidated,
} from './liquidation.js';

// ---------------------------------------------------------------------------
// TradingEngine: DB 의존 로직. 순수 계산은 liquidation.ts 위임.
// ---------------------------------------------------------------------------
export class TradingEngine {
  constructor(private readonly db: Db) {}

  // -------------------------------------------------------------------------
  // 유저/지갑 upsert — /start 시 호출
  //
  // Stage 9: {user, isNew} 반환. 신규 유저일 때만 referred_by 를 DB 에 기록하고,
  // 재접속 유저의 referred_by 를 덮어쓰지 않는다 (레퍼럴 재귀 악용 차단).
  // -------------------------------------------------------------------------
  async upsertUser(payload: UserInsert): Promise<{ user: UserRow; isNew: boolean }> {
    const existing = await this.getUserByTelegramId(payload.telegram_id);

    if (existing) {
      // 재접속: 프로필 필드만 최신화, referred_by 는 절대 덮어쓰지 않음.
      const { data, error } = await this.db
        .from('users')
        .update({
          username: payload.username ?? null,
          first_name: payload.first_name ?? null,
          language_code: payload.language_code ?? null,
        })
        .eq('telegram_id', payload.telegram_id)
        .select()
        .single();
      if (error) throw new Error(`upsertUser(update): ${error.message}`);
      await this.ensureWallet((data as UserRow).id);
      return { user: data as UserRow, isNew: false };
    }

    const { data, error } = await this.db
      .from('users')
      .insert({
        telegram_id: payload.telegram_id,
        username: payload.username ?? null,
        first_name: payload.first_name ?? null,
        language_code: payload.language_code ?? null,
        referred_by: payload.referred_by ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`upsertUser(insert): ${error.message}`);

    await this.ensureWallet((data as UserRow).id);
    return { user: data as UserRow, isNew: true };
  }

  // -------------------------------------------------------------------------
  // Stage 9 — 레퍼럴 보너스. 신규 유저 + 유효 초대자 둘 다 +$10,000.
  //   · 이미 referred_by 가 설정된 유저(=보너스 수령 이력) 는 재지급 안 함.
  //   · 본인 초대는 차단.
  //   · 성공 시 {referrerId, referrerTelegramId, newBalance, referrerBalance} 반환.
  //   · 실패(초대자 없음/자기자신/이미 지급) 는 null.
  // -------------------------------------------------------------------------
  async grantReferralBonus(
    newUserId: string,
    referrerTelegramId: number,
  ): Promise<{
    referrerId: string;
    referrerTelegramId: number;
    newBalance: number;
    referrerBalance: number;
  } | null> {
    const referrer = await this.getUserByTelegramId(referrerTelegramId);
    if (!referrer) return null;
    if (referrer.id === newUserId) return null;

    const [newWallet, refWallet] = await Promise.all([
      this.getWallet(newUserId),
      this.getWallet(referrer.id),
    ]);
    if (!newWallet || !refWallet) return null;

    // newUser 의 referred_by 컬럼이 이번 초대자로 세팅된 경우에만 지급.
    // (upsertUser 가 신규 insert 시에만 referred_by 를 썼으므로 자연스럽게 1회성 보장.)
    const newUser = await this.db
      .from('users')
      .select('id,referred_by')
      .eq('id', newUserId)
      .single();
    if (newUser.error) throw new Error(`grantReferralBonus(lookup): ${newUser.error.message}`);
    if ((newUser.data as { referred_by: string | null }).referred_by !== referrer.id) {
      // referred_by 미일치 = 이미 보너스 처리됐거나 기록 불일치. 스킵.
      return null;
    }

    const newBalance = newWallet.balance + REFERRAL_BONUS;
    const referrerBalance = refWallet.balance + REFERRAL_BONUS;

    const [newRes, refRes] = await Promise.all([
      this.db.from('wallets').update({ balance: newBalance }).eq('user_id', newUserId),
      this.db.from('wallets').update({ balance: referrerBalance }).eq('user_id', referrer.id),
    ]);
    if (newRes.error) throw new Error(`grantReferralBonus(new): ${newRes.error.message}`);
    if (refRes.error) throw new Error(`grantReferralBonus(ref): ${refRes.error.message}`);

    // 지급 완료 표시: referred_by 는 그대로 두되, 재지급을 막기 위해 별도 플래그가 필요하면
    // 추후 `referral_bonus_granted_at` 컬럼으로 분리. MVP 는 wallet update 1회로 충분
    // (다음 호출 시 newUser.referred_by 가 여전히 일치하므로 중복 방지는 서버 레벨에서만
    // 보장됨 — 동일 /start 플로우에서만 호출되므로 실질 재발 안 남).
    return {
      referrerId: referrer.id,
      referrerTelegramId: referrer.telegram_id,
      newBalance,
      referrerBalance,
    };
  }

  // -------------------------------------------------------------------------
  // Stage 9 — 거래소 UID 인증 신청. PremiumTab POST /api/verify 에서 호출.
  // -------------------------------------------------------------------------
  async submitVerification(payload: VerificationInsert): Promise<VerificationRow> {
    const { data, error } = await this.db
      .from('exchange_verifications')
      .insert({
        user_id: payload.user_id,
        exchange_id: payload.exchange_id,
        uid: payload.uid,
        email: payload.email ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`submitVerification: ${error.message}`);
    return data as VerificationRow;
  }

  // 최근 1건의 인증 신청 조회. /api/user/status 응답에 포함.
  async getLatestVerification(userId: string): Promise<VerificationRow | null> {
    const { data, error } = await this.db
      .from('exchange_verifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`getLatestVerification: ${error.message}`);
    return (data as VerificationRow | null) ?? null;
  }

  private async ensureWallet(userId: string): Promise<void> {
    const { error } = await this.db
      .from('wallets')
      .upsert(
        { user_id: userId, balance: 0, is_liquidated: false },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(`ensureWallet: ${error.message}`);
  }

  async getUserByTelegramId(telegramId: number): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (error) throw new Error(`getUserByTelegramId: ${error.message}`);
    return (data as UserRow | null) ?? null;
  }

  async getReferralCount(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', userId);
    if (error) throw new Error(`getReferralCount: ${error.message}`);
    return count ?? 0;
  }

  async getUserById(userId: string): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(`getUserById: ${error.message}`);
    return (data as UserRow | null) ?? null;
  }

  async getWallet(userId: string): Promise<WalletRow | null> {
    const { data, error } = await this.db
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`getWallet: ${error.message}`);
    return (data as WalletRow | null) ?? null;
  }

  // -------------------------------------------------------------------------
  // Stage 10 — 최초 1회 시드 지급 (Hard Paywall)
  //   - last_credited_at === null → 신규 지갑 → $100K 시드 지급 후 flag 기록.
  //   - last_credited_at !== null → 이미 수령 이력 있음 → no-op.
  //   - 청산 유저는 절대 자동 복구 안 됨. Stars 결제(revivePaidUser) 만이 유일 경로.
  //
  // 과거 grantDailyAllowance 와의 차이:
  //   · todayUtc 비교 제거 — 날짜 상관없이 "수령 여부" 만 본다.
  //   · last_credited_at 을 ISO 타임스탬프(timestamptz 안전) 로 기록. 날짜만 필요한 게 아니라
  //     "언제 한 번 받았는가" 의 영구 기록으로 의미가 전환됨. DB 컬럼 타입은 date 라 ISO 10자
  //     슬라이스로 맞추되, null 여부만 판정에 사용.
  // -------------------------------------------------------------------------
  async grantInitialSeed(userId: string): Promise<{ granted: boolean; balance: number }> {
    const wallet = await this.getWallet(userId);
    if (!wallet) throw new Error(`wallet not found for user ${userId}`);

    if (wallet.last_credited_at !== null) {
      // 이미 최초 시드 수령 완료 — 남은 잔고 그대로 반환.
      return { granted: false, balance: wallet.balance };
    }

    const seed = Number(env.DAILY_ALLOWANCE);
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.db
      .from('wallets')
      .update({
        balance: seed,
        is_liquidated: false,
        last_credited_at: todayIso,
      })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`grantInitialSeed: ${error.message}`);

    return { granted: true, balance: (data as WalletRow).balance };
  }

  // -------------------------------------------------------------------------
  // 포지션 오픈 (시장가)
  //   - 지갑 잔고 차감 → positions insert
  //   - 청산된 지갑은 진입 불가 (IsLiquidated 플래그)
  // -------------------------------------------------------------------------
  async openPosition(args: {
    userId: string;
    symbol: string;
    positionType: PositionType;
    side: PositionSide;
    size: number;
    leverage: number;
    markPrice: number;
  }): Promise<PositionRow> {
    const { userId, symbol, positionType, side, size, leverage, markPrice } = args;

    if (positionType === 'spot' && leverage !== 1) {
      throw new Error('spot position must use leverage=1');
    }
    if (size <= 0) throw new Error('size must be positive');

    const wallet = await this.getWallet(userId);
    if (!wallet) throw new Error('wallet missing');
    if (wallet.is_liquidated) {
      throw new Error('LIQUIDATED: 재결제 전까지 포지션 진입 불가');
    }
    if (wallet.balance < size) {
      throw new Error(`INSUFFICIENT_BALANCE: ${wallet.balance} < ${size}`);
    }

    const liquidationPrice = calculateLiquidationPrice({
      side,
      entryPrice: markPrice,
      leverage,
    });

    // 지갑 차감 → 포지션 생성 (원자성 보장을 위해선 RPC 함수가 이상적이지만
    // Stage 2는 순차 처리 + 실패 시 롤백 로직으로 단순화).
    const newBalance = wallet.balance - size;
    const walletUpdate = await this.db
      .from('wallets')
      .update({ balance: newBalance })
      .eq('user_id', userId)
      .eq('balance', wallet.balance); // optimistic lock (balance 바뀌었으면 실패)
    if (walletUpdate.error) throw new Error(`openPosition(wallet): ${walletUpdate.error.message}`);

    const insert: PositionInsert = {
      user_id: userId,
      symbol,
      position_type: positionType,
      side,
      size,
      leverage,
      entry_price: markPrice,
      liquidation_price: liquidationPrice,
    };
    const { data, error } = await this.db
      .from('positions')
      .insert(insert)
      .select()
      .single();
    if (error) {
      // 롤백: 차감한 잔고 복원
      await this.db
        .from('wallets')
        .update({ balance: wallet.balance })
        .eq('user_id', userId);
      throw new Error(`openPosition(insert): ${error.message}`);
    }

    return data as PositionRow;
  }

  // -------------------------------------------------------------------------
  // 포지션 종료 (시장가 청산 아님, 자발적 종료)
  //   - PnL 계산 → 지갑에 size + pnl 반환 (음수 pnl은 손실)
  //   - status='closed'
  // -------------------------------------------------------------------------
  async closePosition(args: {
    positionId: string;
    markPrice: number;
  }): Promise<{ pnl: number; newBalance: number }> {
    const { positionId, markPrice } = args;

    const { data: posData, error: posErr } = await this.db
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .eq('status', 'open')
      .single();
    if (posErr || !posData) throw new Error(`closePosition: position not found or not open`);
    const position = posData as PositionRow;

    const pnl = calculatePnl({
      side: position.side,
      entryPrice: Number(position.entry_price),
      exitPrice: markPrice,
      size: position.size,
      leverage: position.leverage,
    });

    // 반환: 증거금(size) + pnl. 총합이 음수가 되면 0에서 멈춘다(청산은 별도 경로).
    const returnAmount = Math.max(0, position.size + pnl);

    const wallet = await this.getWallet(position.user_id);
    if (!wallet) throw new Error('closePosition: wallet missing');
    const newBalance = wallet.balance + returnAmount;

    const { error: walletErr } = await this.db
      .from('wallets')
      .update({ balance: newBalance })
      .eq('user_id', position.user_id);
    if (walletErr) throw new Error(`closePosition(wallet): ${walletErr.message}`);

    const { error: updErr } = await this.db
      .from('positions')
      .update({ status: 'closed', pnl, closed_at: new Date().toISOString() })
      .eq('id', positionId);
    if (updErr) throw new Error(`closePosition(update): ${updErr.message}`);

    return { pnl, newBalance };
  }

  // -------------------------------------------------------------------------
  // 청산 감시 — 가격 피드 이벤트마다 호출
  //   - 해당 심볼의 open futures 포지션 중 청산가 도달한 것 찾아 처리
  //   - 처리: status='liquidated', 지갑 is_liquidated=true, balance=0
  //   - PRD: 청산 시 전액 몰수 (현재 포지션 size뿐만 아니라 지갑 잔고 전체)
  // -------------------------------------------------------------------------
  async scanAndLiquidate(args: {
    symbol: string;
    markPrice: number;
  }): Promise<{ liquidatedCount: number }> {
    const { symbol, markPrice } = args;

    const { data, error } = await this.db
      .from('positions')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'open')
      .eq('position_type', 'futures');
    if (error) throw new Error(`scanAndLiquidate: ${error.message}`);

    const positions = (data as PositionRow[]) ?? [];
    const toLiquidate = positions.filter((p) =>
      isLiquidated({
        side: p.side,
        liquidationPrice: p.liquidation_price === null ? null : Number(p.liquidation_price),
        markPrice,
      }),
    );

    if (toLiquidate.length === 0) return { liquidatedCount: 0 };

    const now = new Date().toISOString();
    const affectedUsers = new Set(toLiquidate.map((p) => p.user_id));

    // 포지션 상태 업데이트
    const { error: updErr } = await this.db
      .from('positions')
      .update({
        status: 'liquidated',
        pnl: 0, // 증거금 전액 소실
        closed_at: now,
      })
      .in('id', toLiquidate.map((p) => p.id));
    if (updErr) throw new Error(`scanAndLiquidate(positions): ${updErr.message}`);

    // 지갑 몰수 (해당 유저별로)
    for (const userId of affectedUsers) {
      const { error: wErr } = await this.db
        .from('wallets')
        .update({ balance: 0, is_liquidated: true })
        .eq('user_id', userId);
      if (wErr) console.error(`[engine] wallet seize failed for ${userId}:`, wErr.message);

      // 같은 유저의 다른 open 포지션도 모두 liquidated로 전환 (지갑 0 → 유지 불가)
      const { error: restErr } = await this.db
        .from('positions')
        .update({ status: 'liquidated', pnl: 0, closed_at: now })
        .eq('user_id', userId)
        .eq('status', 'open');
      if (restErr) console.error(`[engine] cascade liquidate failed for ${userId}:`, restErr.message);
    }

    console.log(
      `[engine] liquidated ${toLiquidate.length} position(s) on ${symbol} @ ${markPrice}`,
    );
    return { liquidatedCount: toLiquidate.length };
  }

  // -------------------------------------------------------------------------
  // 조회 헬퍼 — /balance 명령에서 사용
  // -------------------------------------------------------------------------
  async countOpenPositions(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open');
    if (error) throw new Error(`countOpenPositions: ${error.message}`);
    return count ?? 0;
  }

  // -------------------------------------------------------------------------
  // 유저의 현재 오픈 포지션 1건 조회 — MVP 는 동시 1포지션 가정.
  // 프론트가 서버 권위로 포지션 카드 렌더링할 때 사용.
  // -------------------------------------------------------------------------
  async getOpenPosition(userId: string): Promise<PositionRow | null> {
    const { data, error } = await this.db
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`getOpenPosition: ${error.message}`);
    return (data as PositionRow | null) ?? null;
  }

  // -------------------------------------------------------------------------
  // Stage 6 PortfolioTab 용 — 최근 종료/청산 포지션 히스토리.
  //   - status in (closed, liquidated) 기준
  //   - closed_at DESC
  //   - 기본 limit 20 (모바일 리스트 범위)
  // -------------------------------------------------------------------------
  async getPositionHistory(
    userId: string,
    limit: number = 20,
  ): Promise<PositionRow[]> {
    const { data, error } = await this.db
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['closed', 'liquidated'])
      .order('closed_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`getPositionHistory: ${error.message}`);
    return (data as PositionRow[]) ?? [];
  }

  // -------------------------------------------------------------------------
  // Stars 결제 성공 후 부활.
  //   - balance 를 DAILY_ALLOWANCE 로 재충전
  //   - is_liquidated = false
  //   - last_credited_at 은 건드리지 않음 (최초 1회 플래그 독립)
  // 호출 경로: bot.on('message:successful_payment') → revivePaidUser(userId)
  // -------------------------------------------------------------------------
  async revivePaidUser(userId: string): Promise<{ balance: number }> {
    const allowance = Number(env.DAILY_ALLOWANCE);
    const { data, error } = await this.db
      .from('wallets')
      .update({ balance: allowance, is_liquidated: false })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`revivePaidUser: ${error.message}`);
    return { balance: (data as WalletRow).balance };
  }
}
