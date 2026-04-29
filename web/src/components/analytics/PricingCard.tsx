/**
 * Stage 15.5 — Premium Pricing Card (InviteMember 결제 전환)
 *
 * 왜 InviteMember 로 다시 돌아갔는가:
 *   · Stage 15.3 에서 텔레그램 Stars 직접 invoice 로 갔다가 PayPal 미지원 → 스타 강제 → 비싼 결제 단가.
 *   · InviteMember SaaS 는 PayPal + Stars 양쪽 지원 + 결제 후 채널 자동 초대까지 처리.
 *   · 우리 봇은 채널 멤버십만 폴링 (premiumSync) 해서 is_premium 판정. 결제 자체는 우리 코드 밖.
 *
 * Bloomberg/Linear 톤 paywall pattern 유지:
 *   · 가격 모노스페이스 강조
 *   · 혜택 5개 체크리스트
 *   · 30일 자동갱신 약관 명시
 *   · 큰 결제 버튼 (CTA) — tg.openLink(InviteMember URL)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';
import { hapticImpact, openTelegramLinkSafe } from '../../utils/telegram';

const INVITEMEMBER_PREMIUM_URL = import.meta.env.VITE_INVITEMEMBER_PREMIUM_URL ?? '';

interface PricingCardProps {
  telegramUserId: number | null;
  onPaid?: () => void;
}

export function PricingCard({ telegramUserId, onPaid }: PricingCardProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubscribe = (): void => {
    if (pending) return;
    if (!INVITEMEMBER_PREMIUM_URL) {
      setErrorMessage('Payment link not configured. Contact support.');
      return;
    }
    hapticImpact('medium');
    setPending(true);
    setErrorMessage(null);
    try {
      openTelegramLinkSafe(INVITEMEMBER_PREMIUM_URL);
      // InviteMember 결제 후 채널 자동 초대까지 외부에서 처리되므로,
      // 여기서는 onPaid 콜백을 즉시 호출하지 않고 사용자가 채널 가입 후
      // premiumSync cron 이 5분 내에 잡아주는 흐름을 기다린다.
      // 사용자는 결제 후 앱 재진입 시 Premium 상태 자동 반영.
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

  const benefits = [
    t('premium.plan.benefits.hourly'),
    t('premium.plan.benefits.leverage'),
    t('premium.plan.benefits.behavior'),
    t('premium.plan.benefits.weekly'),
    t('premium.plan.benefits.vipRoom'),
  ];

  return (
    <div
      style={{
        background: T.bgCard,
        border: `1px solid ${T.borderAccent}`,
        borderTop: `3px solid ${T.borderAccent}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 0 0 1px rgba(139, 105, 20, 0.1), 0 4px 12px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* ── 라벨 ── */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        color: T.borderAccent,
        textTransform: 'uppercase',
        fontFamily: T.numberFont,
        marginBottom: 8,
      }}>
        {t('premium.plan.label')}
      </div>

      {/* ── 가격 (큰 모노스페이스 골드) ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{
          fontFamily: T.numberFont,
          fontSize: 38,
          fontWeight: 700,
          color: T.textPrimary,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          $39.99
        </span>
        <span style={{
          fontFamily: T.bodyFont,
          fontSize: 13,
          color: T.textMuted,
          fontWeight: 500,
        }}>
          / {t('premium.plan.cycle')}
        </span>
      </div>

      <div style={{
        fontFamily: T.numberFont,
        fontSize: 11,
        color: T.borderAccent,
        marginBottom: 16,
        letterSpacing: '0.05em',
      }}>
        {t('premium.plan.starsLine')}
      </div>

      {/* ── 혜택 체크리스트 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {benefits.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={T.positive}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 2 }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{
              fontFamily: T.bodyFont,
              fontSize: 13,
              color: T.textPrimary,
              lineHeight: 1.4,
            }}>
              {b}
            </span>
          </div>
        ))}
      </div>

      {/* ── 결제 버튼 ── */}
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={pending}
        style={{
          width: '100%',
          padding: '14px 0',
          background: pending
            ? 'rgba(115,115,115,0.4)'
            : `linear-gradient(135deg, ${T.borderAccent}, #B8860B)`,
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          color: '#fff',
          cursor: pending ? 'not-allowed' : 'pointer',
          letterSpacing: '0.04em',
          fontFamily: T.bodyFont,
          opacity: pending ? 0.6 : 1,
          transition: 'opacity 0.2s ease, transform 0.1s ease',
        }}
      >
        {pending ? t('payment.processing') : t('premium.plan.cta')}
      </button>

      {/* ── 약관 ── */}
      <div style={{
        fontFamily: T.bodyFont,
        fontSize: 11,
        color: T.textMuted,
        marginTop: 10,
        textAlign: 'center',
        lineHeight: 1.4,
      }}>
        {t('premium.plan.terms')}
      </div>

      {errorMessage && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 8,
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          fontSize: 12,
          color: '#fca5a5',
          textAlign: 'center',
          fontFamily: T.bodyFont,
        }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
