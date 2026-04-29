/**
 * Stage 15.5 — Premium Pricing Card (Amex Black Card 톤)
 *
 * 결제 흐름: tg.openLink(InviteMember Premium URL).
 *   InviteMember 페이지에서 PayPal + Telegram Stars 둘 다 결제 옵션 노출.
 *
 * 디자인:
 *   · 카드 bg: 검정 + 골드 그라디언트 — Amex Black 레퍼런스
 *   · 큰 가격 ($39.99) + 골드 글로우
 *   · 라벨 + PRO 뱃지 + 5혜택 체크리스트
 *   · 결제 버튼: 메탈릭 골드 + 깊은 shadow
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
      // 결제 후 채널 가입 → premiumSync cron 으로 5분 내 반영. 사용자 앱 복귀 시 자동.
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
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, rgba(184, 134, 11, 0.18) 0%, ${T.bgCard} 45%, #050505 100%)`,
        border: `1px solid ${T.borderAccent}`,
        borderTop: `4px solid ${T.borderAccent}`,
        borderRadius: 16,
        padding: 22,
        boxShadow: '0 0 0 1px rgba(184, 134, 11, 0.18), 0 12px 40px rgba(184, 134, 11, 0.18), 0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(218, 165, 32, 0.25)',
      }}
    >
      {/* 우상단 골드 글로우 */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 140,
          height: 140,
          background: 'radial-gradient(circle, rgba(218, 165, 32, 0.4) 0%, transparent 70%)',
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />

      {/* ── 라벨 + PRO 뱃지 ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.22em',
          color: '#DAA520',
          textTransform: 'uppercase',
          fontFamily: T.numberFont,
        }}>
          {t('premium.plan.label')}
        </span>
        <span style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: '0.18em',
          color: '#0A0A0A',
          textTransform: 'uppercase',
          fontFamily: T.numberFont,
          background: 'linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #8B6914 100%)',
          padding: '4px 9px',
          borderRadius: 5,
          boxShadow: '0 2px 8px rgba(218, 165, 32, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
        }}>
          PRO
        </span>
      </div>

      {/* ── 가격 (큰 모노스페이스 골드 + 글로우) ── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        <span style={{
          fontFamily: T.numberFont,
          fontSize: 46,
          fontWeight: 900,
          color: T.textPrimary,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          textShadow: '0 0 28px rgba(218, 165, 32, 0.4), 0 2px 4px rgba(0, 0, 0, 0.6)',
        }}>
          $39.99
        </span>
        <span style={{
          fontFamily: T.bodyFont,
          fontSize: 13,
          color: '#A0A0A0',
          fontWeight: 500,
        }}>
          / {t('premium.plan.cycle')}
        </span>
      </div>

      <div style={{
        position: 'relative',
        fontFamily: T.numberFont,
        fontSize: 11,
        fontWeight: 600,
        color: '#DAA520',
        marginBottom: 18,
        letterSpacing: '0.06em',
      }}>
        {t('premium.plan.starsLine')}
      </div>

      {/* ── 혜택 체크리스트 ── */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 20 }}>
        {benefits.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <span style={{
              flexShrink: 0,
              marginTop: 1,
              width: 18,
              height: 18,
              borderRadius: 5,
              background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.25), rgba(184, 134, 11, 0.1))',
              border: '1px solid rgba(218, 165, 32, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DAA520" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span style={{
              fontFamily: T.bodyFont,
              fontSize: 13,
              color: T.textPrimary,
              lineHeight: 1.45,
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
            }}>
              {b}
            </span>
          </div>
        ))}
      </div>

      {/* ── 결제 버튼 (메탈릭 골드) ── */}
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={pending}
        style={{
          position: 'relative',
          width: '100%',
          padding: '16px 0',
          background: pending
            ? 'rgba(115,115,115,0.4)'
            : 'linear-gradient(135deg, #FFD700 0%, #DAA520 35%, #B8860B 70%, #8B6914 100%)',
          border: '1px solid rgba(255, 215, 0, 0.6)',
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 900,
          color: '#0A0A0A',
          cursor: pending ? 'not-allowed' : 'pointer',
          letterSpacing: '0.06em',
          fontFamily: T.bodyFont,
          opacity: pending ? 0.6 : 1,
          transition: 'opacity 0.2s ease, transform 0.1s ease',
          boxShadow: pending
            ? 'none'
            : '0 8px 24px rgba(218, 165, 32, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 0 rgba(0, 0, 0, 0.2)',
          textShadow: '0 1px 1px rgba(255, 255, 255, 0.3)',
          overflow: 'hidden',
        }}
      >
        {/* shine */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            top: 0,
            height: '50%',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />
        <span style={{ position: 'relative' }}>
          {pending ? t('payment.processing') : t('premium.plan.cta')}
        </span>
      </button>

      {/* ── 약관 ── */}
      <div style={{
        position: 'relative',
        fontFamily: T.bodyFont,
        fontSize: 11,
        color: '#888888',
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 1.4,
      }}>
        {t('premium.plan.terms')}
      </div>

      {errorMessage && (
        <div style={{
          position: 'relative',
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
