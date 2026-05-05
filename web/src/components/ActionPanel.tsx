import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatMoney,
  formatUSD,
  liquidationPrice,
  distanceToLiquidation,
  calcPnl,
} from '../lib/format';
import type { Direction } from '../lib/useBinanceFeed';
import { hapticImpact, hapticSelection } from '../utils/telegram';
import { OrderTypeTabs } from './OrderTypeTabs';
import { LimitPriceInput } from './LimitPriceInput';
import { SlTpInputs } from './SlTpInputs';
import { PartialCloseControls } from './PartialCloseControls';

export type Side = 'long' | 'short';

export type Position = {
  side: Side;
  entryPrice: number;
  size: number;
  leverage: number;
};

type ActionPanelProps = {
  position: Position | null;
  markPrice: number | null;
  // Stage 15.9 — 라이브 mark price 변동 색깔/화살표용. ws tick 마다 up/down/idle 전환.
  direction?: Direction;
  balance: number;
  pending?: boolean;
  errorMessage?: string | null;
  disabled?: boolean;
  orderType?: 'market' | 'limit' | 'stop';
  onOrderTypeChange?: (type: 'market' | 'limit' | 'stop') => void;
  limitPrice?: number | null;
  onLimitPriceChange?: (price: number | null) => void;
  slPrice?: number | null;
  tpPrice?: number | null;
  onSlTpChange?: (args: { slPrice?: number | null; tpPrice?: number | null }) => void;
  onOpen: (args: {
    side: Side;
    size: number;
    leverage: number;
    orderType?: 'market' | 'limit';
    limitPrice?: number;
    slPrice?: number | null;
    tpPrice?: number | null;
  }) => void;
  onClose: () => void;
  onClosePartial?: (pct: 25 | 50 | 75 | 100) => void;
};

const LEVERAGE_PRESETS = [1, 5, 10, 25, 50, 100, 125] as const;
const SIZE_PRESETS = [25, 50, 75, 100] as const;

