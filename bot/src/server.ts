import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Bot } from 'grammy';
import { env } from './env.js';
import crypto from 'node:crypto';
import { type TradingEngine } from './engine/trading.js';
import { type RankingEngine } from './engine/ranking.js';
import { type ReferralMissionEngine } from './engine/referralMission.js';
import { checkIsPremium } from './services/premiumCache.js';
import { issuePromoCode } from './services/invitemember.js';
import type { PriceCache } from './priceCache.js';
import { tradeLimiter, readLimiter, adminLimiter } from './middleware/rateLimit.js';

// 결제 식별자 — Stars invoice 의 payload 필드.
// 성공 콜백 시 이 prefix 로 판별해 revivePaidUser 호출.
export const STARS_PAYLOAD_PREFIX = 'recharge_v1:';
export const STARS_AMOUNT = 150; // PRD: 150 Stars 재구매

export const STARS_ELITE_PREFIX = 'elite_v1:';
export const STARS_ELITE_AMOUNT = 500; // 500 Stars for Elite Lifetime Pass

type Deps = {
  engine: TradingEngine;
  priceCache: PriceCache;
  bot: Bot;
  rankingEngine: RankingEngine;
  referralMission: ReferralMissionEngine;
};

// -------------------------------------------------------------------------
// CORS — 개발 중엔 동일 오리진(Vite proxy) 또는 cloudflared 터널에서 호출.
// 프로덕션에선 Express 앞단 reverse proxy 로 바꾸되, 우선 permissive 로 둔다.
// -------------------------------------------------------------------------
function cors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

