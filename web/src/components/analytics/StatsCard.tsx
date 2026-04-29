/**
 * Stage 15.2 — 모듈 A: 매매 통계 카드 (무료).
 * 누적 손익, 승률, 손익비, 최대 연패, 청산 횟수, 평균 보유시간.
 */
import { useTranslation } from 'react-i18next';
import type { ModuleA } from '../../lib/api';
import { AnalyticsCard, StatRow } from './AnalyticsCard';

interface StatsCardProps {
  stats: ModuleA;
  totalTrades: number;
  windowDays: number;
}

export function StatsCard({ stats, totalTrades, windowDays }: StatsCardProps) {
  const { t } = useTranslation();

  if (totalTrades === 0) {
    return (
      <AnalyticsCard title={t('analytics.stats.title')} subtitle={t('analytics.stats.subtitle', { days: windowDays })} borderTop="gold">
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#737373', fontSize: 13 }}>
          {t('analytics.noTrades')}
        </div>
      </AnalyticsCard>
    );
  }

  const pnlSign = stats.pnlUsd >= 0 ? '+' : '';
  const winPct = Math.round(stats.winRate * 100);
  const totalWins = Math.round(stats.winRate * totalTrades);

  // 평균 보유시간 포맷팅
  const formatHoldTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <AnalyticsCard
      title={t('analytics.stats.title')}
      subtitle={t('analytics.stats.subtitle', { days: windowDays })}
      borderTop="gold"
      footer={t('analytics.stats.footer', { days: windowDays, trades: totalTrades })}
    >
      <StatRow
        label={t('analytics.stats.totalPnl')}
        value={`${pnlSign}$${Math.abs(stats.pnlUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        tone={stats.pnlUsd >= 0 ? 'positive' : 'negative'}
      />
      <StatRow
        label={t('analytics.stats.winRate')}
        value={`${winPct}%`}
        hint={`(${totalWins}W / ${totalTrades}T)`}
      />
      <StatRow
        label={t('analytics.stats.rrRatio')}
        value={stats.rrRatio > 0 ? `1 : ${stats.rrRatio.toFixed(1)}` : 'N/A'}
      />
      <StatRow
        label={t('analytics.stats.maxLossStreak')}
        value={`${stats.maxLossStreak}`}
        tone={stats.maxLossStreak >= 5 ? 'warning' : 'default'}
      />
      <StatRow
        label={t('analytics.stats.liquidations')}
        value={`${stats.liquidations}`}
        tone={stats.liquidations > 0 ? 'negative' : 'default'}
      />
      <StatRow
        label={t('analytics.stats.avgHoldTime')}
        value={formatHoldTime(stats.avgHoldMinutes)}
      />
    </AnalyticsCard>
  );
}
