/**
 * Stage 15.2 — 모듈 D: 거래 행동 패턴 카드 (Premium 잠금).
 * Revenge Trading 감지 + 매매 잠금 모드 토글.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleD } from '../../lib/api';
import { toggleLockMode } from '../../lib/api';
import { AnalyticsCard, StatRow } from './AnalyticsCard';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';

interface BehaviorCardProps {
  data: ModuleD;
  telegramUserId: number | null;
}

export function BehaviorCard({ data, telegramUserId }: BehaviorCardProps) {
  const { t } = useTranslation();
  const [lockEnabled, setLockEnabled] = useState(data.lockModeEnabled);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    if (!telegramUserId || toggling) return;
    setToggling(true);
    try {
      const result = await toggleLockMode(telegramUserId, !lockEnabled);
      setLockEnabled(result.lockModeEnabled);
    } catch (err) {
      console.error('[BehaviorCard] toggle error:', err);
    } finally {
      setToggling(false);
    }
  };

  const CompareCol = ({ label, d, color }: { label: string; d: typeof data.afterWin; color: string }) => (
    <div style={{ background: `${color}08`, border: `1px solid ${color}26`, borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>{t('analytics.behavior.avgSize')}</div>
      <div style={{ fontSize: 14, fontFamily: T.numberFont, color: T.textPrimary, fontWeight: 600, marginBottom: 6 }}>${d.avgSizeUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>{t('analytics.behavior.avgLev')}</div>
      <div style={{ fontSize: 14, fontFamily: T.numberFont, color: T.textPrimary, fontWeight: 600, marginBottom: 6 }}>{d.avgLeverage.toFixed(1)}x</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>{t('analytics.behavior.nextWinRate')}</div>
      <div style={{ fontSize: 14, fontFamily: T.numberFont, color, fontWeight: 600 }}>{Math.round(d.nextWinRate * 100)}%</div>
    </div>
  );

  return (
    <AnalyticsCard title={t('analytics.behavior.title')} borderTop="gold">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <CompareCol label={t('analytics.behavior.afterWin')} d={data.afterWin} color={T.positive} />
        <CompareCol label={t('analytics.behavior.afterLoss')} d={data.afterLoss} color={T.negative} />
      </div>
      <StatRow label={t('analytics.behavior.sizeChange')} value={`${data.sizeIncreasePct >= 0 ? '+' : ''}${data.sizeIncreasePct}%`} tone={data.warning ? 'negative' : 'default'} />
      {data.warning && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(229,92,92,0.08)', border: '1px solid rgba(229,92,92,0.2)', borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: T.negative }}>{t('analytics.behavior.revengeWarning')}</div>
      )}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: lockEnabled ? 'rgba(229,160,48,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${lockEnabled ? 'rgba(229,160,48,0.2)' : T.border}`, borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{t('analytics.behavior.lockMode')}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{t('analytics.behavior.lockModeDesc')}</div>
        </div>
        <button type="button" onClick={() => void handleToggle()} disabled={toggling} style={{ width: 48, height: 26, borderRadius: 13, border: 'none', background: lockEnabled ? T.warning : T.border, cursor: toggling ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: lockEnabled ? 25 : 3, transition: 'left 0.2s' }} />
        </button>
      </div>
    </AnalyticsCard>
  );
}
