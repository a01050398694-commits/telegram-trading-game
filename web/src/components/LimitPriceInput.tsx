import { useTranslation } from 'react-i18next';
import { formatUSD } from '../lib/format';

type LimitPriceInputProps = {
  value: number | null;
  onChange: (price: number | null) => void;
  markPrice: number | null;
};

export function LimitPriceInput({ value, onChange, markPrice }: LimitPriceInputProps) {
  const { t } = useTranslation();

  const handleQuickButton = (fn: () => number) => {
    const result = fn();
    onChange(result);
  };

  return (
    <div className="space-y-2 mb-3 p-2.5 border border-[var(--border-hairline)] rounded-lg bg-[var(--color-surface-2)] ">
      <label className="text-[11px] font-bold uppercase tracking-wider text-white/40">
        {t('orderType.limit')} {t('trade.markPrice')}
      </label>

      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : null;
          onChange(v);
        }}
        placeholder="Enter limit price"
        className="w-full border border-[var(--border-hairline)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      />

      {markPrice !== null && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">{t('trade.markPrice')}</span>
          <span className="font-mono text-white/60">${formatUSD(markPrice)}</span>
        </div>
      )}

      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => {
            if (markPrice !== null) {
              handleQuickButton(() => markPrice);
            }
          }}
          className="flex-1 text-[11px] font-bold bg-slate-700/50 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded transition-colors"
        >
          [Last]
        </button>
        <button
          type="button"
          onClick={() => {
            if (markPrice !== null) {
              handleQuickButton(() => markPrice);
            }
          }}
          className="flex-1 text-[11px] font-bold bg-slate-700/50 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded transition-colors"
        >
          [Mid]
        </button>
        <button
          type="button"
          onClick={() => {
            if (markPrice !== null) {
              handleQuickButton(() => markPrice * 1.05);
            }
          }}
          className="flex-1 text-[11px] font-bold bg-slate-700/50 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded transition-colors"
        >
          [+5%]
        </button>
      </div>
    </div>
  );
}
