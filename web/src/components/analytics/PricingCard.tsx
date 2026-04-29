/**
 * Stage 15.4 — Premium Pricing Card
 *
 * Bloomberg/Linear 톤 paywall pattern.
 *   · 가격 모노스페이스 강조 (60px gold)
 *   · 혜택 5개 체크리스트
 *   · 30일 자동갱신 약관 명시
 *   · 큰 결제 버튼 (CTA)
 *   · 결제 진입점이 PremiumTab 상단에 명확히 보임 (사용자 컴플레인 §결제창 위치 불명 해결)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';
import { hapticImpact, openStarsInvoice } from '../../utils/telegram';
import { createPremiumStarsInvoice } from '../../lib/api';

interface PricingCardProps {
  telegramUserId: number | null;
  onPaid?: () => void;
}

export function PricingCard({ telegramUserId, onPaid }: PricingCardProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubscribe = async (): Promise<void> => {
    if (!telegramUserId || pending) return;
    hapticImpact('medium');
    setPending(true);
    setErrorMessage(null);
    try {
      const { invoiceLink } = await createPremiumStarsInvoice(telegramUserId);
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
        onClick={() => { void handleSubscribe(); }}
        disabled={pending || !telegramUserId}
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
          cursor: pending || !telegramUserId ? 'not-allowed' : 'pointer',
          letterSpacing: '0.04em',
          fontFamily: T.bodyFont,
          opacity: pending || !telegramUserId ? 0.6 : 1,
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
