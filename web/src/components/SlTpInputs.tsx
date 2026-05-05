import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type SlTpInputsProps = {
  slPrice: number | null;
  tpPrice: number | null;
  onSlTpChange: (args: { slPrice?: number | null; tpPrice?: number | null }) => void;
};

export function SlTpInputs({ slPrice, tpPrice, onSlTpChange }: SlTpInputsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-[var(--border-hairline)] pt-2 mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-[12px] font-bold text-slate-400 hover:text-white transition-colors duration-150"
      >
        {expanded ? `- ${t('slTp.toggle')}` : `+ ${t('slTp.toggle')}`}
      </button>

      {expanded && (
        <div className="space-y-2 mt-3">
          <input
            type="number"
            placeholder={t('slTp.tp')}
            value={tpPrice ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              onSlTpChange({ tpPrice: v });
            }}
            className="w-full border border-[var(--border-hairline)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          />
          <input
            type="number"
            placeholder={t('slTp.sl')}
            value={slPrice ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              onSlTpChange({ slPrice: v });
            }}
            className="w-full border border-[var(--border-hairline)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          />
        </div>
      )}
    </div>
  );
}
