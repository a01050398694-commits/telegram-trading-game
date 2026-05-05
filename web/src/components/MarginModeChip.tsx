import { useTranslation } from 'react-i18next';

type MarginModeChipProps = {
  mode: 'isolated' | 'cross';
  onChange: (mode: 'isolated' | 'cross') => void;
  disabled?: boolean;
};

export function MarginModeChip({ mode, onChange, disabled = false }: MarginModeChipProps) {
  const { t } = useTranslation();

  const handleModeChange = (newMode: 'isolated' | 'cross') => {
    if (newMode === 'cross') {
      // Cross margin coming soon — use Telegram showPopup or fallback to alert.
      const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
      if (tg?.showPopup) {
        tg.showPopup({
          title: t('marginMode.comingSoon'),
          message: t('marginMode.comingSoon'),
          buttons: [{ type: 'ok' }],
        });
      } else {
        alert(t('marginMode.comingSoon'));
      }
      return;
    }
    onChange(newMode);
  };

  return (
    <div className="flex gap-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--border-subtle)] p-1">
      {(['isolated', 'cross'] as const).map((m) => {
        const isCrossDisabled = m === 'cross';
        const isActive = mode === m;

        return (
          <button
            key={m}
            type="button"
            onClick={() => handleModeChange(m)}
            disabled={disabled || isCrossDisabled}
            className={`
              px-2 py-1 text-xs font-bold rounded-md
              transition-colors duration-150 flex flex-col items-center gap-0.5
              ${
                isActive && !isCrossDisabled
                  ? 'bg-[var(--color-accent-long)]/20 text-emerald-300 border border-[var(--color-accent-long)]/50'
                  : isCrossDisabled
                    ? 'bg-slate-700/40 text-slate-500 border border-slate-600 opacity-60 cursor-not-allowed'
                    : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-slate-300'
              }
            `}
            title={isCrossDisabled ? t('marginMode.comingSoon') : undefined}
          >
            <span className="flex items-center gap-1">
              {isCrossDisabled && <span className="text-[9px]">🔒</span>}
              {t(`marginMode.${m}`)}
            </span>
            {isCrossDisabled && <span className="text-[9px] text-slate-500 font-normal">(Soon)</span>}
          </button>
        );
      })}
    </div>
  );
}
