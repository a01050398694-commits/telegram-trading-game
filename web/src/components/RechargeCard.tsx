/**
 * Stage 15.5 — Recharge Card (InviteMember 3패키지 토글)
 *
 * 패키지:
 *   · $2.99   → +$1,000 게임머니
 *   · $7.99   → +$5,000  ("BEST VALUE" 강조)
 *   · $13.99  → +$10,000
 *
 * 흐름:
 *   1. 사용자가 패키지 선택 → InviteMember plan URL 외부 링크 (PayPal/Stars 지원)
 *   2. 결제 성공 → InviteMember 가 패키지 별 채널에 자동 초대
 *   3. 봇 chat_member 핸들러가 채널 ID 보고 credit 매핑 → DB +balance
 *   4. 5분 후 자동 ban+unban → 채널 떠남, 다음 결제 시 재가입 가능
 *
 * variant:
 *   · 'idle'       — 평소 (PortfolioTab 의 디폴트)
 *   · 'liquidated' — 청산 직후 (강조 톤, amber gradient)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticImpact, hapticSelection, openTelegramLinkSafe } from '../utils/telegram';

type Tier = '1k' | '5k' | '10k';

const TIER_URL: Record<Tier, string> = {
  '1k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_1K_URL ?? import.meta.env.VITE_INVITEMEMBER_RECHARGE_URL ?? '',
  '5k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_5K_URL ?? '',
  '10k': import.meta.env.VITE_INVITEMEMBER_RECHARGE_10K_URL ?? '',
};

interface RechargeCardProps {
  telegramUserId: number | null;
  onPaid?: () => void;
  variant?: 'idle' | 'liquidated';
}

export function RechargeCard({ telegramUserId, onPaid, variant = 'idle' }: RechargeCardProps) {
  const { t } = useTranslation();
  const [selectedTier, setSelectedTier] = useState<Tier>('1k');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePay = (): void => {
    if (pending) return;
    const url = TIER_URL[selectedTier];
    if (!url) {
      setErrorMessage('Payment link not configured. Contact support.');
      return;
    }
    hapticImpact('medium');
    setPending(true);
    setErrorMessage(null);
    try {
      openTelegramLinkSafe(url);
      // 외부 결제 후 채널 가입 → 봇 핸들러가 잔고 적립 → 사용자가 앱 복귀 시 onPaid 로 새 잔고 fetch.
      setTimeout(() => {
        setPending(false);
        onPaid?.();
      }, 800);
    } catch (err) {
      setErrorMessage((err as Error).message);
      setPending(false);
    }
    void telegramUserId;
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
      {/* ── 헤더 ── */}
      <div className="mb-3 flex items-center justify-between">
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

      {/* ── 패키지 토글 (3옵션) ── */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <TierButton
          tier="1k"
          selected={selectedTier === '1k'}
          credit={t('recharge.tier.1k')}
          price={t('recharge.tier.1k_price')}
          onClick={() => { hapticSelection(); setSelectedTier('1k'); }}
          liquidated={liquidated}
        />
        <TierButton
          tier="5k"
          selected={selectedTier === '5k'}
          credit={t('recharge.tier.5k')}
          price={t('recharge.tier.5k_price')}
          onClick={() => { hapticSelection(); setSelectedTier('5k'); }}
          liquidated={liquidated}
          badge={t('recharge.tier.best')}
        />
        <TierButton
          tier="10k"
          selected={selectedTier === '10k'}
          credit={t('recharge.tier.10k')}
          price={t('recharge.tier.10k_price')}
          onClick={() => { hapticSelection(); setSelectedTier('10k'); }}
          liquidated={liquidated}
        />
      </div>

      {/* ── 결제 버튼 ── */}
      <button
        type="button"
        onClick={handlePay}
        disabled={pending}
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

interface TierButtonProps {
  tier: Tier;
  selected: boolean;
  credit: string;
  price: string;
  onClick: () => void;
  liquidated: boolean;
  badge?: string;
}

function TierButton({ selected, credit, price, onClick, liquidated, badge }: TierButtonProps) {
  const baseBorder = selected
    ? liquidated
      ? 'border-amber-300/80 bg-amber-500/15'
      : 'border-white/40 bg-white/[0.08]'
    : 'border-white/10 bg-white/[0.02]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border ${baseBorder} px-2 py-3 text-left transition active:scale-[0.97]`}
    >
      {badge && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-black">
          {badge}
        </span>
      )}
      <div
        className={`font-mono text-[15px] font-bold tabular-nums ${
          selected
            ? liquidated
              ? 'text-amber-100'
              : 'text-white'
            : 'text-white/70'
        }`}
      >
        {credit}
      </div>
      <div
        className={`mt-0.5 font-mono text-[10px] tabular-nums ${
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
