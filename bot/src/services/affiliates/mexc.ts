import { childLogger } from '../../lib/logger.js';

// B-11 — MEXC Affiliate API 연동.
//
// MEXC 는 제휴 사용자 조회 API 를 공개하지 않으므로, 대시보드에서 CSV 로 내보낸
// UID 목록을 로딩하거나 (MEXC_AFFILIATE_UIDS env), 서명 기반 private API 를
// 사용한다. 본 모듈은 두 가지 경로 모두 허용:
//   1. MEXC_AFFILIATE_UIDS 쉼표 구분 환경변수 (수동 업데이트)
//   2. MEXC_API_KEY + MEXC_API_SECRET + MEXC_AFFILIATE_URL (확정되면 교체)
//
// 반환: UID 가 제휴 명단에 있으면 true. 실패/미설정 시 false + source 명시.

const log = childLogger('mexc-affiliate');

let cachedUids: Set<string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type MexcCheckResult =
  | { ok: true; isAffiliate: boolean; source: 'env' | 'api' }
  | { ok: false; reason: 'not_configured' | 'api_error' };

function loadFromEnv(): Set<string> | null {
  const list = process.env.MEXC_AFFILIATE_UIDS;
  if (!list) return null;
  return new Set(
    list
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export async function checkMexcAffiliateUid(uid: string): Promise<MexcCheckResult> {
  const trimmed = uid.trim();
  if (!trimmed) return { ok: false, reason: 'not_configured' };

  // 1. env 기반 수동 목록
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

  // 2. 공식 API (URL / 키가 있을 때만)
  const apiUrl = process.env.MEXC_AFFILIATE_URL;
  const apiKey = process.env.MEXC_API_KEY;
  if (!apiUrl || !apiKey) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`${apiUrl}?uid=${encodeURIComponent(trimmed)}`, {
      headers: {
        'X-MEXC-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      log.warn({ status: res.status, uid: trimmed }, 'mexc api non-2xx');
      return { ok: false, reason: 'api_error' };
    }
    const body = (await res.json()) as { isAffiliate?: boolean };
    return {
      ok: true,
      isAffiliate: Boolean(body.isAffiliate),
      source: 'api',
    };
  } catch (err) {
    log.error({ err, uid: trimmed }, 'mexc api fetch failed');
    return { ok: false, reason: 'api_error' };
  }
}
