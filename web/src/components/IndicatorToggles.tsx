import { useTranslation } from 'react-i18next';

type IndicatorTogglesProps = {
  indicators: { ma20: boolean; volume: boolean };
  onChange: (key: 'ma20' | 'volume', value: boolean) => void;
};

export function IndicatorToggles({ indicators, onChange }: IndicatorTogglesProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2 shrink-0 justify-center">
      {['ma20', 'volume'].map((key) => {
        const isActive = indicators[key as 'ma20' | 'volume'];
        return (
          <button
            key={key}
            onClick={() => onChange(key as 'ma20' | 'volume', !isActive)}
            className={`
              px-2.5 py-1 text-[10px] font-bold rounded-md
              transition-all duration-150 shrink-0
              ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : 'bg-slate-800/50 text-slate-400 border border-[var(--border-hairline)] hover:bg-slate-700 hover:text-slate-300'
              }
            `}
          >
            {t(`indicators.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
