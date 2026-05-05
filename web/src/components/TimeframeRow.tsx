import { useTranslation } from 'react-i18next';

type TimeframeRowProps = {
  activeFrame: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  onChange: (frame: '1m' | '5m' | '15m' | '1h' | '4h' | '1d') => void;
};

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

export function TimeframeRow({ activeFrame, onChange }: TimeframeRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-1 justify-center shrink-0">
      {TIMEFRAMES.map((frame) => (
        <button
          key={frame}
          onClick={() => onChange(frame)}
          className={`
            px-2.5 py-1.5 text-[11px] font-bold rounded-md
            transition-all duration-150 ease-out shrink-0
            ${
              activeFrame === frame
                ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400 border-t border-l border-r border-[var(--border-hairline)]'
                : 'bg-slate-800/50 text-slate-400 border border-[var(--border-hairline)] hover:bg-slate-700 hover:text-slate-300'
            }
          `}
          aria-current={activeFrame === frame ? 'true' : undefined}
        >
          {t(`timeframe.${frame}`)}
        </button>
      ))}
    </div>
  );
}
