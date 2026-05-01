import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n';
import * as Sentry from '@sentry/react';
import { initSentry } from './lib/sentry';
import ErrorBoundary from './components/ErrorBoundary';

// Stage 16.1 — Init Sentry for error tracking (only if DSN configured)
initSentry();

// Stage 16.2 — Production verification trigger (TEMPORARY).
// Open `?debug=sentry` once in production to confirm Sentry receives events.
// Remove this block after the test event appears in Sentry Issues panel.
if (typeof window !== 'undefined') {
  const params = new URL(window.location.href).searchParams;
  if (params.get('debug') === 'sentry') {
    Sentry.captureException(
      new Error('[sentry-verify] web production trigger — safe to ignore'),
    );
    console.log('[sentry-verify] event sent. Check sentry.io → Issues.');
  }
}

// Stage 8.6 — 핀치줌 JS 레이어 차단.
// iOS Safari 는 viewport meta 의 user-scalable=no 를 접근성 이유로 무시하는 경우가 있다.
// gesturestart/gesturechange/gestureend 는 iOS 전용 이벤트로, preventDefault 하면
// 핀치줌 자체가 발생하지 않는다. Android Chrome 은 touch-action: manipulation 으로 이미 차단됨.
if (typeof document !== 'undefined') {
  const preventPinch = (e: Event) => {
    e.preventDefault();
  };
  document.addEventListener('gesturestart', preventPinch, { passive: false });
  document.addEventListener('gesturechange', preventPinch, { passive: false });
  document.addEventListener('gestureend', preventPinch, { passive: false });

  // iOS 의 double-tap-to-zoom 차단 (300ms 내 두 번 탭).
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
