import * as Sentry from '@sentry/react';

/**
 * Stage 16.1 — Sentry initialization for error tracking & PII scrubbing.
 * Only init if VITE_SENTRY_DSN is provided (production deploy).
 * Never expose user identifiers in breadcrumbs or contexts.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // PII scrubbing — remove sensitive fields from all error contexts
    beforeSend(event) {
      if (event.request) {
        delete event.request.url;
        delete event.request.headers;
      }
      if (event.contexts) {
        delete event.contexts.trace;
      }
      // Scrub any initData or telegramUserId-like patterns from context
      if (event.extra) {
        const sanitized = { ...event.extra };
        Object.keys(sanitized).forEach((key) => {
          if (
            key.toLowerCase().includes('user') ||
            key.toLowerCase().includes('telegram') ||
            key.toLowerCase().includes('initdata')
          ) {
            delete sanitized[key];
          }
        });
        event.extra = sanitized;
      }
      return event;
    },
  });
}
