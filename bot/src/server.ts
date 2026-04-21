import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Bot } from 'grammy';
import { env } from './env.js';
import crypto from 'node:crypto';
import type { TradingEngine } from './engine/trading.js';
import type { RankingEngine } from './engine/ranking.js';
import type { PriceCache } from './priceCache.js';

// 결제 식별자 — Stars invoice 의 payload 필드.
// 성공 콜백 시 이 prefix 로 판별해 revivePaidUser 호출.
export const STARS_PAYLOAD_PREFIX = 'recharge_v1:';
export const STARS_AMOUNT = 150; // PRD: 150 Stars 재구매

type Deps = {
  engine: TradingEngine;
  priceCache: PriceCache;
  bot: Bot;
  rankingEngine: RankingEngine;
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
export function createServer({ engine, priceCache, bot, rankingEngine }: Deps): Express {
  const app = express();

  app.use(cors);
  app.use(express.json());

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
        isVIP: verification?.status === 'approved',
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
      const { telegramUserId } = req.body as { telegramUserId?: number };
      const resolved = await resolveUser(engine, req);
      if (typeof resolved !== 'string') {
        res.status(resolved.status).json({ error: resolved.error });
        return;
      }

      const payload = `${STARS_PAYLOAD_PREFIX}${resolved}:${Date.now()}`;
      const invoiceLink = await bot.api.createInvoiceLink(
        'Trading Academy · Risk Management Reset',
        'Reset practice balance to $100,000 and resume the paper-trading lesson.',
        payload,
        'XTR',
        [{ label: 'Risk Management Reset', amount: STARS_AMOUNT }],
      );
      res.json({ ok: true, invoiceLink });
    } catch (err) {
      console.error('[server] /payment/stars:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
