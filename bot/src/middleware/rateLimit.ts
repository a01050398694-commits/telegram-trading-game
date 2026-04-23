import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

// B-16 — Express Rate limiting.
// 엔드포인트별 정책:
//   · 거래/결제: 분당 30회 (일반 사용자 상한)
//   · 관리자 API: 분당 100회
//   · 조회성: 분당 120회
//
// 프록시 뒤(Render/Vercel)에선 req.ip 가 로드밸런서 IP 일 수 있어, trust proxy 를
// server.ts 에서 설정해야 한다.

export const tradeLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many trade requests. Slow down.' },
});

export const readLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many read requests.' },
});

export const adminLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Admin rate limit.' },
});
