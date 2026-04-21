import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Direction, Stats24h } from '../lib/useBinanceFeed';
import { formatUSD } from '../lib/format';
import { getMarket } from '../lib/markets';
import { SettingsModal } from './SettingsModal';
import { hapticSelection } from '../utils/telegram';

type HeaderProps = {
  symbol: string;
  price: number | null;
  direction: Direction;
  status: 'loading' | 'live' | 'error';
  stats24h: Stats24h | null;
  user: TelegramWebAppUser | null;
  isInsideTelegram: boolean;
};

// 거래소 스타일 top bar: 심볼 · 실시간 가격 · 24h 변화율 · 연결 상태 · 설정(⚙️).
// Stage 8.0: 모든 라벨은 i18n 키로 치환, 우측 상단에 설정 모달 트리거 추가.
export function Header({
  symbol,
  price,
  direction,
  status,
  stats24h,
  user,
  isInsideTelegram,
}: HeaderProps) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const STATUS_LABEL: Record<'loading' | 'live' | 'error', string> = {
    loading: t('header.connecting'),
    live: t('header.live'),
    error: t('header.reconnecting'),
  };

  const STATUS_DOT = {
    loading: 'bg-amber-400',
    live: 'bg-emerald-400 animate-pulse',
    error: 'bg-rose-500',
  } as const;

  const market = getMarket(symbol);
  const displaySymbol = market.display;
  const userLabel = user
    ? user.username
      ? `@${user.username}`
      : user.first_name
    : null;
  const change = stats24h?.priceChangePercent ?? 0;
  const changeColor =
    change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-slate-400';
  const priceColor =
    direction === 'up'
      ? 'text-emerald-400'
      : direction === 'down'
        ? 'text-rose-400'
        : 'text-white';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '';

  return (
    <header className="rounded-xl border border-white/5 bg-slate-900/80 px-3 py-2.5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${market.color}`}>
            {market.icon}
          </span>
          <div className="leading-tight">
            <div className="font-mono text-sm font-black tracking-tight text-white">
              {displaySymbol}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
              {t('header.perpetual')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userLabel ? (
            <span className="max-w-[96px] truncate rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
              {userLabel}
            </span>
          ) : !isInsideTelegram ? (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              {t('header.dev')}
            </span>
          ) : null}
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              {STATUS_LABEL[status]}
            </span>
          </div>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => {
              hapticSelection();
              setSettingsOpen(true);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white active:scale-90"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <div
          className={`font-mono text-2xl font-black tabular-nums tracking-tight transition-colors duration-200 ${priceColor}`}
        >
          ${price !== null ? formatUSD(price) : '--'}
          {arrow && <span className="ml-1.5 text-base">{arrow}</span>}
        </div>
        <div className={`text-right font-mono text-xs font-bold tabular-nums ${changeColor}`}>
          {stats24h ? (
            <>
              <span>
                {change > 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
              <span className="ml-1 text-[10px] font-bold text-white/30">24h</span>
            </>
          ) : (
            <span className="text-white/30">—</span>
          )}
        </div>
      </div>

      {stats24h && (
        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 font-mono text-[10px] font-semibold tabular-nums text-white/30">
          <span>
            {t('header.high')} <span className="text-white/60">${formatUSD(stats24h.high)}</span>
          </span>
          <span>
            {t('header.low')} <span className="text-white/60">${formatUSD(stats24h.low)}</span>
          </span>
          <span>
            {t('header.volume')} <span className="text-white/60">{(stats24h.volume / 1000).toFixed(1)}K {market.ticker}</span>
          </span>
        </div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
