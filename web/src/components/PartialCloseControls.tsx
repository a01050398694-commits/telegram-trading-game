import { useTranslation } from 'react-i18next';

type PartialCloseControlsProps = {
  positionSize: number;
  balance: number;
  onClose: (pct: 25 | 50 | 75 | 100) => void;
  pending?: boolean;
  error?: string | null;
};

export function PartialCloseControls({
  positionSize,
  balance,
  onClose,
  pending = false,
  error = null,
}: PartialCloseControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1">
        {([25, 50, 75, 100] as const).map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => onClose(pct)}
            disabled={pending}
            className={`
              py-2 px-2 text-xs font-bold rounded-lg
              border border-[var(--border-hairline)]
              bg-gradient-to-b from-rose-500/20 to-rose-600/10
              text-rose-400
              hover:from-rose-500/30 hover:to-rose-600/20
              active:scale-[0.96]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150
            `}
          >
            {pct}%
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] text-rose-400 text-center">{error}</p>}
    </div>
  );
}
