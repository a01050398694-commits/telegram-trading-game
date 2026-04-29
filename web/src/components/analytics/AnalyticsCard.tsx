/**
 * Stage 15.2 — 공통 분석 카드 프레임.
 * Bloomberg Terminal 톤: 이모지 금지, 모노스페이스 숫자, 짙은 금색 헤더.
 */
import type { ReactNode } from 'react';
import { ANALYTICS_TOKENS as T } from '../../styles/tokens';

interface AnalyticsCardProps {
  title: string;
  subtitle?: string;
  /** 상단 테두리 색상 — 'gold' 이면 짙은 금색 */
  borderTop?: 'gold' | 'default';
  children: ReactNode;
  footer?: ReactNode;
}

export function AnalyticsCard({ title, subtitle, borderTop = 'default', children, footer }: AnalyticsCardProps) {
  return (
    <div
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderTop: borderTop === 'gold' ? `2px solid ${T.borderAccent}` : `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: T.bodyFont,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, letterSpacing: '0.02em' }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 11, color: T.textMuted, fontFamily: T.numberFont }}>
            {subtitle}
          </span>
        )}
      </div>

      {/* 구분선 */}
      <div style={{ height: 1, background: T.border, marginBottom: 12 }} />

      {/* 내용 */}
      <div>{children}</div>

      {/* 푸터 */}
      {footer && (
        <>
          <div style={{ height: 1, background: T.border, marginTop: 12, marginBottom: 8 }} />
          <div style={{ fontSize: 10, color: T.textMuted, fontFamily: T.numberFont }}>
            {footer}
          </div>
        </>
      )}
    </div>
  );
}

/** 지표 한 줄 — label: value 레이아웃 */
export function StatRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'positive' | 'negative' | 'warning' | 'default';
}) {
  const colorMap = {
    positive: T.positive,
    negative: T.negative,
    warning: T.warning,
    default: T.textPrimary,
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '4px 0',
    }}>
      <span style={{ fontSize: 13, color: T.textMuted }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: T.numberFont,
          color: colorMap[tone ?? 'default'],
        }}>
          {value}
        </span>
        {hint && (
          <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.numberFont }}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
