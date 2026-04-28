import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';
import { hapticImpact } from '../utils/telegram';

type LiquidationOverlayProps = {
  rechargeAmount: number;
  priceLabel: string;
  errorMessage: string | null;
  onRecharge: () => void;
};

// Stage 8.0 — "Liquidated" 도박성 용어 제거.
// Stage 15.1 — 결제는 InviteMember 외부 redirect 라 pending state 불요. priceLabel 만 노출.
export function LiquidationOverlay({
  rechargeAmount,
  priceLabel,
  errorMessage,
  onRecharge,
}: LiquidationOverlayProps) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-stretch justify-end gap-3 rounded-xl bg-rose-950/90 p-4 backdrop-blur-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-rose-300">
          Risk Lesson
        </div>
        <div className="text-xl font-extrabold text-rose-100">{t('liquidation.title')}</div>
        <div className="mt-2 max-w-[280px] text-[11px] leading-relaxed text-rose-200/80">
          {t('liquidation.body')}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          hapticImpact('heavy');
          onRecharge();
        }}
        className="w-full rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-4 text-slate-900 shadow-lg shadow-amber-500/20 transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
      >
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">
          {t('liquidation.resetCta')} · {formatMoney(rechargeAmount)}
        </div>
        <div className="mt-0.5 text-lg font-extrabold">{priceLabel}</div>
      </button>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-center text-[11px] font-medium text-rose-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
