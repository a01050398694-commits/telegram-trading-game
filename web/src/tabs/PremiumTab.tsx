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
import { fetchPremiumAnalytics, type PremiumAnalyticsResponse, type UserStatus } from '../lib/api';
import { StatsCard } from '../components/analytics/StatsCard';
import { HourlyBucketsCard } from '../components/analytics/HourlyBucketsCard';
import { LeverageCard } from '../components/analytics/LeverageCard';
import { BehaviorCard } from '../components/analytics/BehaviorCard';
import { LockOverlay } from '../components/analytics/LockOverlay';
import { PricingCard } from '../components/analytics/PricingCard';
import { RechargeCard } from '../components/RechargeCard';
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

  const isPremium = status?.isPremium ?? false;

  // 분석 데이터 재로드 (PricingCard 결제 성공 시에도 호출 가능하도록 분리)
  const reloadAnalytics = async (): Promise<void> => {
    if (!telegramUserId) return;
    try {
      const data = await fetchPremiumAnalytics(telegramUserId);
      setAnalytics(data);
    } catch {
      // 갱신 실패해도 무시 — 다음 새로고침에서 반영
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
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-[200px] pt-[max(3rem,env(safe-area-inset-top))]"
      style={{ background: T.bg }}
    >
      {/* ── 구독 상태 카드 ────────────────────────── */}
      <SubscriptionStatusCard isPremium={isPremium} />

      {/* ── 결제 진입점 (사용자 컴플레인 §결제창 위치 명확화) ── */}
      {!isPremium && (
        <PricingCard
          telegramUserId={telegramUserId}
          onPaid={() => { void reloadAnalytics(); }}
        />
      )}

      {/* ── Recharge 카드 — 청산 여부 무관 항상 노출 ── */}
      <RechargeCard
        telegramUserId={telegramUserId}
        onPaid={() => { void reloadAnalytics(); }}
        variant={status?.isLiquidated ? 'liquidated' : 'idle'}
      />

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

      {/* 물리 스페이서 */}
      <div className="h-[150px] shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

// ── 구독 상태 카드 (Stage 15.5 Amex 톤) ──────────────────
function SubscriptionStatusCard({ isPremium }: { isPremium: boolean }) {
  const { t } = useTranslation();

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: isPremium
        ? 'linear-gradient(135deg, rgba(184, 134, 11, 0.18) 0%, #0F0F0F 60%)'
        : `linear-gradient(135deg, ${T.bgCard} 0%, #050505 100%)`,
      border: `1px solid ${isPremium ? T.borderAccent : T.border}`,
      borderRadius: 14,
      padding: 18,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: isPremium
        ? '0 0 0 1px rgba(184, 134, 11, 0.18), 0 8px 24px rgba(184, 134, 11, 0.15), inset 0 1px 0 rgba(218, 165, 32, 0.2)'
        : '0 4px 12px rgba(0, 0, 0, 0.5)',
    }}>
      {/* 아이콘 */}
      <div style={{
        position: 'relative',
        width: 44,
        height: 44,
        borderRadius: 12,
        background: isPremium
          ? 'linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #8B6914 100%)'
          : 'rgba(115, 115, 115, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: isPremium
          ? '0 4px 12px rgba(218, 165, 32, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
          : 'none',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill={isPremium ? '#0A0A0A' : 'none'} stroke={isPremium ? '#0A0A0A' : T.textMuted} strokeWidth="2" strokeLinejoin="round">
          {isPremium ? (
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          ) : (
            <circle cx="12" cy="12" r="10" />
          )}
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: isPremium ? '#DAA520' : T.textMuted,
          fontFamily: T.numberFont,
          marginBottom: 3,
        }}>
          {isPremium ? t('analytics.status.premium') : t('analytics.status.free')}
        </div>
        <div style={{
          fontSize: 13,
          color: T.textPrimary,
          fontFamily: T.bodyFont,
          lineHeight: 1.4,
          wordBreak: 'keep-all',
          overflowWrap: 'anywhere',
        }}>
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