function verifyInitData(initData: string, botToken: string): number | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
      
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (calculatedHash !== hash) return null;
    
    const userStr = urlParams.get('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    return typeof user.id === 'number' ? user.id : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------
// 요청 헤더에서 initData 를 꺼내 HMAC 검증 후 UserRow 로 치환.
// Stage 12: 프로덕션 배포 전 필수 보안 적용 완료.
// -------------------------------------------------------------------------
async function resolveUser(
  engine: TradingEngine,
  req: Request,
): Promise<string | { error: string; status: number }> {
  const initData = req.header('X-Telegram-Init-Data');
  let telegramUserId: number | null = null;

  if (initData) {
    telegramUserId = verifyInitData(initData, env.BOT_TOKEN);
    if (!telegramUserId) {
      return { error: 'Invalid or forged initData signature', status: 401 };
    }
  } else if (env.NODE_ENV === 'development') {
    // 로컬 개발 환경용 fallback (브라우저에서 직접 테스트 시)
    const idParam = req.method === 'GET' ? req.query.telegramUserId : req.body.telegramUserId;
    telegramUserId = Number(idParam);
  } else {
    return { error: 'Missing X-Telegram-Init-Data header (Production requires Mini App context)', status: 401 };
  }

  if (!telegramUserId || !Number.isInteger(telegramUserId) || telegramUserId <= 0) {
    return { error: 'invalid telegramUserId', status: 400 };
  }
  const user = await engine.getUserByTelegramId(telegramUserId);
  if (!user) {
    return { error: 'user not found — run /start in bot first', status: 404 };
  }
  return user.id;
}

// -------------------------------------------------------------------------
// Express 앱 구성 — 엔진/캐시/봇 을 주입받아 라우트 연결.
// -------------------------------------------------------------------------
export function createServer({ engine, priceCache, bot, rankingEngine, referralMission }: Deps): Express {
  const app = express();
  const yesterdayPnlCache = new Map<string, { value: number; date: string }>();

  // Render / Vercel 등 프록시 뒤에서 req.ip 를 X-Forwarded-For 로 해석 — rate limit 정확도.
  app.set('trust proxy', 1);

  app.use(cors);
  app.use(express.json());

  // B-16 — 읽기성 엔드포인트 전반에 기본 rate limit. 거래/결제는 아래에서 덮어씀.
  app.use('/api', readLimiter);
  app.use('/api/trade', tradeLimiter);
  app.use('/api/payment', tradeLimiter);
  app.use('/api/admin', adminLimiter);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV, prices: priceCache.snapshot() });
  });

  // ---- 오늘의 랭킹 조회 --------------------------------------------------------
  // 실시간 1분 주기로 계산된 캐시를 반환한다.
  app.get('/api/rankings/today', (_req, res) => {
    try {
      res.json({ rankings: rankingEngine.getTop100() });
    } catch (err) {
      console.error('[server] /rankings/today:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 상태 조회 ------------------------------------------------------------
  // 프론트는 2초마다 폴링 → 지갑/청산/포지션 이 한 번에 동기화.
  // Stage 9: verification(최근 인증 신청 1건) 포함 → PremiumTab 이 Pending 상태 복원 가능.
  app.get('/api/user/status', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }
      const [wallet, position, verification] = await Promise.all([
        engine.getWallet(resolved),
        engine.getOpenPosition(resolved),
        engine.getLatestVerification(resolved),
      ]);

      const userRow = await engine.getUserById(resolved);
      const telegramUserId = userRow?.telegram_id;
      let isPremium = false;
      let rank = 0;
      let yesterdayPnl = 0;
      let referralCount = 0;
      let history: { date: string; pnl: number }[] = [];

      if (telegramUserId) {
        // 1. isPremium
        const isStarsPremium = await engine.hasStarsPremium(resolved);
        isPremium = isStarsPremium || await checkIsPremium(bot, telegramUserId);

        // 2. rank (오늘 랭킹)
        const top100 = rankingEngine.getTop100();
        const foundIndex = top100.findIndex(r => r.telegramUserId === telegramUserId);
        rank = foundIndex >= 0 ? foundIndex + 1 : 0;

        // 3. yesterdayPnl (DB 스냅샷 조회 + 메모리 캐시)
        const kstOffset = 9 * 60 * 60 * 1000;
        const nowKst = new Date(Date.now() + kstOffset);
        // "어제"의 날짜 문자열 (YYYY-MM-DD)
        nowKst.setUTCDate(nowKst.getUTCDate() - 1);
        const yDateStr: string = nowKst.toISOString().split('T')[0]!;

        const cachedPnl = yesterdayPnlCache.get(resolved);
        if (cachedPnl && cachedPnl.date === yDateStr) {
          yesterdayPnl = cachedPnl.value;
        } else {
          try {
            const { data } = await engine['db'] // engine.db is private, wait, maybe just use supabase directly?
              .from('ranking_snapshots')
              .select('daily_pnl')
              .eq('user_id', resolved)
              .eq('date', yDateStr)
              .maybeSingle();
            yesterdayPnl = data ? Number(data.daily_pnl) : 0;
            yesterdayPnlCache.set(resolved, { value: yesterdayPnl, date: yDateStr });
          } catch (err) {
            console.error('[server] failed to fetch yesterdayPnl', err);
          }
        }

        // 3.5. history (최근 7일 손익)
        try {
          const past7Kst = new Date(nowKst.getTime() - 6 * 24 * 60 * 60 * 1000); // nowKst is already yesterday
          const past7Str = past7Kst.toISOString().split('T')[0]!;
          const { data: histData } = await engine['db']
            .from('ranking_snapshots')
            .select('date, daily_pnl')
            .eq('user_id', resolved)
            .gte('date', past7Str)
            .order('date', { ascending: true });
            
          if (histData) {
            history = histData.map(d => ({ date: d.date, pnl: Number(d.daily_pnl) }));
          }
        } catch (err) {
          console.error('[server] failed to fetch history', err);
        }

        // 4. referralCount
        try {
          referralCount = await engine.getReferralCount(resolved);
        } catch (err) {
          console.error('[server] failed to fetch referralCount', err);
        }
      }

      // B-08 — 미션 상태. 실패 시 기본값으로 폴백.
      let mission: {
        referredCount: number;
        milestone3Claimed: boolean;
        milestone10Claimed: boolean;
        promoCode: string | null;
      } = {
        referredCount: referralCount,
        milestone3Claimed: false,
        milestone10Claimed: false,
        promoCode: null,
      };
      try {
        const row = await referralMission.getStatus(resolved);
        mission = {
          referredCount: Math.max(referralCount, row.invited_count),
          milestone3Claimed: row.milestone_3_claimed,
          milestone10Claimed: row.milestone_10_claimed,
          promoCode: row.promo_code,
        };
      } catch (err) {
        console.error('[server] failed to fetch mission', err);
      }

      res.json({
        userId: resolved,
        balance: wallet?.balance ?? 0,
        isLiquidated: wallet?.is_liquidated ?? false,
        lastCreditedAt: wallet?.last_credited_at ?? null,
        position: position
          ? {
              id: position.id,
              symbol: position.symbol,
              side: position.side,
              size: position.size,
              leverage: position.leverage,
              entryPrice: Number(position.entry_price),
              liquidationPrice:
                position.liquidation_price === null ? null : Number(position.liquidation_price),
              openedAt: position.opened_at,
            }
          : null,
        verification: verification
          ? {
              id: verification.id,
              exchangeId: verification.exchange_id,
              uid: verification.uid,
              email: verification.email,
              status: verification.status,
              createdAt: verification.created_at,
            }
          : null,
        // Stage 9: VIP 플래그는 MVP 에서 "approved 인증 1건 이상" 으로 정의.
        // 추후 Stars 결제/수동 지급 등으로 확장 가능.
        isVIP: verification?.status === 'approved' || isPremium,
        isPremium,
        rank,
        yesterdayPnl,
        referralCount,
        history,
        mission,
        telegramUserId,
      });
    } catch (err) {
      console.error('[server] /user/status:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 거래소 UID 인증 제출 ------------------------------------------------
  // PremiumTab InlineUpgradeForm 이 submit 시 호출.
  // body: { telegramUserId, exchangeId, uid, email? }
  app.post('/api/verify', async (req, res) => {
    try {
      const { telegramUserId, exchangeId, uid, email } = req.body as {
        telegramUserId?: number;
        exchangeId?: string;
        uid?: string;
        email?: string | null;
      };

      if (typeof exchangeId !== 'string' || exchangeId.trim().length === 0) {
        res.status(400).json({ error: 'exchangeId required' });
        return;
      }
      const trimmedUid = typeof uid === 'string' ? uid.trim() : '';
      if (trimmedUid.length < 3 || trimmedUid.length > 64) {
        res.status(400).json({ error: 'uid must be 3..64 characters' });
        return;
      }
      const trimmedEmail =
        typeof email === 'string' && email.trim().length > 0 ? email.trim() : null;

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const row = await engine.submitVerification({
        user_id: resolved,
        exchange_id: exchangeId.trim(),
        uid: trimmedUid,
        email: trimmedEmail,
      });

      res.json({
        ok: true,
        verification: {
          id: row.id,
          exchangeId: row.exchange_id,
          uid: row.uid,
          email: row.email,
          status: row.status,
          createdAt: row.created_at,
        },
      });
    } catch (err) {
      console.error('[server] /verify:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 거래 내역 (Portfolio 탭) ---------------------------------------------
  // 최근 종료/청산 포지션 20건. 프론트 PortfolioTab 이 렌더링.
  app.get('/api/user/history', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }
      const rows = await engine.getPositionHistory(resolved, 20);
      res.json({
        history: rows.map((p) => ({
          id: p.id,
          symbol: p.symbol,
          side: p.side,
          size: p.size,
          leverage: p.leverage,
          entryPrice: Number(p.entry_price),
          status: p.status,
          pnl: p.pnl,
          openedAt: p.opened_at,
          closedAt: p.closed_at,
        })),
      });
    } catch (err) {
      console.error('[server] /user/history:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 랭킹 데이터 (Sprint 3) -----------------------------------------------
  app.get('/api/rankings/today', (req, res) => {
    try {
      const top100 = rankingEngine.getTop100();
      res.json({ rankings: top100 });
    } catch (err) {
      console.error('[server] /rankings/today:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/rankings/yesterday', async (req, res) => {
    try {
      const kstOffset = 9 * 60 * 60 * 1000;
      const nowKst = new Date(Date.now() + kstOffset);
      nowKst.setUTCDate(nowKst.getUTCDate() - 1);
      const yDateStr = nowKst.toISOString().split('T')[0];

      // fallback 쿼리 (ranking_snapshots 테이블이 없으면 빈 배열 반환)
      try {
        const { data, error } = await engine['db']
          .from('ranking_snapshots')
          .select('user_id, rank, equity, daily_pnl, daily_pnl_pct, users(telegram_id, username)')
          .eq('date', yDateStr)
          .order('rank', { ascending: true })
          .limit(100);

        if (error || !data) {
          res.json({ rankings: [] });
          return;
        }

        const formatted = data.map((r: any) => ({
          rank: r.rank,
          telegramUserId: r.users?.telegram_id || 0,
          username: r.users?.username || 'Unknown',
          equity: r.equity,
          dailyPnl: r.daily_pnl,
          dailyPnlPercent: r.daily_pnl_pct,
        }));
        res.json({ rankings: formatted });
      } catch (e) {
        // 테이블이 존재하지 않을 때 대비
        res.json({ rankings: [] });
      }
    } catch (err) {
      console.error('[server] /rankings/yesterday:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 포지션 오픈 ----------------------------------------------------------
  app.post('/api/trade/open', async (req, res) => {
    try {
      const { telegramUserId, symbol, side, size, leverage, fallbackPrice } = req.body as {
        telegramUserId?: number;
        symbol?: string;
        side?: 'long' | 'short';
        size?: number;
        leverage?: number;
        fallbackPrice?: number;
      };

      if (!symbol || (side !== 'long' && side !== 'short')) {
        res.status(400).json({ error: 'invalid symbol/side' });
        return;
      }
      if (!Number.isFinite(size) || !size || size <= 0) {
        res.status(400).json({ error: 'size must be positive number' });
        return;
      }
      if (!Number.isInteger(leverage) || !leverage || leverage < 1 || leverage > 125) {
        res.status(400).json({ error: 'leverage must be 1..125' });
        return;
      }

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const cachedPrice = priceCache.get(symbol);
      const markPrice = cachedPrice ?? fallbackPrice;
      if (!markPrice || markPrice <= 0) {
        res.status(503).json({ error: `price feed unavailable for ${symbol}` });
        return;
      }

      const position = await engine.openPosition({
        userId: resolved,
        symbol,
        positionType: 'futures',
        side,
        size,
        leverage,
        markPrice,
      });
      res.json({ ok: true, positionId: position.id, entryPrice: markPrice });
    } catch (err) {
      // 엔진의 비즈니스 에러(LIQUIDATED / INSUFFICIENT_BALANCE) 는 400 으로.
      const msg = (err as Error).message;
      const status = /^(LIQUIDATED|INSUFFICIENT_BALANCE|spot|size)/.test(msg) ? 400 : 500;
      console.error('[server] /trade/open:', msg);
      res.status(status).json({ error: msg });
    }
  });

  // ---- 포지션 종료 ----------------------------------------------------------
  app.post('/api/trade/close', async (req, res) => {
    try {
      const { telegramUserId, positionId, fallbackPrice } = req.body as {
        telegramUserId?: number;
        positionId?: string;
        fallbackPrice?: number;
      };

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const position = positionId
        ? null // 특정 ID 닫기 — 현재 UI 는 activePositionId 를 가지고 있으므로 그대로 사용
        : await engine.getOpenPosition(resolved);

      const targetId = positionId ?? position?.id;
      if (!targetId) {
        res.status(404).json({ error: 'no open position' });
        return;
      }

      // 대상 심볼의 최신가가 필요 — positionId 로 닫는 경우엔 symbol 을 조회해야 함.
      const target = position ?? (await engine.getOpenPosition(resolved));
      if (!target) {
        res.status(404).json({ error: 'position not found or not open' });
        return;
      }
      const cachedPrice = priceCache.get(target.symbol);
      const markPrice = cachedPrice ?? fallbackPrice;
      if (!markPrice || markPrice <= 0) {
        res.status(503).json({ error: `price feed unavailable for ${target.symbol}` });
        return;
      }

      const result = await engine.closePosition({ positionId: targetId, markPrice });
      res.json({ ok: true, pnl: result.pnl, balance: result.newBalance, exitPrice: markPrice });
    } catch (err) {
      console.error('[server] /trade/close:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Telegram Stars 인보이스 발행 ----------------------------------------
  // chat_id = 유저 telegram_id (봇과의 private chat). /start 로 유저가 봇을 연 상태가 전제.
  // Stars: currency='XTR', provider_token 생략, prices amount = Stars 개수.
  app.post('/api/payment/stars', async (req, res) => {
    try {
      const { telegramUserId, productType = 'reset' } = req.body as { telegramUserId?: number; productType?: 'reset' | 'elite' };
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      let payload: string;
      let title: string;
      let description: string;
      let amount: number;

      if (productType === 'elite') {
        payload = `${STARS_ELITE_PREFIX}${resolved}:${Date.now()}`;
        title = 'Elite Lifetime Pass';
        description = 'Unlock VIP Analyst Chat, Multi-charts, and lifetime benefits.';
        amount = STARS_ELITE_AMOUNT;
      } else {
        payload = `${STARS_PAYLOAD_PREFIX}${resolved}:${Date.now()}`;
        title = 'Trading Academy · Risk Management Reset';
        description = 'Reset practice balance to $100,000 and resume the paper-trading lesson.';
        amount = STARS_AMOUNT;
      }

      const invoiceLink = await bot.api.createInvoiceLink(
        title,
        description,
        payload,
        '', // provider_token must be empty for Telegram Stars
        'XTR',
        [{ label: title, amount }],
      );
      res.json({ ok: true, invoiceLink });
    } catch (err) {
      console.error('[server] /payment/stars:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 관리자 전용 API (B-14) ------------------------------------------------
  app.post('/api/admin/verify', async (req, res) => {
    try {
      const adminSecret = req.headers['x-admin-secret'];
      if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        res.status(401).json({ error: 'unauthorized admin' });
        return;
      }

      const { userId, status, adminNote } = req.body as {
        userId: string;
        status: 'approved' | 'rejected';
        adminNote?: string;
      };

      if (!userId || (status !== 'approved' && status !== 'rejected')) {
        res.status(400).json({ error: 'invalid payload' });
        return;
      }

      // 1. exchange_verifications 테이블 업데이트
      const { error: vErr } = await engine['db']
        .from('exchange_verifications')
        .update({ status })
        .eq('user_id', userId);

      if (vErr) throw new Error(`verification update failed: ${vErr.message}`);

      // 2. 승인 시 is_verified 업데이트 + B-13 Promo code 자동 발급 DM
      let issuedPromo: string | null = null;
      if (status === 'approved') {
        const { error: uErr } = await engine['db']
          .from('users')
          .update({ is_verified: true })
          .eq('id', userId);
        if (uErr) throw new Error(`user verify update failed: ${uErr.message}`);

        // Promo 발급 + 텔레그램 DM. 실패해도 승인 흐름은 유지.
        const promo = issuePromoCode();
        if (promo.ok) {
          issuedPromo = promo.code;
          try {
            const userRow = await engine.getUserById(userId);
            if (userRow?.telegram_id) {
              await bot.api.sendMessage(
                userRow.telegram_id,
                `✅ 거래소 UID 인증이 *승인*되었습니다!\n\n1개월 Academy Promo code 를 발송드립니다:\n\n\`${promo.code}\`\n\n구독 봇에서 적용해 주세요.`,
                { parse_mode: 'Markdown' },
              );
            }
          } catch (dmErr) {
            console.warn('[server] approval DM failed:', dmErr);
          }
        }
      }

      // 3. D-04 감사 로그 기록 — 실패는 응답에 영향 안 줌.
      try {
        await engine['db'].from('admin_actions').insert({
          actor_label: 'x-admin-secret',
          action_type: status === 'approved' ? 'verify_approve' : 'verify_reject',
          target_user_id: userId,
          payload: { status, adminNote: adminNote ?? null },
          note: adminNote ?? null,
          ip_address: req.ip ?? null,
        });
      } catch (auditErr) {
        console.warn('[server] admin audit log failed:', auditErr);
      }

      res.json({
        ok: true,
        userId,
        status,
        message: `verification ${status}`,
        promoCode: issuedPromo,
      });
    } catch (err) {
      console.error('[server] /admin/verify:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- 관리자 메트릭스 (A-05) ------------------------------------------------
  // 대표님 전용. DAU / MAU / 총 결제 유저수 / 청산율 요약.
  app.get('/api/admin/metrics', async (req, res) => {
    try {
      const adminSecret = req.headers['x-admin-secret'];
      if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        res.status(401).json({ error: 'unauthorized admin' });
        return;
      }

      const db = engine['db'];
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [{ count: totalUsers }, { count: dau }, { count: mau }, { count: liquidated }, { count: verified }] =
        await Promise.all([
          db.from('users').select('*', { count: 'exact', head: true }),
          db.from('positions').select('user_id', { count: 'exact', head: true }).gte('opened_at', dayAgo),
          db.from('positions').select('user_id', { count: 'exact', head: true }).gte('opened_at', monthAgo),
          db.from('wallets').select('*', { count: 'exact', head: true }).eq('is_liquidated', true),
          db.from('users').select('*', { count: 'exact', head: true }).eq('is_verified', true),
        ]);

      res.json({
        totalUsers: totalUsers ?? 0,
        dau: dau ?? 0,
        mau: mau ?? 0,
        liquidated: liquidated ?? 0,
        liquidationRate:
          totalUsers && totalUsers > 0 ? ((liquidated ?? 0) / totalUsers) * 100 : 0,
        verified: verified ?? 0,
        conversionRate:
          totalUsers && totalUsers > 0 ? ((verified ?? 0) / totalUsers) * 100 : 0,
      });
    } catch (err) {
      console.error('[server] /admin/metrics:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
