import { useTranslation } from 'react-i18next';

type OrderTypeTabsProps = {
  activeType: 'market' | 'limit' | 'stop';
  onChange: (type: 'market' | 'limit' | 'stop') => void;
};

export function OrderTypeTabs({ activeType, onChange }: OrderTypeTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-1 border-b border-[var(--border-hairline)] mb-3">
      {(['market', 'limit', 'stop'] as const).map((type) => {
        const isActive = activeType === type;
        const isDisabled = type === 'stop';

        return (
          <button
            key={type}
            onClick={() => {
              if (!isDisabled) onChange(type);
            }}
            disabled={isDisabled}
            className={`flex-1 py-2 px-3 text-sm font-bold rounded-t-lg transition-colors duration-150 ${
              isActive
                ? 'bg-[var(--color-accent-gold)]/15 text-white border-b-2 border-[var(--color-accent-gold)]'
                : isDisabled
                  ? 'bg-slate-900/50 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-300'
            }`}
            title={isDisabled ? t('orders.comingSoon') || 'Coming soon' : undefined}
          >
            {type === 'stop' && (
              <span className="flex items-center gap-1">
                <span>{t(`orderType.stop_loss`)}</span>
                <span className="text-[11px] font-bold text-amber-400">[Coming Soon]</span>
              </span>
            )}
            {type !== 'stop' && t(`orderType.${type}`)}
          </button>
        );
      })}
    </div>
  );
}
