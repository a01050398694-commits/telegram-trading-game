/**
 * Stage 15.2 — 모듈 B: 시간대별 성과 카드 (Premium 잠금).
 * KST 기준 4구간별 PnL, 승률, 거래 수 + 권고 텍스트.
 */
import { useTranslation } from 'react-i18next';
import type { ModuleB } from '../../lib/api';
import { AnalyticsCard } from './AnalyticsCard';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';

interface HourlyBucketsCardProps {
  data: ModuleB;
}

export function HourlyBucketsCard({ data }: HourlyBucketsCardProps) {
  const { t } = useTranslation();

  return (
    <AnalyticsCard
      title={t('analytics.hourly.title')}
      subtitle="KST"
      borderTop="gold"
    >
      {/* 테이블 헤더 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 50px',
        gap: 4,
        marginBottom: 6,
        fontSize: 10,
        fontWeight: 700,
        color: T.textMuted,
        fontFamily: T.numberFont,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        <span>{t('analytics.hourly.timeSlot')}</span>
        <span style={{ textAlign: 'right' }}>PnL</span>
        <span style={{ textAlign: 'right' }}>{t('analytics.hourly.winRate')}</span>
        <span style={{ textAlign: 'right' }}>{t('analytics.hourly.trades')}</span>
      </div>

      {/* 구간별 데이터 */}
      {data.buckets.map((bucket) => {
        const isWeakest = bucket.label === data.weakestBucket;
        return (
          <div
            key={bucket.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 60px 50px',
              gap: 4,
              padding: '6px 0',
              borderLeft: isWeakest ? `2px solid ${T.negative}` : '2px solid transparent',
              paddingLeft: isWeakest ? 8 : 0,
              fontSize: 13,
              fontFamily: T.numberFont,
            }}
          >
            <span style={{ color: T.textPrimary, fontSize: 12 }}>{bucket.label}</span>
            <span style={{
              textAlign: 'right',
              color: bucket.pnl >= 0 ? T.positive : T.negative,
              fontWeight: 600,
            }}>
              {bucket.pnl >= 0 ? '+' : ''}${Math.abs(bucket.pnl).toFixed(0)}
            </span>
            <span style={{ textAlign: 'right', color: T.textPrimary }}>
              {bucket.trades > 0 ? `${Math.round(bucket.winRate * 100)}%` : '-'}
            </span>
            <span style={{ textAlign: 'right', color: T.textMuted }}>
              {bucket.trades}
            </span>
          </div>
        );
      })}

      {/* 권고 텍스트 */}
      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        background: 'rgba(229, 160, 48, 0.08)',
        border: `1px solid rgba(229, 160, 48, 0.2)`,
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        color: T.warning,
        fontFamily: T.bodyFont,
      }}>
        {data.recommendationText}
      </div>
    </AnalyticsCard>
  );
}
