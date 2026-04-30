import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import i18n from '../lib/i18n';

/**
 * Stage 16.1 — React Error Boundary with Sentry integration.
 * Catches unhandled errors anywhere in the child component tree.
 * Dark theme consistent with existing design (slate-900/950 base, white/80 text, rose accent).
 * Fallback UI encourages refresh or support contact.
 */

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error): void {
    // Only log if Sentry is configured
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { boundary: 'root' },
      });
    }
  }

  override render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

/**
 * Fallback UI — dark/calm tone, no bright colors.
 * Uses i18n.t() directly since this is not a React hook context.
 * Locale keys: errors.boundary.title, errors.boundary.body, errors.boundary.retryButton
 */
function ErrorFallback({ error }: { error: Error | null }) {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8"
      role="alert"
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Icon — 비극 아이콘 (회색 톤) */}
        <div className="flex justify-center">
          <div className="rounded-full bg-slate-900 p-4 text-slate-400">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold text-white/90">
            {i18n.t('errors.boundary.title', 'Oops, something went wrong')}
          </h1>
          <p className="text-sm text-white/60">
            {i18n.t(
              'errors.boundary.body',
              'Try refreshing or contact @your_support',
            )}
          </p>
        </div>

        {/* Error details (development only) */}
        {import.meta.env.DEV && error && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <code className="text-[11px] text-slate-400">
              {error.message}
            </code>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleRetry}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600 active:scale-95"
          >
            {i18n.t('errors.boundary.retryButton', 'Refresh')}
          </button>
          <a
            href="https://t.me/your_support"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-center text-sm font-semibold text-white/80 transition hover:bg-slate-800 active:scale-95"
          >
            지원팀 문의
          </a>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
