import * as Sentry from '@sentry/node';

// B-15 — Sentry 연결. 환경변수 SENTRY_DSN 이 있을 때만 활성.
// 개발 환경에선 기본적으로 비활성 (noise 방지).

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // PII 스크럽 — Telegram ID 는 별도 필요 시 정책에 따라 유지.
    beforeSend(event) {
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, string>;
        delete h['x-admin-secret'];
        delete h['authorization'];
      }
      return event;
    },
  });

  console.log('[sentry] initialized');
}

export { Sentry };
