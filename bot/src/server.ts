import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Bot } from 'grammy';
import { env } from './env.js';
import crypto from 'node:crypto';
import { type TradingEngine } from './engine/trading.js';
import { type RankingEngine } from './engine/ranking.js';
import { checkIsPremium } from './services/premiumCache.js';
import type { PriceCache } from './priceCache.js';
import { tradeLimiter, readLimiter, adminLimiter } from './middleware/rateLimit.js';

// Stage 15.1 — Stars 직접 결제 폐기. 모든 결제는 InviteMember 외부 봇 redirect.
// /api/payment/stars endpoint 와 STARS_* 상수, pre_checkout_query / successful_payment
// 핸들러 전부 제거. 결제 후 활성화는 Stage 15.2 의 InviteMember 채널 멤버십 폴링이 담당.

type Deps = {
  engine: TradingEngine;
  priceCache: PriceCache;
  bot: Bot;
  rankingEngine: RankingEngine;
};

// -------------------------------------------------------------------------
// CORS — Stage 14 명시적 origin 화이트리스트.
// 왜 echoback (`origin ?? '*'`) 을 버렸나:
//   · 기존 구현은 모든 origin 을 그대로 반사 → 사실상 와일드카드. 보안 약함.
//   · 더 치명적으로, Allow-Headers 가 'Content-Type' 만 허용 → 프론트가 보내는
//     X-Telegram-Init-Data 헤더가 preflight 에서 막혀 "Failed to fetch" 발생.
// 운영 도메인(Vercel) + 로컬 dev (Vite/cloudflared) 만 통과시킨다.
// -------------------------------------------------------------------------
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://telegram-trading-game.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // cloudflared 터널 (개발용) — *.trycloudflare.com 만 허용.
  return /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin);
}

