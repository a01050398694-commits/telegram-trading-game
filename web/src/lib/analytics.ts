import posthog from 'posthog-js';
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

// F-13 — Web Vitals + PostHog 이벤트 래퍼.
// - initAnalytics() 는 App mount 시 1회 호출.
// - track() 는 각 탭/인터랙션 포인트에서 호출.
// - telegramUserId 가 확정되면 identify() 로 보강.

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';
  if (!key) {
    // PostHog 미설정 시 silent no-op. 이벤트 호출은 모두 조용히 버려짐.
    initialized = true;
    return;
  }
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        ph.debug(false);
      }
    },
  });
  initialized = true;

  // Core Web Vitals → PostHog 이벤트로 그대로 전송.
  const sendVital = (name: string) => (metric: { value: number; id: string; rating?: string }) => {
    posthog.capture('web_vitals', {
      metric: name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
    });
  };
  try {
    onCLS(sendVital('CLS'));
    onINP(sendVital('INP'));
    onLCP(sendVital('LCP'));
    onFCP(sendVital('FCP'));
    onTTFB(sendVital('TTFB'));
  } catch (err) {
    console.warn('[analytics] web-vitals hook failed:', err);
  }
}

export function identify(telegramUserId: number, props?: Record<string, unknown>): void {
  if (!initialized || !import.meta.env.VITE_POSTHOG_KEY) return;
  posthog.identify(String(telegramUserId), props ?? {});
}

export function track(event: EventName, props?: Record<string, unknown>): void {
  if (!initialized || !import.meta.env.VITE_POSTHOG_KEY) return;
  posthog.capture(event, props ?? {});
}

// 화이트리스트 이벤트 이름 — typo 방지.
export type EventName =
  | 'app_opened'
  | 'tab_viewed'
  | 'trade_opened'
  | 'trade_closed'
  | 'trade_partial_closed'
  | 'liquidated'
  | 'verification_submitted'
  | 'premium_cta_clicked'
  | 'rank_card_shared';
