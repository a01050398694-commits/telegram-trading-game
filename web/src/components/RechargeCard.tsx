/**
 * Stage 15.4 — Recharge Pricing Card
 *
 * 청산 여부 무관 항상 노출 가능. PortfolioTab + PremiumTab 양쪽 import.
 *   · 가격 모노스페이스 강조 ($2.99)
 *   · 가치 명시 ($1,000 게임머니)
 *   · 1회성 약관
 *   · 결제 버튼
 *
 * variant:
 *   · 'idle' = 평소 (PortfolioTab 의 디폴트)
 *   · 'liquidated' = 청산 직후 (강조 톤, amber gradient)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticImpact, openStarsInvoice } from '../utils/telegram';
import { createRechargeStarsInvoice } from '../lib/api';

interface RechargeCardProps {
  telegramUserId: number | null;
  onPaid?: () => void;
  variant?: 'idle' | 'liquidated';
}

export function RechargeCard({ telegramUserId, onPaid, variant = 'idle' }: RechargeCardProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRecharge = async (): Promise<void> => {
    if (!telegramUserId || pending) return;
    hapticImpact('medium');
    setPending(true);
    setErrorMessage(null);
    try {
      const { invoiceLink } = await createRechargeStarsInvoice(telegramUserId);
      const result = await openStarsInvoice(invoiceLink);
      if (result === 'paid') onPaid?.();
      else if (result === 'failed') setErrorMessage(t('payment.failed'));
      else if (result === 'unsupported') setErrorMessage('Use latest Telegram client');
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  const liquidated = variant === 'liquidated';

  return (
    <div
      className={
        liquidated
          ? 'rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-amber-950/40 p-5 shadow-lg shadow-amber-500/10 backdrop-blur-xl'
          : 'rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl'
      }
    >
      {/* ── 라벨 ── */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
            liquidated ? 'text-amber-300' : 'text-white/50'
          }`}
        >
          {liquidated ? t('recharge.card.urgentLabel') : t('recharge.card.label')}
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/40">
          {t('recharge.card.oneTime')}
        </span>
      </div>

      {/* ── 가격 ── */}
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-mono text-3xl font-bold tracking-tight ${
            liquidated ? 'text-amber-200' : 'text-white'
          }`}
        >
          $2.99
        </span>
        <span className="font-mono text-xs text-white/40">≈ 250 ⭐</span>
      </div>

      {/* ── 받는 것 ── */}
      <div className="mt-1 mb-4 flex items-center gap-1.5">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={liquidated ? '#86efac' : '#34d399'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className={`font-mono text-[12px] ${liquidated ? 'text-emerald-200' : 'text-emerald-300/90'}`}>
          {t('recharge.card.value')}
        </span>
      </div>

      {/* ── 결제 버튼 ── */}
      <button
        type="button"
        onClick={() => { void handleRecharge(); }}
        disabled={pending || !telegramUserId}
        className={
          liquidated
            ? 'w-full rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-3 text-slate-900 shadow-md shadow-amber-500/30 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
            : 'w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white transition hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.08em]">
          {pending ? t('payment.processing') : t('recharge.card.cta')}
        </span>
      </button>

      {/* ── 약관 ── */}
      <div
        className={`mt-2.5 text-center text-[11px] ${
          liquidated ? 'text-amber-100/60' : 'text-white/40'
        }`}
      >
        {t('recharge.card.terms')}
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-center text-[11px] font-medium text-rose-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
