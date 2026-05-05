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
      {(['isolated', 'cross'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => handleModeChange(m)}
          disabled={disabled}
          className={`
            px-2 py-1 text-xs font-bold rounded-md
            transition-colors duration-150
            ${
              mode === m
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-transparent hover:text-slate-300'
            }
          `}
        >
          {t(`marginMode.${m}`)}
        </button>
      ))}
    </div>
  );
}
