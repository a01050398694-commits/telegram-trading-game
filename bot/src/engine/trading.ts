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

// Stage 15.2 — INITIAL_SEED_USD 환경변수 우선, DAILY_ALLOWANCE fallback.
const INITIAL_SEED_USD = Number(process.env.INITIAL_SEED_USD || env.DAILY_ALLOWANCE);

// Stage 15.2 — 잠금 모드 지속시간 (분)
const LOCK_MODE_DURATION_MIN = Number(process.env.LOCK_MODE_DURATION_MINUTES || '30');

import {
  calculateLiquidationPrice,
  calculatePnl,
  isLiquidated,
} from './liquidation.js';

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// TradingEngine: DB 의존 로직. 순수 계산은 liquidation.ts 위임.
// ---------------------------------------------------------------------------
export class TradingEngine extends EventEmitter {
  constructor(private readonly db: Db) {
    super();
  }

  // -------------------------------------------------------------------------
  // 유저/지갑 upsert — /start 시 호출
  // -------------------------------------------------------------------------
  async upsertUser(payload: UserInsert): Promise<{ user: UserRow; isNew: boolean }> {
    const existing = await this.getUserByTelegramId(payload.telegram_id);

    if (existing) {
      // 재접속: 프로필 필드만 최신화
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
      })
      .select()
      .single();
    if (error) throw new Error(`upsertUser(insert): ${error.message}`);

    await this.ensureWallet((data as UserRow).id);
    return { user: data as UserRow, isNew: true };
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

  // Telegram Stars 결제를 통한 영구 프리미엄 권한 부여
  async grantStarsPremium(userId: string): Promise<void> {
    const { error } = await this.db.from('exchange_verifications').insert({
      user_id: userId,
      exchange_id: 'telegram_stars',
      uid: 'elite_lifetime_pass',
      status: 'approved',
    });
    if (error) throw new Error(`grantStarsPremium: ${error.message}`);
  }

  // Telegram Stars 결제로 부여된 영구 프리미엄 권한이 있는지 확인
  async hasStarsPremium(userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('exchange_verifications')
      .select('id')
      .eq('user_id', userId)
      .eq('exchange_id', 'telegram_stars')
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`hasStarsPremium: ${error.message}`);
    return !!data;
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

