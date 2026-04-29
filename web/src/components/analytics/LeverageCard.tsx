/**
 * Stage 15.2 — 모듈 C: 레버리지 vs 청산률 카드 (Premium 잠금).
 * 5개 레버리지 구간별 청산률 + 임계점 자동 식별.
 */
import { useTranslation } from 'react-i18next';
import type { ModuleC } from '../../lib/api';
import { AnalyticsCard } from './AnalyticsCard';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';

interface LeverageCardProps {
  data: ModuleC;
}

export function LeverageCard({ data }: LeverageCardProps) {
  const { t } = useTranslation();

  return (
    <AnalyticsCard
      title={t('analytics.leverage.title')}
      borderTop="gold"
    >
      {/* 바 차트 형태 표시 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.buckets.map((bucket) => {
          const pct = Math.round(bucket.liquidationRate * 100);
          const isThreshold = data.thresholdLeverage > 0 &&
            bucket.range.startsWith(`${data.thresholdLeverage}`);
          const barColor = pct > 15 ? T.negative : pct > 5 ? T.warning : T.positive;

          return (
            <div key={bucket.range} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 레버리지 라벨 */}
              <span style={{
                width: 48,
                fontSize: 12,
                fontFamily: T.numberFont,
                color: isThreshold ? T.negative : T.textPrimary,
                fontWeight: isThreshold ? 700 : 400,
              }}>
                {bucket.range}
              </span>

              {/* 바 */}
              <div style={{
                flex: 1,
                height: 16,
                background: T.border,
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                  minWidth: bucket.trades > 0 ? 2 : 0,
                }} />
              </div>

              {/* 수치 */}
              <span style={{
                width: 36,
                textAlign: 'right',
                fontSize: 12,
                fontFamily: T.numberFont,
                color: pct > 15 ? T.negative : T.textMuted,
                fontWeight: pct > 15 ? 700 : 400,
              }}>
                {bucket.trades > 0 ? `${pct}%` : '-'}
              </span>

              {/* 거래 수 */}
              <span style={{
                width: 28,
                textAlign: 'right',
                fontSize: 10,
                fontFamily: T.numberFont,
                color: T.textMuted,
              }}>
                {bucket.trades}
              </span>
            </div>
          );
        })}
      </div>

      {/* 임계점 권고 */}
      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        background: data.thresholdLeverage > 0 ? 'rgba(229, 92, 92, 0.08)' : 'rgba(63, 182, 140, 0.08)',
        border: `1px solid ${data.thresholdLeverage > 0 ? 'rgba(229, 92, 92, 0.2)' : 'rgba(63, 182, 140, 0.2)'}`,
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        color: data.thresholdLeverage > 0 ? T.negative : T.positive,
        fontFamily: T.bodyFont,
      }}>
        {data.recommendationText}
      </div>
    </AnalyticsCard>
  );
}
