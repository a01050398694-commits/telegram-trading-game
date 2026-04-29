/**
 * Stage 15.2 — Premium 잠금 오버레이.
 * 흐릿한 배경 + 자물쇠 아이콘 + CTA 버튼.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';
import { hapticImpact, openStarsInvoice } from '../../utils/telegram';
import { createPremiumStarsInvoice } from '../../lib/api';

interface LockOverlayProps {
  /** 최소 거래 미달인 경우의 메시지 (data 부족) */
  minTradesMessage?: string;
  /** Telegram 사용자 ID — Stars 결제 호출에 필요 */
  telegramUserId: number | null;
  /** 결제 성공 시 상위에서 데이터 재조회 트리거 */
  onPaid?: () => void;
  children: React.ReactNode;
}

export function LockOverlay({ minTradesMessage, telegramUserId, onPaid, children }: LockOverlayProps) {
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

  return (
    <div style={{ position: 'relative' }}>
      {/* 실제 컨텐츠 (블러 처리) */}
      <div style={{ filter: 'blur(6px)', pointerEvents: 'none', opacity: 0.4 }}>
        {children}
      </div>

      {/* 오버레이 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: T.lockOverlayBg,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
      }}>
        {minTradesMessage ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textAlign: 'center' }}>
              {minTradesMessage}
            </div>
          </>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.borderAccent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: T.numberFont }}>
              Premium Only
            </div>
            <button
              type="button"
              onClick={() => { void handleSubscribe(); }}
              disabled={pending || !telegramUserId}
              style={{
                marginTop: 4,
                padding: '10px 24px',
                background: pending ? 'rgba(115,115,115,0.4)' : `linear-gradient(135deg, ${T.borderAccent}, #B8860B)`,
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                cursor: pending || !telegramUserId ? 'not-allowed' : 'pointer',
                letterSpacing: '0.05em',
                opacity: pending || !telegramUserId ? 0.6 : 1,
              }}
            >
              {pending ? t('payment.processing') : `${t('analytics.unlock')} — $39.99/${t('analytics.perMonth')}`}
            </button>
            {errorMessage && (
              <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4, textAlign: 'center' }}>
                {errorMessage}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