// 프로급 주문 패널. 포지션 존재 시 CLOSE 전용, 없으면 풀 주문 인터페이스.
// 레버리지/사이즈 선택 → 양방향 청산가 프리뷰 → LONG/SHORT 원클릭.
// Stage 17: Limit Order + SL/TP 옵션 추가.
export function ActionPanel({
  position,
  markPrice,
  direction = 'idle',
  balance,
  pending = false,
  errorMessage = null,
  disabled = false,
  orderType = 'market',
  onOrderTypeChange,
  limitPrice = null,
  onLimitPriceChange,
  slPrice = null,
  tpPrice = null,
  onSlTpChange,
  onOpen,
  onClose,
  onClosePartial,
}: ActionPanelProps) {
  const { t } = useTranslation();
  const [leverage, setLeverage] = useState(10);
  const [sizePct, setSizePct] = useState(10);

  const size = Math.floor((balance * sizePct) / 100);
  const leverageColor =
    leverage >= 100
      ? 'text-rose-400'
      : leverage >= 50
        ? 'text-orange-400'
        : leverage >= 20
          ? 'text-amber-400'
          : 'text-emerald-400';

  if (position && markPrice !== null) {
    const liq = liquidationPrice(position.side, position.entryPrice, position.leverage);
    const dist = distanceToLiquidation(position.side, markPrice, liq);
    const pnl = calcPnl(
      position.side,
      position.entryPrice,
      markPrice,
      position.size,
      position.leverage,
    );
    const pnlPct = (pnl / position.size) * 100;
    const pnlColor = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-400' : 'text-slate-300';
    const sideBg =
      position.side === 'long'
        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
        : 'bg-rose-500/15 border-rose-500/40 text-rose-400';
    const dangerClass =
      dist < 5 ? 'text-rose-400' : dist < 15 ? 'text-amber-400' : 'text-slate-300';

    // Stage 15.9 — 포지션 카드 디자인 업그레이드 + 라이브 Mark Price 표시.
    // 사용자가 가격 변동을 즉시 인지하도록 큰 글씨 + 변동 색깔 (▲▼) + LIVE pulse dot.
    const markColor =
      direction === 'up'
        ? 'text-emerald-400'
        : direction === 'down'
          ? 'text-rose-400'
          : 'text-white';
    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '';

    return (
      <div className="w-full space-y-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-3.5 shadow-lg shadow-black/30">
          {/* ── 헤더: side badge + Entry ── */}
          <div className="flex items-center justify-between">
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-black uppercase tracking-widest ${sideBg}`}
            >
              {position.side} · {position.leverage}x
            </span>
            <span className="font-mono text-[11px] font-bold tabular-nums text-white/50">
              Entry ${formatUSD(position.entryPrice)}
            </span>
          </div>

          {/* ── Mark Price 라이브 — 가장 큰 글씨, 매 tick 마다 색깔 깜빡 ── */}
          <div className="mt-3 flex items-baseline justify-between border-y border-white/5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
                {t('trade.markPrice')}
              </span>
            </div>
            <div
              className={`font-mono text-2xl font-black tabular-nums leading-none transition-colors duration-150 ${markColor}`}
            >
              ${formatUSD(markPrice)}
              {arrow && <span className="ml-1.5 text-base">{arrow}</span>}
            </div>
          </div>

          {/* ── PnL + Liq Price 그리드 ── */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">{t('trade.pnl')}</div>
              <div className={`font-mono text-base font-black tabular-nums ${pnlColor}`}>
                {pnl > 0 ? '+' : ''}
                {formatMoney(pnl)}
              </div>
              <div className={`font-mono text-[10px] font-bold tabular-nums ${pnlColor}`}>
                {pnl > 0 ? '+' : ''}
                {pnlPct.toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">{t('trade.liq')}</div>
              <div className="font-mono text-base font-black tabular-nums text-white">
                ${formatUSD(liq)}
              </div>
              <div className={`font-mono text-[10px] font-bold tabular-nums ${dangerClass}`}>
                {dist.toFixed(2)}% away
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-white/5 pt-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
            <span>{t('trade.margin')} </span>
            <span className="font-mono text-white/60 tabular-nums normal-case">{formatMoney(position.size)}</span>
            <span> · {t('trade.notional')} </span>
            <span className="font-mono text-white/60 tabular-nums normal-case">{formatMoney(position.size * position.leverage)}</span>
          </div>
        </div>

        {/* Stage 17 — Partial Close Controls */}
        {onClosePartial && (
          <PartialCloseControls
            positionSize={position.size}
            balance={balance}
            onClose={onClosePartial}
            pending={pending}
            error={null}
          />
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            hapticImpact('medium');
            onClose();
          }}
          className="relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-600 to-slate-800 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),_0_4px_14px_rgba(0,0,0,0.45)] transition-all duration-100 hover:brightness-110 active:scale-[0.97] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:cursor-wait disabled:from-slate-700/60 disabled:to-slate-800/60"
        >
          <span className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/15 to-transparent" />
          <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
            {pending ? t('trade.closingEllipsis') : t('trade.closePosition')}
          </span>
        </button>
        {errorMessage && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  const longLiq =
    markPrice !== null ? liquidationPrice('long', markPrice, leverage) : null;
  const shortLiq =
    markPrice !== null ? liquidationPrice('short', markPrice, leverage) : null;
  const isLoadingPrice = markPrice === null;
  const canOpen = markPrice !== null && size > 0 && balance > 0 && !pending && !disabled && (orderType === 'market' || limitPrice !== null);

  return (
    <div className="w-full space-y-2">
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-3">
        {/* Stage 17: Order Type Tabs */}
        {onOrderTypeChange && (
          <OrderTypeTabs
            activeType={orderType}
            onChange={onOrderTypeChange}
          />
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            {t('trade.leverage')}
          </span>
          <span className={`font-mono text-lg font-black tabular-nums ${leverageColor}`}>{leverage}x</span>
        </div>

        <input
          type="range"
          min={1}
          max={125}
          step={1}
          value={leverage}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (next !== leverage) hapticSelection();
            setLeverage(next);
          }}
          className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-amber-400"
          style={{
            background: `linear-gradient(to right, rgb(251 191 36) 0%, rgb(251 191 36) ${
              ((leverage - 1) / 124) * 100
            }%, rgb(30 41 59) ${((leverage - 1) / 124) * 100}%, rgb(30 41 59) 100%)`,
          }}
        />

        <div className="mt-2 grid grid-cols-7 gap-1">
          {LEVERAGE_PRESETS.map((lev) => (
            <button
              key={lev}
              type="button"
              onClick={() => {
                if (lev !== leverage) hapticSelection();
                setLeverage(lev);
              }}
              className={`rounded-md py-1 text-[10px] font-bold transition-colors ${
                leverage === lev
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
            {t('trade.margin')}
          </span>
          <span className="font-mono text-sm font-black tabular-nums text-white">{formatMoney(size)}</span>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1">
          {SIZE_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                if (pct !== sizePct) hapticSelection();
                setSizePct(pct);
              }}
              className={`rounded-md py-1.5 text-[11px] font-bold transition-colors ${
                sizePct === pct
                  ? 'bg-white/10 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {pct === 100 ? 'MAX' : `${pct}%`}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/30">
          <span>{t('trade.notional')}</span>
          <span className="font-mono tabular-nums text-white/60">
            {formatMoney(size * leverage)}
          </span>
        </div>

        {/* Stage 17: Limit Price Input (conditional) */}
        {orderType === 'limit' && onLimitPriceChange && (
          <LimitPriceInput
            value={limitPrice}
            onChange={onLimitPriceChange}
            markPrice={markPrice}
          />
        )}

        {/* Stage 17: SL/TP Inputs (always available) */}
        {onSlTpChange && (
          <SlTpInputs
            slPrice={slPrice}
            tpPrice={tpPrice}
            onSlTpChange={onSlTpChange}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => {
            hapticImpact('heavy');
            onOpen({
              side: 'long',
              size,
              leverage,
              orderType: orderType === 'stop' ? undefined : orderType,
              limitPrice: orderType === 'limit' ? limitPrice ?? undefined : undefined,
              slPrice,
              tpPrice,
            });
          }}
          className="group relative flex flex-col items-stretch overflow-hidden rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-3 py-3 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),_inset_0_-1px_1px_rgba(0,0,0,0.25),_0_6px_18px_rgba(16,185,129,0.4)] transition-all duration-100 hover:brightness-110 active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),_0_1px_2px_rgba(16,185,129,0.2)] disabled:cursor-not-allowed disabled:from-emerald-700/40 disabled:to-emerald-800/40 disabled:shadow-none"
        >
          {/* 상단 specular 광택 — 물리 버튼 하이라이트 */}
          <span className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/25 to-transparent" />
          <span className="relative text-[11px] font-black uppercase tracking-widest text-white/85">
            Long / Buy
          </span>
          <span className="relative mt-0.5 font-mono text-xl font-black leading-none tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
            {pending ? 'Submitting...' : isLoadingPrice ? 'Loading...' : '↗ LONG'}
          </span>
          <span className="relative mt-2 font-mono text-[10px] font-semibold text-white/70">
            {t('trade.liq')} ${longLiq !== null ? formatUSD(longLiq) : '--'}
          </span>
        </button>

        <button
          type="button"
          disabled={!canOpen}
          onClick={() => {
            hapticImpact('heavy');
            onOpen({
              side: 'short',
              size,
              leverage,
              orderType: orderType === 'stop' ? undefined : orderType,
              limitPrice: orderType === 'limit' ? limitPrice ?? undefined : undefined,
              slPrice,
              tpPrice,
            });
          }}
          className="group relative flex flex-col items-stretch overflow-hidden rounded-xl bg-gradient-to-b from-rose-400 to-rose-600 px-3 py-3 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),_inset_0_-1px_1px_rgba(0,0,0,0.25),_0_6px_18px_rgba(244,63,94,0.4)] transition-all duration-100 hover:brightness-110 active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),_0_1px_2px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:from-rose-700/40 disabled:to-rose-800/40 disabled:shadow-none"
        >
          <span className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/25 to-transparent" />
          <span className="relative text-[11px] font-black uppercase tracking-widest text-white/85">
            Short / Sell
          </span>
          <span className="relative mt-0.5 font-mono text-xl font-black leading-none tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
            {pending ? 'Submitting...' : isLoadingPrice ? 'Loading...' : '↘ SHORT'}
          </span>
          <span className="relative mt-2 font-mono text-[10px] font-semibold text-white/70">
            {t('trade.liq')} ${shortLiq !== null ? formatUSD(shortLiq) : '--'}
          </span>
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