  async getAllTelegramIds(): Promise<number[]> {
    const { data, error } = await this.db
      .from('users')
      .select('telegram_id')
      .not('telegram_id', 'is', null);
    if (error) throw new Error(`getAllTelegramIds: ${error.message}`);
    return (data as { telegram_id: number }[]).map((r) => r.telegram_id);
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
  // Stage 15.2 — 최초 1회 시드 지급 (seeded_at 기반)
  //   - users.seeded_at IS NULL → 신규 유저 → $10K 시드 지급 후 seeded_at = now().
  //   - seeded_at NOT NULL → 이미 수령 → no-op.
  //   - 청산 유저는 절대 자동 복구 안 됨. Recharge 결제만이 유일 경로.
  // -------------------------------------------------------------------------
  async grantInitialSeed(userId: string): Promise<{ granted: boolean; balance: number }> {
    const wallet = await this.getWallet(userId);
    if (!wallet) throw new Error(`wallet not found for user ${userId}`);

    // seeded_at 체크 (users 테이블)
    const { data: userRow, error: userErr } = await this.db
      .from('users')
      .select('seeded_at')
      .eq('id', userId)
      .single();
    if (userErr) throw new Error(`grantInitialSeed(userCheck): ${userErr.message}`);

    if ((userRow as { seeded_at: string | null }).seeded_at !== null) {
      // 이미 최초 시드 수령 완료
      return { granted: false, balance: wallet.balance };
    }

    const seed = INITIAL_SEED_USD;
    const now = new Date().toISOString();

    // 지갑에 시드 충전
    const { data, error } = await this.db
      .from('wallets')
      .update({
        balance: seed,
        is_liquidated: false,
        last_credited_at: now.slice(0, 10),
      })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`grantInitialSeed(wallet): ${error.message}`);

    // seeded_at 기록 (재지급 방지)
    const { error: seedErr } = await this.db
      .from('users')
      .update({ seeded_at: now })
      .eq('id', userId);
    if (seedErr) throw new Error(`grantInitialSeed(seeded_at): ${seedErr.message}`);

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

    // Stage 15.2 — 매매 잠금 모드 가드
    await this.checkLockMode(userId);

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
      
      // Emit event for retention DM (B-10)
      this.emit('liquidated', userId);
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
    const allowance = INITIAL_SEED_USD;
    const { data, error } = await this.db
      .from('wallets')
      .update({ balance: allowance, is_liquidated: false })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`revivePaidUser: ${error.message}`);
    return { balance: (data as WalletRow).balance };
  }

  // -------------------------------------------------------------------------
  // Stage 15.2 — 매매 잠금 모드 체크
  //   · lock_mode_enabled && 직전 거래가 손실 → 30분 자동 잠금
  //   · 잠금 중 매매 시도 → 423 에러
  // -------------------------------------------------------------------------
  private async checkLockMode(userId: string): Promise<void> {
    const { data: userRow, error } = await this.db
      .from('users')
      .select('lock_mode_enabled, lock_mode_until')
      .eq('id', userId)
      .single();

    if (error || !userRow) return;

    const user = userRow as { lock_mode_enabled: boolean; lock_mode_until: string | null };
    if (!user.lock_mode_enabled) return;

    // 잠금 시간이 아직 남아 있으면 차단
    if (user.lock_mode_until) {
      const until = new Date(user.lock_mode_until).getTime();
      const now = Date.now();
      if (until > now) {
        const remainMin = Math.ceil((until - now) / 60000);
        throw new Error(`LOCK_MODE: 매매 잠금 중. ${remainMin}분 후 해제.`);
      }
      // 잠금 만료 → 해제
      await this.db
        .from('users')
        .update({ lock_mode_until: null })
        .eq('id', userId);
    }

    // 직전 거래가 손실인지 확인 → 자동 잠금 설정
    const { data: lastTrade } = await this.db
      .from('positions')
      .select('pnl')
      .eq('user_id', userId)
      .in('status', ['closed', 'liquidated'])
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastTrade && (lastTrade as { pnl: number }).pnl < 0) {
      // 직전 손실 + 잠금 모드 활성 → 30분 잠금 설정
      const lockUntil = new Date(Date.now() + LOCK_MODE_DURATION_MIN * 60 * 1000).toISOString();
      await this.db
        .from('users')
        .update({ lock_mode_until: lockUntil })
        .eq('id', userId);
      throw new Error(`LOCK_MODE: 직전 거래 손실 감지. ${LOCK_MODE_DURATION_MIN}분 매매 잠금 활성화.`);
    }
  }

  // -------------------------------------------------------------------------
  // Stage 15.2 — 매매 잠금 모드 토글
  // -------------------------------------------------------------------------
  async toggleLockMode(userId: string, enabled: boolean): Promise<{ lockModeEnabled: boolean }> {
    const update: Record<string, unknown> = { lock_mode_enabled: enabled };
    if (!enabled) {
      // 잠금 해제 시 lock_mode_until 도 초기화
      update.lock_mode_until = null;
    }
    const { error } = await this.db
      .from('users')
      .update(update)
      .eq('id', userId);
    if (error) throw new Error(`toggleLockMode: ${error.message}`);
    return { lockModeEnabled: enabled };
  }

  // -------------------------------------------------------------------------
  // Stage 15.3 — Telegram Stars Premium 구독 활성화
  //   · subscription_txns insert (idempotent: telegram_payment_charge_id UNIQUE)
  //   · users.is_premium=true, premium_until=now()+30d, subscription_id=chargeId
  //   · 중복 결제(같은 chargeId 재수신)는 silent no-op
  // -------------------------------------------------------------------------
  async activatePremium(
    userId: string,
    chargeId: string,
    amountStars: number,
    amountUsd: number,
  ): Promise<{ premiumUntil: string }> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { error: txError } = await this.db.from('subscription_txns').insert({
      user_id: userId,
      subscription_id: chargeId,
      amount_stars: amountStars,
      amount_usd: amountUsd,
      currency: 'XTR',
      status: 'active',
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
    });

    if (txError) {
      const msg = txError.message ?? '';
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        const { data: existing, error: queryErr } = await this.db
          .from('subscription_txns')
          .select('period_end')
          .eq('subscription_id', chargeId)
          .single();
        if (queryErr) throw new Error(`activatePremium(idempotent query): ${queryErr.message}`);
        const pe = (existing as { period_end: string } | null)?.period_end;
        if (!pe) throw new Error('activatePremium(duplicate): existing record missing period_end');
        throw new Error(`already_processed:${pe}`);
      }
      throw new Error(`activatePremium(tx): ${msg}`);
    }

    const { error: userErr } = await this.db
      .from('users')
      .update({
        is_premium: true,
        premium_until: periodEnd.toISOString(),
        subscription_id: chargeId,
      })
      .eq('id', userId);
    if (userErr) throw new Error(`activatePremium(user): ${userErr.message}`);

    return { premiumUntil: periodEnd.toISOString() };
  }

  // -------------------------------------------------------------------------
  // Stage 15.3 — Telegram Stars Recharge ($1,000 게임머니 충전)
  //   · recharge_txns insert (idempotent)
  //   · wallets.balance += creditUsd, is_liquidated=false
  //   · seeded_at 은 절대 건드리지 않음 (1회 시드 정책 보존)
  // -------------------------------------------------------------------------
  async creditRecharge(
    userId: string,
    chargeId: string,
    amountStars: number,
    amountUsd: number,
    creditUsd: number,
  ): Promise<{ balance: number }> {
    const { error: txError } = await this.db.from('recharge_txns').insert({
      user_id: userId,
      telegram_payment_charge_id: chargeId,
      amount_stars: amountStars,
      amount_usd: amountUsd,
      credit_amount: creditUsd,
      currency: 'XTR',
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    if (txError) {
      const msg = txError.message ?? '';
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        const wallet = await this.getWallet(userId);
        if (!wallet) throw new Error('creditRecharge(duplicate): wallet missing for idempotent lookup');
        throw new Error(`already_processed:${wallet.balance}`);
      }
      throw new Error(`creditRecharge(tx): ${msg}`);
    }

    const wallet = await this.getWallet(userId);
    if (!wallet) throw new Error(`creditRecharge: wallet not found for user ${userId}`);

    const newBalance = Number(wallet.balance) + creditUsd;
    const { data, error } = await this.db
      .from('wallets')
      .update({ balance: newBalance, is_liquidated: false })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`creditRecharge(wallet): ${error.message}`);

    return { balance: (data as WalletRow).balance };
  }

  // -------------------------------------------------------------------------
  // Stage 15.3 — Premium 만료 자동 강등 (cron 또는 API 응답 시점에 호출)
  //   · premium_until < now() 인 유저의 is_premium=false
  // -------------------------------------------------------------------------
  async expireStalePremium(): Promise<{ expired: number }> {
    const { data, error } = await this.db
      .from('users')
      .update({ is_premium: false })
      .lt('premium_until', new Date().toISOString())
      .eq('is_premium', true)
      .select('id');
    if (error) throw new Error(`expireStalePremium: ${error.message}`);
    return { expired: (data as { id: string }[] | null)?.length ?? 0 };
  }

  // Stage 15.3 — DB 기반 활성 Premium 체크 (subscription_txns + users.premium_until)
  async checkActivePremium(userId: string): Promise<boolean> {
    const { data } = await this.db
      .from('users')
      .select('is_premium, premium_until')
      .eq('id', userId)
      .single();
    const u = data as { is_premium: boolean; premium_until: string | null } | null;
    if (!u) return false;
    if (!u.is_premium) return false;
    if (!u.premium_until) return false;
    return new Date(u.premium_until).getTime() > Date.now();
  }
}
