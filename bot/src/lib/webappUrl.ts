import { env } from '../env.js';

/**
 * 텔레그램 미니앱 URL — 매번 호출 시 cache-bust suffix 부착.
 * Telegram 클라이언트의 WebView 캐시 우회 목적.
 * localhost(개발 환경)에서는 cache-bust 적용하지 않음.
 *
 * Use this for `.webApp()` inline buttons in PRIVATE chats only.
 * In groups, Telegram rejects web_app inline buttons with BUTTON_TYPE_INVALID —
 * use `webAppDeepLink()` + `.url()` instead.
 */
export function webAppUrl(extraParams?: Record<string, string>): string {
  if (!env.WEBAPP_URL.startsWith('https://')) {
    return env.WEBAPP_URL; // localhost dev 는 cache-bust 안 함
  }
  const params = new URLSearchParams({ v: String(Date.now()), ...extraParams });
  return `${env.WEBAPP_URL}?${params}`;
}

/**
 * t.me deep link to launch the Mini App via the bot.
 * Required for inline buttons in GROUP/SUPERGROUP chats — Telegram only allows
 * `web_app` inline buttons in private chats. In groups, use a `url` button
 * pointing at this deep link instead.
 *
 * `startapp` param survives the deep-link round-trip and is exposed inside the
 * Mini App as `Telegram.WebApp.initDataUnsafe.start_param`, so we pass a context
 * tag (e.g. 'community', 'shill', 'brief') for analytics.
 */
export function webAppDeepLink(context: string = 'group'): string {
  return `https://t.me/Tradergames_bot?startapp=${encodeURIComponent(context)}`;
}