function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data, X-Admin-Secret');
  res.setHeader('Access-Control-Max-Age', '86400');
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
export function createServer({ engine, priceCache, bot, rankingEngine }: Deps): Express {
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
      // null = "조회 실패 또는 미존재". 클라이언트는 "--" 로 표시한다.
      // 0 fallback 은 거짓 데이터 (DB down 인데 어제 PnL 0 으로 보임) 라 금지.
      let yesterdayPnl: number | null = null;
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
            const { data } = await engine.db
              .from('ranking_snapshots')
              .select('daily_pnl')
              .eq('user_id', resolved)
              .eq('date', yDateStr)
              .maybeSingle();
            // 행 없음 → 어제 거래 X → 0 (실제 값). 행 조회 실패 catch 와 분리.
            yesterdayPnl = data ? Number(data.daily_pnl) : 0;
            yesterdayPnlCache.set(resolved, { value: yesterdayPnl, date: yDateStr });
          } catch (err) {
            console.error('[server] failed to fetch yesterdayPnl', err);
            // null 유지. UI 가 "--" 표시 → 거짓 0 보다 정직.
          }
        }

        // 3.5. history (최근 7일 손익)
        try {
          const past7Kst = new Date(nowKst.getTime() - 6 * 24 * 60 * 60 * 1000); // nowKst is already yesterday
          const past7Str = past7Kst.toISOString().split('T')[0]!;
          const { data: histData } = await engine.db
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
        history,
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
        const { data, error } = await engine.db
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
      // 비즈니스 에러를 의미별로 분리해 클라이언트가 정확한 fallback UX 를 보여주게.
      //   LOCK_MODE              → 423 Locked     (잠금 시간 안내)
      //   LIQUIDATED             → 422 Unprocessable (충전 안내)
      //   INSUFFICIENT_BALANCE   → 402 Payment Required (충전 안내)
      //   spot/size 검증 실패     → 400 Bad Request (UI 가 막아야 할 케이스)
      const msg = (err as Error).message;
      const status = /^LOCK_MODE/.test(msg) ? 423
        : /^LIQUIDATED/.test(msg) ? 422
        : /^INSUFFICIENT_BALANCE/.test(msg) ? 402
        : /^(spot|size)/.test(msg) ? 400
        : 500;
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

      const result = await engine.closePosition({ userId: resolved, positionId: targetId, markPrice });
      res.json({ ok: true, pnl: result.pnl, balance: result.newBalance, exitPrice: markPrice });
    } catch (err) {
      console.error('[server] /trade/close:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Stage 17 Phase G: Partial position close ---------------------------------
  // POST /api/trade/close-partial
  app.post('/api/trade/close-partial', async (req, res) => {
    try {
      const { telegramUserId, positionId, closePct, fallbackPrice } = req.body as {
        telegramUserId?: number;
        positionId?: string;
        closePct?: number;
        fallbackPrice?: number;
      };

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      if (!positionId) {
        res.status(400).json({ error: 'positionId required' });
        return;
      }

      // Validate closePct
      if (!closePct || ![25, 50, 75, 100].includes(closePct)) {
        res.status(400).json({ error: 'INVALID_CLOSE_PCT: must be 25, 50, 75, or 100' });
        return;
      }

      // Fetch position to get symbol
      const { data: pos, error: posErr } = await engine.db
        .from('positions')
        .select('symbol')
        .eq('id', positionId)
        .eq('user_id', resolved)
        .eq('status', 'open')
        .single();
      if (posErr || !pos) {
        res.status(404).json({ error: 'position not found or not open' });
        return;
      }

      const symbol = pos.symbol as string;
      const cachedPrice = priceCache.get(symbol);
      const markPrice = cachedPrice ?? fallbackPrice;
      if (!markPrice || markPrice <= 0) {
        res.status(503).json({ error: `price feed unavailable for ${symbol}` });
        return;
      }

      const result = await engine.closePartial({
        userId: resolved,
        positionId,
        closePct: closePct as 25 | 50 | 75 | 100,
        markPrice,
      });

      res.json({
        ok: true,
        pnl: result.pnl,
        newSize: result.newSize,
        newBalance: result.newBalance,
        newStatus: result.newStatus,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('INVALID_CLOSE_PCT')) {
        res.status(400).json({ error: msg });
      } else if (msg.includes('INVALID_MARK_PRICE')) {
        res.status(400).json({ error: msg });
      } else if (msg.includes('UNAUTHORIZED')) {
        res.status(403).json({ error: msg });
      } else if (msg.includes('POSITION_NOT_FOUND_OR_NOT_OPEN')) {
        res.status(404).json({ error: msg });
      } else {
        console.error('[server] /trade/close-partial:', err);
        res.status(500).json({ error: msg });
      }
    }
  });

  // ---- Stage 17: Limit/Stop 주문 생성 ----------------------------------------
  // POST /api/orders: placeLimitOrder OR placeStopOrder (orderType 으로 분기)
  app.post('/api/orders', async (req, res) => {
    try {
      const { symbol, orderType, side, size, leverage, triggerPrice, positionId } = req.body as {
        symbol?: string;
        orderType?: 'limit' | 'stop_loss' | 'take_profit';
        side?: 'long' | 'short';
        size?: number;
        leverage?: number;
        triggerPrice?: number;
        positionId?: string;
      };

      if (!symbol || (side !== 'long' && side !== 'short')) {
        res.status(400).json({ error: 'invalid symbol/side' });
        return;
      }

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      // Validate triggerPrice early (used by both limit and stop orders)
      if (orderType === 'limit' || orderType === 'stop_loss' || orderType === 'take_profit') {
        if (triggerPrice === undefined || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
          res.status(400).json({ error: orderType === 'limit' ? 'limitPrice must be positive' : 'triggerPrice must be positive' });
          return;
        }
      }

      if (orderType === 'limit') {
        if (!Number.isFinite(size) || !size || size <= 0) {
          res.status(400).json({ error: 'size must be positive' });
          return;
        }
        if (!Number.isInteger(leverage) || !leverage || leverage < 1 || leverage > 125) {
          res.status(400).json({ error: 'leverage must be 1..125' });
          return;
        }

        const order = await engine.placeLimitOrder({
          userId: resolved,
          symbol,
          side,
          size,
          leverage,
          limitPrice: triggerPrice as number,
        });
        res.json({ ok: true, orderId: order.id, status: order.status });
      } else if (orderType === 'stop_loss' || orderType === 'take_profit') {
        if (!positionId) {
          res.status(400).json({ error: 'positionId required for SL/TP' });
          return;
        }

        const order = await engine.placeStopOrder({
          userId: resolved,
          positionId,
          type: orderType,
          triggerPrice: triggerPrice as number,
        });
        res.json({ ok: true, orderId: order.id });
      } else {
        res.status(400).json({ error: 'invalid orderType' });
      }
    } catch (err) {
      console.error('[server] POST /api/orders:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Stage 17: 미체결 주문 조회 -----------------------------------------------
  // GET /api/orders?telegramUserId=
  app.get('/api/orders', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const orders = await engine.getOpenOrders(resolved);
      res.json({
        orders: orders.map((o) => ({
          id: o.id,
          symbol: o.symbol,
          type: o.type,
          side: o.side,
          price: Number(o.price),
          size: o.size,
          leverage: o.leverage,
          status: o.status,
          createdAt: o.created_at,
        })),
      });
    } catch (err) {
      console.error('[server] GET /api/orders:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Stage 17: 주문 취소 ---------------------------------------------------
  // DELETE /api/orders/:id
  app.delete('/api/orders/:id', async (req, res) => {
    try {
      const orderId = req.params.id;
      const { telegramUserId } = req.body as { telegramUserId?: number };

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      await engine.cancelOrder(orderId, resolved);
      res.json({ ok: true, orderId });
    } catch (err) {
      console.error('[server] DELETE /api/orders/:id:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Stage 17: 전체 주문 취소 -----------------------------------------------
  // DELETE /api/orders/all?telegramUserId=
  app.delete('/api/orders/all', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const result = await engine.cancelAllOrders(resolved);
      res.json({ ok: true, cancelled: result.cancelled });
    } catch (err) {
      console.error('[server] DELETE /api/orders/all:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Stage 17: 주문 내역 ---------------------------------------------------
  // GET /api/orders/history?telegramUserId=
  app.get('/api/orders/history', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const orders = await engine.getOrderHistory(resolved, 50);
      res.json({
        orders: orders.map((o) => ({
          id: o.id,
          symbol: o.symbol,
          type: o.type,
          side: o.side,
          price: Number(o.price),
          size: o.size,
          status: o.status,
          createdAt: o.created_at,
          filledAt: o.filled_at,
          cancelledAt: o.cancelled_at,
          triggeredAt: o.triggered_at,
        })),
      });
    } catch (err) {
      console.error('[server] GET /api/orders/history:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ---- Stage 17: 포지션 SL/TP 설정 -------------------------------------------
  // POST /api/positions/sl-tp
  app.post('/api/positions/sl-tp', async (req, res) => {
    try {
      const { positionId, slPrice, tpPrice } = req.body as {
        positionId?: string;
        slPrice?: number | null;
        tpPrice?: number | null;
      };

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      if (!positionId) {
        res.status(400).json({ error: 'positionId required' });
        return;
      }

      await engine.setSlTpForPosition({
        userId: resolved,
        positionId,
        slPrice: slPrice !== undefined ? (slPrice === null ? null : slPrice) : undefined,
        tpPrice: tpPrice !== undefined ? (tpPrice === null ? null : tpPrice) : undefined,
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      // Route SL/TP validation errors
      const status = /^UNAUTHORIZED/.test(msg) ? 403
        : /^INVALID_SL_PRICE_DIRECTION|^INVALID_TP_PRICE_DIRECTION/.test(msg) ? 400
        : 500;
      console.error('[server] POST /api/positions/sl-tp:', msg);
      res.status(status).json({ error: msg });
    }
  });

  // ---- Stage 17 Phase G: 마진 모드 설정 (UI 전용 단계 1) -------------------------
  // POST /api/positions/margin-mode
  app.post('/api/positions/margin-mode', async (req, res) => {
    try {
      const { positionId, marginMode } = req.body as {
        positionId?: string;
        marginMode?: string;
      };

      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      if (!positionId) {
        res.status(400).json({ error: 'positionId required' });
        return;
      }

      if (!['isolated', 'cross'].includes(marginMode ?? '')) {
        res.status(400).json({ error: 'INVALID_MARGIN_MODE' });
        return;
      }

      const result = await engine.setMarginMode({
        userId: resolved,
        positionId,
        marginMode: marginMode as 'isolated' | 'cross',
      });

      res.json({ ok: true, marginMode: result.marginMode });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'CROSS_MARGIN_NOT_AVAILABLE') {
        res.status(400).json({ error: msg, code: 'CROSS_MARGIN_NOT_AVAILABLE' });
      } else if (msg.includes('UNAUTHORIZED')) {
        res.status(403).json({ error: msg });
      } else if (msg.includes('position not found')) {
        res.status(404).json({ error: msg });
      } else {
        console.error('[server] POST /api/positions/margin-mode:', err);
        res.status(500).json({ error: msg });
      }
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
      const { error: vErr } = await engine.db
        .from('exchange_verifications')
        .update({ status })
        .eq('user_id', userId);

      if (vErr) throw new Error(`verification update failed: ${vErr.message}`);

      // Stage 15.1 — 승인 시 is_verified 업데이트. Promo code 자동 발급은 폐기 (래퍼럴 시스템 제거).
      if (status === 'approved') {
        const { error: uErr } = await engine.db
          .from('users')
          .update({ is_verified: true })
          .eq('id', userId);
        if (uErr) throw new Error(`user verify update failed: ${uErr.message}`);

        try {
          const userRow = await engine.getUserById(userId);
          if (userRow?.telegram_id) {
            await bot.api.sendMessage(
              userRow.telegram_id,
              `✅ 거래소 UID 인증이 *승인*되었습니다!\n\n이제 Premium 혜택을 이용하실 수 있습니다.`,
              { parse_mode: 'Markdown' },
            );
          }
        } catch (dmErr) {
          console.warn('[server] approval DM failed:', dmErr);
        }
      }

      // 3. D-04 감사 로그 기록 — 실패는 응답에 영향 안 줌.
      try {
        await engine.db.from('admin_actions').insert({
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

      const db = engine.db;
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

  // ---- Stage 15.2 — Premium 매매 분석기 API --------------------------------

  // 분석 데이터 캐시 (userId → {data, expiresAt})
  const analyticsCache = new Map<string, { data: unknown; expiresAt: number }>();
  const CACHE_TTL = Number(process.env.ANALYTICS_CACHE_SECONDS || '300') * 1000;

  // GET /api/premium/analytics — 모듈 A~D 데이터 한 번에 반환
  app.get('/api/premium/analytics', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      // 캐시 체크
      const cached = analyticsCache.get(resolved);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
      }

      // Premium 상태 확인
      const userRow = await engine.getUserById(resolved);
      const telegramUserId = userRow?.telegram_id;
      let isPremium = false;
      let lockModeEnabled = false;

      if (telegramUserId) {
        const isStarsPremium = await engine.hasStarsPremium(resolved);
        isPremium = isStarsPremium || await checkIsPremium(bot, telegramUserId);
      }

      // users 테이블에서 lock_mode_enabled 조회
      const { data: lockData } = await engine.db
        .from('users')
        .select('lock_mode_enabled')
        .eq('id', resolved)
        .single();
      if (lockData) {
        lockModeEnabled = (lockData as { lock_mode_enabled: boolean }).lock_mode_enabled;
      }

      // 동적 import 로 순환 참조 방지
      const { computeAnalytics } = await import('./services/analytics.js');
      const result = await computeAnalytics(engine.db, resolved, isPremium, lockModeEnabled);

      // 캐시 저장
      analyticsCache.set(resolved, { data: result, expiresAt: Date.now() + CACHE_TTL });

      res.json(result);
    } catch (err) {
      console.error('[server] /premium/analytics:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/premium/lock-mode — 매매 잠금 토글
  app.post('/api/premium/lock-mode', async (req, res) => {
    try {
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled (boolean) required' });
        return;
      }

      const result = await engine.toggleLockMode(resolved, enabled);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server] /premium/lock-mode:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/cron/weekly-report — 주간 리포트 수동 트리거
  app.post('/api/cron/weekly-report', async (req, res) => {
    try {
      const adminSecret = req.headers['x-admin-secret'];
      if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        res.status(401).json({ error: 'unauthorized admin' });
        return;
      }

      const { WeeklyReportCron } = await import('./cron/weeklyReport.js');
      const cron = new WeeklyReportCron(bot, engine.db);
      const result = await cron.sendAllReports();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[server] /cron/weekly-report:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
