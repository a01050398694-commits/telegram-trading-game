/**
 * Demo badge in two variants:
 * 'compact' — small pill in header
 * 'full' — large onboarding overlay (shown once on first mount)
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface DemoBadgeProps {
  variant: 'compact' | 'full';
  onDismiss?: () => void;
}

export function DemoBadge({ variant, onDismiss }: DemoBadgeProps) {
  const { t } = useTranslation();

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-mono text-xs font-bold text-amber-300">
        <span>{t('demoBadge.compact')}</span>
      </div>
    );
  }

  // full variant — onboarding overlay
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-stone-950/60 px-6 py-8 text-center shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-3xl">📚</div>
        <h1 className="mb-3 text-xl font-black text-white">
          {t('demoBadge.fullTitle')}
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-white/70">
          {t('demoBadge.fullBody')}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 font-bold text-stone-950 transition hover:shadow-lg active:scale-[0.98]"
        >
          {t('demoBadge.dismiss')}
        </button>
      </div>
    </div>
  );
}
