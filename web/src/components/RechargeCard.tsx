/**
 * Stage 15.5 / Stage 21 — Recharge Card (Amex/Apple Card 톤 luxurious 업그레이드)
 *
 * 패키지:
 *   · $2.99   → +$1,000 게임머니
 *   · $7.99   → +$5,000  ("BEST VALUE" 강조)
 *   · $13.99  → +$10,000
 *
 * 결제 흐름:
 *   · PayPal → tg.openLink(InviteMember plan URL). InviteMember 가 패키지 별 채널에
 *     자동 초대 → 봇 chat_member 핸들러가 +balance.
 *   · Stars  → POST /api/invoice/create → tg.openInvoice() Telegram NATIVE popup.
 *              callback('paid') → polling 으로 새 잔고 반영. InviteMember 우회.
 *
 * 디자인 (Stage 15.5 폴리시):
 *   · 메탈릭 골드 강조 (idle) / amber dramatic (liquidated)
 *   · 토글: 큰 +$X,XXX + 가격 + 체크마크 + glow ring
 *   · 결제 버튼: "Pay $X.XX → +$Y,YYY" 큰 명조 + 깊은 shadow
 *   · BEST VALUE 뱃지 emerald gradient
 *
 * variant:
 *   · 'idle'       — 평소 (PortfolioTab 디폴트, gold accent)
 *   · 'liquidated' — 청산 직후 (amber dramatic)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  hapticImpact,
  hapticNotification,
  hapticSelection,
  openTelegramLinkSafe,
  openInvoiceAsync,
  isInvoiceSupported,
} from '../utils/telegram';
import { setLegalPage, type LegalPageKey } from '../lib/legalRoute';
import { usePaymentPolling } from '../hooks/usePaymentPolling';
import { track } from '../lib/analytics';
import { createStarsInvoice, ApiError, type StarsPlan } from '../lib/api';

type Tier = '1k' | '5k' | '10k';

const TIER_TO_STARS_PLAN: Record<Tier, StarsPlan> = {
  '1k': 'recharge_1k',
  '5k': 'recharge_5k',
  '10k': 'recharge_10k',
};

// PayPal/USD 외부 페이지 plan — InviteMember 가 외부 브라우저 결제로 PayPal/카드 노출.
const TIER_URL: Record<Tier, string> = {
  '1k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_1K_URL ?? import.meta.env.VITE_INVITEMEMBER_RECHARGE_URL ?? '',
  '5k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_5K_URL ?? '',
  '10k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_10K_URL ?? '',
};

// Stars fallback (only used when openInvoice unsupported on the user's client).
const TIER_STARS_URL: Record<Tier, string> = {
  '1k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_1K_STARS_URL ?? '',
  '5k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_5K_STARS_URL ?? '',
  '10k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_10K_STARS_URL ?? '',
};

// Stage 21 — same gate as PricingCard. PayPal toggle hidden by default because
// the InviteMember external page renders all four plans on a single screen and
// confuses users. Stars native flow is single-plan popup. Flip on once
// InviteMember is reorganized to one-plan-per-page.
const PAYPAL_ENABLED = import.meta.env.VITE_PAYPAL_ENABLED === 'true';

const TIER_PRICE: Record<Tier, string> = {
  '1k': '$2.99',
  '5k': '$7.99',
  '10k': '$13.99',
};

const TIER_CREDIT: Record<Tier, string> = {
  '1k': '+$1,000',
  '5k': '+$5,000',
  '10k': '+$10,000',
};

interface RechargeCardProps {
  telegramUserId: number | null;
  onPaid?: () => void;
  variant?: 'idle' | 'liquidated';
}

type PayMethod = 'paypal' | 'stars';

export function RechargeCard({ telegramUserId, onPaid, variant = 'idle' }: RechargeCardProps) {
  const { t } = useTranslation();
  const [selectedTier, setSelectedTier] = useState<Tier>('1k');
  const [payMethod, setPayMethod] = useState<PayMethod>('stars');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const paymentPolling = usePaymentPolling(
    pending ? telegramUserId : null,
    () => {
      setPending(false);
      onPaid?.();
    },
  );

  const showPayMethodToggle = PAYPAL_ENABLED;

  const handlePay = async (): Promise<void> => {
    if (pending || !consent) return;
    hapticImpact('medium');
    setErrorMessage(null);
    track('premium_cta_clicked', { method: payMethod, source: 'recharge_card', tier: selectedTier });

    if (payMethod === 'stars') {
      // Native Stars first, InviteMember Stars URL only as a legacy-client fallback.
      if (!isInvoiceSupported()) {
        const fallback = TIER_STARS_URL[selectedTier];
        if (fallback) {
          setPending(true);
          paymentPolling.startPayment();
          try {
            openTelegramLinkSafe(fallback);
          } catch (err) {
            setErrorMessage((err as Error).message);
            setPending(false);
          }
          return;
        }
        setErrorMessage(t('payment.starsUnsupported'));
        return;
      }

      setPending(true);
      try {
        const inv = await createStarsInvoice(TIER_TO_STARS_PLAN[selectedTier]);
        const status = await openInvoiceAsync(inv.invoiceLink);
        if (status === 'paid') {
          hapticNotification('success');
          paymentPolling.startPayment();
        } else if (status === 'cancelled') {
          setPending(false);
        } else if (status === 'pending') {
          paymentPolling.startPayment();
        } else {
          setPending(false);
          hapticNotification('error');
          setErrorMessage(t('payment.failed'));
        }
      } catch (err) {
        setPending(false);
        hapticNotification('error');
        const msg = err instanceof ApiError ? err.message : (err as Error).message;
        setErrorMessage(msg || t('payment.failed'));
      }
      return;
    }

    // PayPal: InviteMember external page.
    const url = TIER_URL[selectedTier];
    if (!url) {
      setErrorMessage(t('errors.paymentLinkMissing', { handle: t('errors.supportHandle') }));
      return;
    }
    setPending(true);
    paymentPolling.startPayment();
    try {
      openTelegramLinkSafe(url);
    } catch (err) {
      setErrorMessage((err as Error).message);
      setPending(false);
    }
  };

  const handleLegalClick = (page: LegalPageKey) => {
    setLegalPage(page);
  };

  const liquidated = variant === 'liquidated';

  return (
    <div
      className={
        liquidated
          ? 'relative w-full max-w-full overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-950 via-stone-950 to-amber-950 p-5 shadow-[0_8px_32px_rgba(217,119,6,0.25),inset_0_1px_0_rgba(252,211,77,0.15)] backdrop-blur-xl'
          : 'relative w-full max-w-full overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(217,119,6,0.15)] backdrop-blur-xl'
      }
    >
      {/* 배경 액센트 — 우상단 골드 글로우 */}
      <div
        className={`pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl ${
          liquidated ? 'bg-amber-400/30' : 'bg-amber-500/15'
        }`}
        aria-hidden="true"
      />

      {/* ── 헤더 ── */}
      <div className="relative mb-4 flex items-center justify-between">
        <span
          className={`font-mono text-[10px] font-black uppercase tracking-[0.22em] ${
            liquidated ? 'text-amber-200' : 'text-amber-400/90'
          }`}
        >
          {liquidated ? t('recharge.card.urgentLabel') : t('recharge.card.label')}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
            liquidated
              ? 'border-amber-200/40 bg-amber-200/10 text-amber-100'
              : 'border-white/10 bg-white/[0.04] text-white/50'
          }`}
        >
          {t('recharge.card.oneTime')}
        </span>
      </div>

      {/* ── 패키지 토글 (3옵션) ── */}
      <div className="relative mb-4 grid grid-cols-3 gap-2">
        <TierButton
          selected={selectedTier === '1k'}
          credit={TIER_CREDIT['1k']}
          price={TIER_PRICE['1k']}
          onClick={() => { hapticSelection(); setSelectedTier('1k'); }}
          liquidated={liquidated}
        />
        <TierButton
          selected={selectedTier === '5k'}
          credit={TIER_CREDIT['5k']}
          price={TIER_PRICE['5k']}
          onClick={() => { hapticSelection(); setSelectedTier('5k'); }}
          liquidated={liquidated}
          badge={t('recharge.tier.best')}
        />
        <TierButton
          selected={selectedTier === '10k'}
          credit={TIER_CREDIT['10k']}
          price={TIER_PRICE['10k']}
          onClick={() => { hapticSelection(); setSelectedTier('10k'); }}
          liquidated={liquidated}
        />
      </div>

      {/* ── 결제 수단 토글 (PayPal / Stars) — Stars URL 채워질 때만 노출 ── */}
      {showPayMethodToggle && (
        <div className="relative mb-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          <PayMethodTab
            active={payMethod === 'paypal'}
            label="PayPal"
            sub="USD"
            liquidated={liquidated}
            onClick={() => { hapticSelection(); setPayMethod('paypal'); }}
          />
          <PayMethodTab
            active={payMethod === 'stars'}
            label="Stars"
            sub="★ Telegram"
            liquidated={liquidated}
            onClick={() => { hapticSelection(); setPayMethod('stars'); }}
          />
        </div>
      )}

      {/* ── 동의 체크박스 ── */}
      <div className="mb-4 flex items-start gap-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/20 accent-emerald-500"
        />
        <label className="flex-1 text-xs leading-relaxed text-white/60">
          {t('payment.consentLabel')}{' '}
          <button
            type="button"
            onClick={() => handleLegalClick('terms')}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {t('legal.links.terms')}
          </button>
          ,{' '}
          <button
            type="button"
            onClick={() => handleLegalClick('privacy')}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {t('legal.links.privacy')}
          </button>
          , {t('payment.consentAnd')}{' '}
          <button
            type="button"
            onClick={() => handleLegalClick('refund')}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {t('legal.links.refund')}
          </button>
        </label>
      </div>

      {/* ── 결제 버튼 — 메탈릭 그라디언트 + 큰 명조 ── */}
      <button
        type="button"
        onClick={() => { void handlePay(); }}
        disabled={pending || !consent}
        className={
          liquidated
            ? 'relative w-full min-h-[44px] overflow-hidden rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-300 via-amber-500 to-amber-600 px-4 py-4 text-stone-950 shadow-[0_8px_24px_rgba(217,119,6,0.5),inset_0_1px_0_rgba(255,255,255,0.4)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center'
            : 'relative w-full min-h-[44px] overflow-hidden rounded-xl border border-emerald-300/40 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 px-4 py-4 text-white shadow-[0_8px_24px_rgba(16,185,129,0.4),inset_0_1px_0_rgba(255,255,255,0.25)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center'
        }
      >
        {/* shine */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" aria-hidden="true" />
        {pending ? (
          <span className="relative font-mono text-[12px] font-bold uppercase tracking-[0.08em]">
            {t('payment.processing')}
          </span>
        ) : (
          <div className="relative flex items-center justify-center gap-2 font-mono">
            <span className={`text-[15px] font-black tabular-nums ${liquidated ? 'text-stone-950' : 'text-white'}`}>
              {payMethod === 'stars' ? `Pay ★ ${TIER_PRICE[selectedTier]}` : `Pay ${TIER_PRICE[selectedTier]}`}
            </span>
            <span className={`text-[15px] font-black tabular-nums ${liquidated ? 'text-emerald-900' : 'text-emerald-100'}`}>
              → {TIER_CREDIT[selectedTier]}
            </span>
          </div>
        )}
      </button>

      {/* ── 약관 ── */}
      <div
        className={`mt-3 text-center text-[11px] leading-relaxed ${
          liquidated ? 'text-amber-100/70' : 'text-white/45'
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

interface TierButtonProps {
  selected: boolean;
  credit: string;
  price: string;
  onClick: () => void;
  liquidated: boolean;
  badge?: string;
}

interface PayMethodTabProps {
  active: boolean;
  label: string;
  sub: string;
  liquidated: boolean;
  onClick: () => void;
}

function PayMethodTab({ active, label, sub, liquidated, onClick }: PayMethodTabProps) {
  const activeClass = liquidated
    ? 'bg-amber-500/20 ring-1 ring-amber-300/60 shadow-[inset_0_1px_0_rgba(252,211,77,0.3)]'
    : 'bg-emerald-500/15 ring-1 ring-emerald-400/50 shadow-[inset_0_1px_0_rgba(110,231,183,0.25)]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 transition active:scale-[0.97] ${
        active ? activeClass : 'hover:bg-white/[0.04]'
      }`}
    >
      <span
        className={`font-mono text-[12px] font-black uppercase tracking-wider ${
          active
            ? liquidated
              ? 'text-amber-100'
              : 'text-emerald-100'
            : 'text-white/60'
        }`}
      >
        {label}
      </span>
      <span
        className={`mt-0.5 font-mono text-[9px] tracking-wider ${
          active
            ? liquidated
              ? 'text-amber-300'
              : 'text-emerald-300'
            : 'text-white/35'
        }`}
      >
        {sub}
      </span>
    </button>
  );
}

function TierButton({ selected, credit, price, onClick, liquidated, badge }: TierButtonProps) {
  const baseClass = selected
    ? liquidated
      ? 'border-amber-200 bg-gradient-to-b from-amber-400/30 to-amber-600/20 shadow-[0_4px_12px_rgba(217,119,6,0.4),inset_0_1px_0_rgba(252,211,77,0.4)] ring-2 ring-amber-200/60'
      : 'border-emerald-400/80 bg-gradient-to-b from-emerald-500/20 to-emerald-700/10 shadow-[0_4px_12px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(110,231,183,0.3)] ring-2 ring-emerald-400/50'
    : 'border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent hover:from-white/[0.05]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border ${baseClass} px-1.5 py-3 text-center transition active:scale-[0.97]`}
    >
      {badge && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 px-2 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-stone-950 shadow-[0_2px_8px_rgba(16,185,129,0.5)]">
          {badge}
        </span>
      )}
      {/* 선택 표시 체크 (우상단) */}
      {selected && (
        <span
          className={`absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full ${
            liquidated ? 'bg-amber-200' : 'bg-emerald-400'
          } shadow-md`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
      {/* Stage 15.7 — 좁은 모바일 (~360px) 에서 '+$10,000' 잘림 방지: 15px → 13px tracking-tight. */}
      <div
        className={`font-mono text-[13px] font-black tabular-nums leading-none tracking-tight ${
          selected
            ? liquidated
              ? 'text-amber-100'
              : 'text-emerald-100'
            : 'text-white/75'
        }`}
      >
        {credit}
      </div>
      <div
        className={`mt-1 font-mono text-[10px] font-bold tabular-nums ${
          selected
            ? liquidated
              ? 'text-amber-300'
              : 'text-emerald-300'
            : 'text-white/40'
        }`}
      >
        {price}
      </div>
    </button>
  );
}
