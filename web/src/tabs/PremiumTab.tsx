/**
 * Stage 15.2 — PremiumTab 전면 재구성.
 *
 * 새 구조:
 *   [상단] 구독 상태 카드 (무료 / Premium)
 *   [모듈 A] 매매 통계 — 항상 표시
 *   [모듈 B] 시간대 성과 — Premium 아니면 잠금 오버레이
 *   [모듈 C] 레버리지 분석 — 잠금
 *   [모듈 D] 거래 행동 — 잠금
 *   [하단] CTA: "Premium 잠금 해제 — $39.99/월"
 *
 * 디자인: Bloomberg Terminal 톤. 이모지 금지 (분석 카드 내부).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hapticImpact, openStarsInvoice } from '../utils/telegram';
import { createPremiumStarsInvoice, fetchPremiumAnalytics, type PremiumAnalyticsResponse, type UserStatus } from '../lib/api';
import { StatsCard } from '../components/analytics/StatsCard';
import { HourlyBucketsCard } from '../components/analytics/HourlyBucketsCard';
import { LeverageCard } from '../components/analytics/LeverageCard';
import { BehaviorCard } from '../components/analytics/BehaviorCard';
import { LockOverlay } from '../components/analytics/LockOverlay';
import { ANALYTICS_TOKENS as T } from '../styles/tokens';

type PremiumTabProps = {
  telegramUserId: number | null;
  status: UserStatus | null;
};

export function PremiumTab({ telegramUserId, status }: PremiumTabProps) {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<PremiumAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionPending, setSubscriptionPending] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const isPremium = status?.isPremium ?? false;

  // 분석 데이터 재로드 (LockOverlay 결제 성공 시에도 호출 가능하도록 분리)
  const reloadAnalytics = async (): Promise<void> => {
    if (!telegramUserId) return;
    try {
      const data = await fetchPremiumAnalytics(telegramUserId);
      setAnalytics(data);
    } catch {
      // 갱신 실패해도 무시 — 다음 새로고침에서 반영
    }
  };

  // Stage 15.3 — Premium Stars 결제
  const handleSubscribeCta = async () => {
    if (!telegramUserId) return;
    setSubscriptionError(null);
    setSubscriptionPending(true);
    try {
      hapticImpact('medium');
      const { invoiceLink } = await createPremiumStarsInvoice(telegramUserId);
      const result = await openStarsInvoice(invoiceLink);
      if (result === 'paid') {
        setSubscriptionError(null);
        await reloadAnalytics();
      } else if (result === 'failed') {
        setSubscriptionError(t('payment.failed'));
      } else if (result === 'unsupported') {
        setSubscriptionError('Use latest Telegram client');
      }
      // cancelled/pending — 무시
    } catch (err) {
      setSubscriptionError((err as Error).message);
    } finally {
      setSubscriptionPending(false);
    }
  };

  // 분석 데이터 로딩
  useEffect(() => {
    if (!telegramUserId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchPremiumAnalytics(telegramUserId);
        if (!cancelled) {
          setAnalytics(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [telegramUserId]);

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-y-auto px-3 pt-12 pb-[150px]"
      style={{ background: T.bg }}
    >
      {/* ── 구독 상태 카드 ────────────────────────── */}
      <SubscriptionStatusCard isPremium={isPremium} />

      {/* ── 로딩 / 에러 상태 ─────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: T.textMuted, fontSize: 13, fontFamily: T.numberFont }}>
          {t('common.loading')}
        </div>
      )}

      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: T.negative, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── 분석 모듈들 ──────────────────────────── */}
      {analytics && !loading && (
        <>
          {/* 모듈 A — 매매 통계 (항상 표시) */}
          <StatsCard
            stats={analytics.stats}
            totalTrades={analytics.totalTrades}
            windowDays={analytics.windowDays}
          />

          {/* 모듈 B — 시간대별 성과 */}
          {analytics.totalTrades < 10 ? (
            <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }} minTradesMessage={t('analytics.minTrades', { current: analytics.totalTrades })}>
              <PlaceholderCard title={t('analytics.hourly.title')} />
            </LockOverlay>
          ) : !isPremium ? (
            <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }}>
              <PlaceholderCard title={t('analytics.hourly.title')} />
            </LockOverlay>
          ) : analytics.hourly ? (
            <HourlyBucketsCard data={analytics.hourly} />
          ) : null}

          {/* 모듈 C — 레버리지 분석 */}
          {analytics.totalTrades < 10 ? (
            <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }} minTradesMessage={t('analytics.minTrades', { current: analytics.totalTrades })}>
              <PlaceholderCard title={t('analytics.leverage.title')} />
            </LockOverlay>
          ) : !isPremium ? (
            <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }}>
              <PlaceholderCard title={t('analytics.leverage.title')} />
            </LockOverlay>
          ) : analytics.leverage ? (
            <LeverageCard data={analytics.leverage} />
          ) : null}

          {/* 모듈 D — 거래 행동 */}
          {analytics.totalTrades < 10 ? (
            <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }} minTradesMessage={t('analytics.minTrades', { current: analytics.totalTrades })}>
              <PlaceholderCard title={t('analytics.behavior.title')} />
            </LockOverlay>
          ) : !isPremium ? (
            <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }}>
              <PlaceholderCard title={t('analytics.behavior.title')} />
            </LockOverlay>
          ) : analytics.behavior ? (
            <BehaviorCard data={analytics.behavior} telegramUserId={telegramUserId} />
          ) : null}
        </>
      )}

      {/* ── telegramUserId 없는 경우 (브라우저 미리보기) — 빈 통계 + 잠금 프리뷰 ── */}
      {!analytics && !loading && !error && (
        <>
          <StatsCard
            stats={{ pnlUsd: 0, winRate: 0, rrRatio: 0, maxLossStreak: 0, liquidations: 0, avgHoldMinutes: 0 }}
            totalTrades={0}
            windowDays={30}
          />
          <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }}>
            <PlaceholderCard title={t('analytics.hourly.title')} />
          </LockOverlay>
          <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }}>
            <PlaceholderCard title={t('analytics.leverage.title')} />
          </LockOverlay>
          <LockOverlay telegramUserId={telegramUserId} onPaid={() => { void reloadAnalytics(); }}>
            <PlaceholderCard title={t('analytics.behavior.title')} />
          </LockOverlay>
        </>
      )}

      {/* ── 하단 CTA ─────────────────────────────── */}
      {!isPremium && (
        <div>
          <button
            type="button"
            onClick={handleSubscribeCta}
            disabled={subscriptionPending}
            style={{
              width: '100%',
              padding: '16px 0',
              background: subscriptionPending
                ? `linear-gradient(135deg, ${T.borderAccent}, #B8860B)`
                : `linear-gradient(135deg, ${T.borderAccent}, #B8860B)`,
              border: 'none',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              cursor: subscriptionPending ? 'not-allowed' : 'pointer',
              letterSpacing: '0.06em',
              fontFamily: T.numberFont,
              marginTop: 4,
              opacity: subscriptionPending ? 0.6 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            {subscriptionPending ? t('payment.processing') : t('premium.subscribeCta')}
          </button>
          {subscriptionError && (
            <div style={{
              marginTop: 12,
              padding: '12px',
              borderRadius: 8,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: 12,
              color: '#ef4444',
              textAlign: 'center',
              fontFamily: T.bodyFont,
            }}>
              {subscriptionError}
            </div>
          )}
        </div>
      )}

      {/* 물리 스페이서 */}
      <div className="h-[150px] shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

// ── 구독 상태 카드 ──────────────────────────────────────
function SubscriptionStatusCard({ isPremium }: { isPremium: boolean }) {
  const { t } = useTranslation();

  return (
    <div style={{
      background: isPremium ? 'rgba(139, 105, 20, 0.1)' : T.bgCard,
      border: `1px solid ${isPremium ? T.borderAccent : T.border}`,
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* 아이콘 */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: isPremium ? 'rgba(139, 105, 20, 0.2)' : 'rgba(115, 115, 115, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isPremium ? T.borderAccent : T.textMuted} strokeWidth="2">
          {isPremium ? (
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          ) : (
            <circle cx="12" cy="12" r="10" />
          )}
        </svg>
      </div>

      <div>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: isPremium ? T.borderAccent : T.textMuted,
          fontFamily: T.numberFont,
        }}>
          {isPremium ? t('analytics.status.premium') : t('analytics.status.free')}
        </div>
        <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 2, fontFamily: T.bodyFont }}>
          {isPremium ? t('analytics.status.premiumDesc') : t('analytics.status.freeDesc')}
        </div>
      </div>
    </div>
  );
}

// ── 플레이스홀더 카드 (잠금/부족 시 배경용) ──────────────
function PlaceholderCard({ title }: { title: string }) {
  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderTop: `2px solid ${T.borderAccent}`,
      borderRadius: 12,
      padding: 16,
      minHeight: 140,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 16, background: T.border, borderRadius: 4, width: `${70 + Math.random() * 30}%` }} />
        ))}
      </div>
    </div>
  );
}
