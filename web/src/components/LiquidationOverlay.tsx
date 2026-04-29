import { useTranslation } from 'react-i18next';
import { hapticImpact } from '../utils/telegram';

type LiquidationOverlayProps = {
  onRecharge: () => void | Promise<void>;
  pending: boolean;
  errorMessage: string | null;
};

// Stage 8.0 — "Liquidated" 도박성 용어 제거.
// Stage 15.3 — Stars 결제 integration. pending spinner 표시, disabled 상태 처리.
export function LiquidationOverlay({
  onRecharge,
  pending,
  errorMessage,
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
          if (!pending) {
            hapticImpact('heavy');
            void onRecharge();
          }
        }}
        disabled={pending}
        className="relative w-full rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-4 text-slate-900 shadow-lg shadow-amber-500/20 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
      >
        <div className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">
          {t('liquidation.rechargeCta')}
        </div>
        <div className="mt-0.5 text-lg font-extrabold">{t('liquidation.rechargeSubtext')}</div>
        {pending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/20">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
          </div>
        )}
      </button>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-center text-[11px] font-medium text-rose-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
