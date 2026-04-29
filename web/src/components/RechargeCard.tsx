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
 * 디자인:
 *   · 선택된 tier 는 emerald(idle) / amber(liquidated) glow + 체크마크.
 *   · 결제 버튼에 선택 가격 + credit 미리보기 ("Pay $7.99 → +$5,000")
 *     → CEO 컴플레인 "결제창 위치/혜택 불명" 해결.
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
          : 'rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-900/60 p-5 shadow-lg shadow-emerald-500/5 backdrop-blur-xl'
      }
    >
      {/* ── 헤더 ── */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
            liquidated ? 'text-amber-300' : 'text-emerald-300/90'
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

      {/* ── 결제 버튼 — 선택된 가격 + credit 명시 ── */}
      <button
        type="button"
        onClick={handlePay}
        disabled={pending}
        className={
          liquidated
            ? 'w-full rounded-xl border border-amber-300/60 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-4 py-3.5 text-slate-900 shadow-lg shadow-amber-500/40 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
            : 'w-full rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 px-4 py-3.5 text-white shadow-lg shadow-emerald-500/30 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        {pending ? (
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.08em]">
            {t('payment.processing')}
          </span>
        ) : (
          <div className="flex items-center justify-center gap-2 font-mono">
            <span className="text-[14px] font-black tabular-nums">
              Pay {TIER_PRICE[selectedTier]}
            </span>
            <span className={`text-[14px] font-black tabular-nums ${liquidated ? 'text-emerald-900' : 'text-emerald-200'}`}>
              → {TIER_CREDIT[selectedTier]}
            </span>
          </div>
        )}
      </button>

      {/* ── 약관 ── */}
      <div
        className={`mt-2.5 text-center text-[11px] ${
          liquidated ? 'text-amber-100/60' : 'text-white/45'
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

function TierButton({ selected, credit, price, onClick, liquidated, badge }: TierButtonProps) {
  const baseClass = selected
    ? liquidated
      ? 'border-amber-300 bg-amber-500/20 shadow-md shadow-amber-500/30 ring-2 ring-amber-300/50'
      : 'border-emerald-400/80 bg-emerald-500/15 shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400/40'
    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border ${baseClass} px-2 py-3 text-center transition active:scale-[0.97]`}
    >
      {badge && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 px-2 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-black shadow-md shadow-emerald-500/40">
          {badge}
        </span>
      )}
      {/* 선택 표시 체크 */}
      {selected && (
        <span
          className={`absolute right-1.5 top-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
            liquidated ? 'bg-amber-300' : 'bg-emerald-400'
          }`}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
      <div
        className={`font-mono text-[16px] font-black tabular-nums ${
          selected
            ? liquidated
              ? 'text-amber-100'
              : 'text-emerald-200'
            : 'text-white/70'
        }`}
      >
        {credit}
      </div>
      <div
        className={`mt-0.5 font-mono text-[10px] font-bold tabular-nums ${
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
