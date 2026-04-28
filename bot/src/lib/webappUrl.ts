import { env } from '../env.js';

/**
 * 텔레그램 미니앱 URL — 매번 호출 시 cache-bust suffix 부착.
 * Telegram 클라이언트의 WebView 캐시 우회 목적.
 * localhost(개발 환경)에서는 cache-bust 적용하지 않음.
 */
export function webAppUrl(extraParams?: Record<string, string>): string {
  if (!env.WEBAPP_URL.startsWith('https://')) {
    return env.WEBAPP_URL; // localhost dev 는 cache-bust 안 함
  }
  const params = new URLSearchParams({ v: String(Date.now()), ...extraParams });
  return `${env.WEBAPP_URL}?${params}`;
}
