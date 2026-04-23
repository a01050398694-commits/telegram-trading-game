import crypto from 'node:crypto';
import { childLogger } from '../../lib/logger.js';

// B-12 — Bybit Affiliate API 연동.
//
// Bybit 은 공식 HMAC-SHA256 서명 기반 REST API 를 제공한다.
// 대표 엔드포인트: GET /v5/affiliate/aff-user-list (시간/페이지 기반).
// 단, 프로덕션 계정 미연결 상태에선 서명 요청도 401 로 떨어지므로,
// 본 모듈은 env 기반 수동 리스트 + API 폴백 구조를 동일하게 유지.

const log = childLogger('bybit-affiliate');

const BASE = 'https://api.bybit.com';
const RECV_WINDOW = '5000';

let cachedUids: Set<string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type BybitCheckResult =
  | { ok: true; isAffiliate: boolean; source: 'env' | 'api' }
  | { ok: false; reason: 'not_configured' | 'api_error' };

function loadFromEnv(): Set<string> | null {
  const list = process.env.BYBIT_AFFILIATE_UIDS;
  if (!list) return null;
  return new Set(
    list
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function signBybit(apiKey: string, apiSecret: string, queryString: string, timestamp: string): string {
  const payload = `${timestamp}${apiKey}${RECV_WINDOW}${queryString}`;
  return crypto.createHmac('sha256', apiSecret).update(payload).digest('hex');
}

export async function checkBybitAffiliateUid(uid: string): Promise<BybitCheckResult> {
  const trimmed = uid.trim();
  if (!trimmed) return { ok: false, reason: 'not_configured' };

  const now = Date.now();
  if (!cachedUids || now - cacheLoadedAt > CACHE_TTL_MS) {
    cachedUids = loadFromEnv();
    cacheLoadedAt = now;
  }
  if (cachedUids) {
    return {
      ok: true,
      isAffiliate: cachedUids.has(trimmed),
      source: 'env',
    };
  }

  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const timestamp = Date.now().toString();
    const query = `uid=${encodeURIComponent(trimmed)}`;
    const sign = signBybit(apiKey, apiSecret, query, timestamp);

    const res = await fetch(`${BASE}/v5/affiliate/aff-user-list?${query}`, {
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': sign,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
      },
    });
    if (!res.ok) {
      log.warn({ status: res.status, uid: trimmed }, 'bybit api non-2xx');
      return { ok: false, reason: 'api_error' };
    }
    const body = (await res.json()) as {
      retCode?: number;
      result?: { list?: Array<{ userId?: string | number }> };
    };
    const found = body.result?.list?.some(
      (u) => String(u.userId ?? '') === trimmed,
    );
    return {
      ok: true,
      isAffiliate: Boolean(found),
      source: 'api',
    };
  } catch (err) {
    log.error({ err, uid: trimmed }, 'bybit api fetch failed');
    return { ok: false, reason: 'api_error' };
  }
}
