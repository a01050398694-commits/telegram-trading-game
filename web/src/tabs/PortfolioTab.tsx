import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, formatUSD, calcPnl } from '../lib/format';
import { getMarket } from '../lib/markets';
import i18n from '../lib/i18n';
import { ShareROIButton } from '../components/ShareROIButton';
import { SharePortfolioButton } from '../components/SharePortfolioButton';
import { PnLChart } from '../components/PnLChart';
import { RechargeCard } from '../components/RechargeCard';
import { OrderHistorySection } from '../components/OrderHistorySection';
import { useBinanceFeed } from '../lib/useBinanceFeed';
import {
  ApiError,
  fetchUserHistory,
  fetchOrderHistory,
  type HistoryEntry,
  type ServerOrder,
  type UserStatus,
} from '../lib/api';

type PortfolioTabProps = {
  telegramUserId: number | null;
  status: UserStatus | null;
};

// Stage 8.10 Luxury Wallet 리디자인.
//   · 싼 티 나는 이전 카드 전부 폐기. Amex/Apple Wallet 레퍼런스.
//   · Hero Equity: font-size 6xl, metallic gradient, glassmorphism shell.
//   · 3-stat 그리드: Balance · Margin · PnL (각 glass cell).
//   · Position/History 섹션 backdrop-blur-xl + border-white/10 통일.
// Stage 15.1 — 무료 시작 자본 $100K → $10K.
const STARTING_SEED = 10_000;

export function PortfolioTab({ telegramUserId, status }: PortfolioTabProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [orderHistory, setOrderHistory] = useState<ServerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (telegramUserId === null) return;
    setLoading(true);
    try {
      const res = await fetchUserHistory(telegramUserId);
      setHistory(res.history);
      setError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [telegramUserId]);

  const loadOrderHistory = useCallback(async () => {
    if (telegramUserId === null) return;
    setOrderLoading(true);
    try {
      const res = await fetchOrderHistory(telegramUserId);
      setOrderHistory(res.orders);
      setOrderError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setOrderError(msg);
    } finally {
      setOrderLoading(false);
    }
  }, [telegramUserId]);

  useEffect(() => {
    void load();
    void loadOrderHistory();
  }, [load, loadOrderHistory]);

  const balance = status?.balance ?? STARTING_SEED;
  const position = status?.position ?? null;
  const totalPnl = history.reduce((sum, h) => sum + h.pnl, 0);

  // Stage 8.16 — 4-stat 그리드에 쓰이는 승률만 잔류. Avg Win/Loss 는 화면 단순화로 제거.
  const totalTrades = history.length;
  const winningCount = history.reduce((n, h) => (h.pnl > 0 ? n + 1 : n), 0);
  const winRate = totalTrades > 0 ? (winningCount / totalTrades) * 100 : 0;

  const live = useLiveFeed(position?.symbol.toLowerCase() ?? 'btcusdt');
  const livePrice = live.price;
  const liveDirection = live.direction;
  const showShare = position !== null;
  const sharePosition = position
    ? {
        symbol: position.symbol,
        side: position.side,
        entryPrice: position.entryPrice,
        size: position.size,
        leverage: position.leverage,
      }
    : null;
  const livePnl =
    position && livePrice !== null
      ? calcPnl(position.side, position.entryPrice, livePrice, position.size, position.leverage)
      : 0;

  const margin = position?.size ?? 0;
  const liveEquity = balance + margin + livePnl;
  const equityDelta = liveEquity - STARTING_SEED;
  const isUp = equityDelta > 0;
  const isDown = equityDelta < 0;
  const deltaColor = isUp ? 'text-[var(--color-accent-long)]' : isDown ? 'text-[var(--color-accent-short)]' : 'text-slate-400';

  // Stage 8.11 — Android fix. background-clip:text 는 안드로이드 크롬에서 불안정해 글자가
  // 통째로 사라지는 버그가 재발. 솔리드 color 로 돌리고, glow 로 럭셔리 질감만 유지한다.
  const equityColor = isUp ? 'text-emerald-300' : isDown ? 'text-rose-300' : 'text-white';
  const equityGlow = ''; // Stage 8.12: Android drop-shadow vanishing bug fix

  return (
    // Stage 15.8 — flex squish fix. flex flex-col + overflow-y-auto 안에서 minHeight 없는
    // 카드 (RechargeCard 등) 가 자식 flex shrink:1 로 압축되며 콘텐츠가 카드 밖 overflow 됨.
    // block + space-y-4 로 자식 자연 height 보장. 콘텐츠 넘치면 그제서야 스크롤.
    <div
      className="h-full space-y-4 overflow-y-auto overscroll-contain px-3 pt-2"
      style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ── MASSIVE HERO TEXT (CARDLESS) ──────────────────
          Stage 8.16 — 박스/카드/border/backdrop-blur/그라디언트 전면 파기.
          안드로이드 WebView 의 카드 렌더링 버그(높이 collapse, 하단 증발)를 원천 차단하려면
          컨테이너 자체를 없애는 것이 가장 안전. 텍스트 하나만 화면 상단 정중앙에 전면 배치. */}
      <div className="mt-3 flex flex-col items-center justify-center pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-slate-400">
            {t('portfolio.totalEquity')}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              status?.isLiquidated
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {status?.isLiquidated ? t('portfolio.liquidated') : t('portfolio.active')}
          </span>
        </div>

        {/* 거대한 5xl 폰트. break-all 은 긴 금액도 자연 줄바꿈 → 어떤 자리수에도 무조건 대응. */}
        <div
          className={`mt-3 break-all text-center font-mono text-5xl font-black tracking-tighter ${equityColor} ${equityGlow}`}
        >
          {formatMoney(liveEquity)}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className={`font-mono text-sm font-bold tabular-nums ${deltaColor}`}>
            {equityDelta >= 0 ? '+' : ''}
            {formatMoney(equityDelta)}
          </span>
          <span className="font-mono text-xs text-white/40">
            ({((equityDelta / STARTING_SEED) * 100).toFixed(2)}%)
          </span>
        </div>

        <div className="mt-4 flex w-full flex-col items-center gap-3">
          {status?.isLiquidated && (
            <div className="w-full">
              <RechargeCard
                telegramUserId={telegramUserId}
                onPaid={() => { void load(); }}
                variant="liquidated"
              />
            </div>
          )}
          <SharePortfolioButton equity={liveEquity} winRate={winRate} totalTrades={totalTrades} telegramUserId={status?.telegramUserId} />
        </div>
      </div>

      {/* ── ESSENTIAL STATS GRID ──────────────────────────
          Stage 8.16 — Cash · Margin · Win Rate · Total PnL 4지표 2x2 통합. */}
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="Cash" value={formatMoney(balance)} />
        <StatCell label="Margin" value={formatMoney(margin)} />
        <StatCell
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          valueClass={
            winRate >= 50
              ? 'text-emerald-300'
              : winRate > 0
                ? 'text-amber-300'
                : 'text-slate-400'
          }
        />
        <StatCell
          label="Total PnL"
          value={formatMoney(totalPnl)}
          valueClass={
            totalPnl > 0
              ? 'text-emerald-300'
              : totalPnl < 0
                ? 'text-rose-300'
                : 'text-slate-400'
          }
        />
      </div>

      {/* ── 7-DAY PNL CHART ───────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/[0.03] p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between pb-4">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
            7-Day Performance
          </span>
        </div>
        <PnLChart data={status?.history ?? []} />
      </div>

      {/* ── OPEN POSITION ─────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            {t('portfolio.openPosition')}
          </span>
          {showShare && sharePosition && (
            <ShareROIButton position={sharePosition} markPrice={livePrice} telegramUserId={status?.telegramUserId} />
          )}
        </div>
        {position ? (
          <OpenPositionRow
            pos={position}
            livePnl={livePnl}
            livePrice={livePrice}
            direction={liveDirection}
          />
        ) : (
          <div className="py-5 text-center text-[11px] text-slate-500">{t('portfolio.noOpen')}</div>
        )}
      </div>

      {/* ── RECHARGE CARD (평소 노출 — 청산 무관 충전 진입점) ── */}
      {!status?.isLiquidated && (
        <RechargeCard
          telegramUserId={telegramUserId}
          onPaid={() => { void load(); }}
          variant="idle"
        />
      )}

      {/* ── ORDER HISTORY ────────────────────────────── */}
      <OrderHistorySection
        orders={orderHistory}
        loading={orderLoading}
        error={orderError}
      />

      {/* ── TRADE HISTORY ─────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
            {t('portfolio.history')}
          </span>
        </div>
        <div className="mb-2">
          {loading && <span className="text-[10px] text-slate-500">{t('common.loading')}</span>}
        </div>
        {error && (
          <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
            {error}
          </div>
        )}
        {history.length === 0 && !loading && (
          <div className="py-6 text-center text-[11px] text-slate-500">
            {t('portfolio.empty')}
          </div>
        )}
        <div className="flex flex-col divide-y divide-white/5">
          {history.map((h) => (
            <HistoryRow key={h.id} row={h} />
          ))}
        </div>
      </div>

    </div>
  );
}

// Stage 8.10 — glass stat cell. Amex Black Card 하단 stat row 레퍼런스.
function StatCell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</div>
      <div
        className={`mt-0.5 font-mono text-[13px] font-bold tabular-nums ${valueClass ?? 'text-white'}`}
      >
        {value}
      </div>
    </div>
  );
}

// Stage 15.9 — 포지션 행 디자인 업그레이드. Mark Price 큰 글씨 + 매 tick 색깔/화살표
// 변동(▲▼) 으로 사용자가 가격 라이브 인지. Entry/PnL/Mark 3계층 정보 구조.
function OpenPositionRow({
  pos,
  livePnl,
  livePrice,
  direction,
}: {
  pos: NonNullable<UserStatus['position']>;
  livePnl: number;
  livePrice: number | null;
  direction: 'up' | 'down' | 'idle';
}) {
  const m = getMarket(pos.symbol);
  const sideColor = pos.side === 'long' ? 'text-[var(--color-accent-long)]' : 'text-[var(--color-accent-short)]';
  const pnlColor =
    livePnl > 0 ? 'text-[var(--color-accent-long)]' : livePnl < 0 ? 'text-[var(--color-accent-short)]' : 'text-slate-400';
  const markColor =
    direction === 'up' ? 'text-[var(--color-accent-long)]' : direction === 'down' ? 'text-[var(--color-accent-short)]' : 'text-white';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '';

  return (
    <div className="space-y-3">
      {/* ── 상단: 심볼 + side · leverage ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-800/80 text-sm ${m.color}`}
          >
            {m.icon}
          </span>
          <div className="leading-tight">
            <div className="font-mono text-sm font-bold text-white">{m.display}</div>
            <div className={`text-[10px] font-bold uppercase tracking-wider ${sideColor}`}>
              {pos.side} · {pos.leverage}x
            </div>
          </div>
        </div>
        <div className="font-mono text-[11px] font-bold tabular-nums text-white/50">
          Entry ${formatUSD(pos.entryPrice)}
        </div>
      </div>

      {/* ── Mark Price 라이브 — 큰 폰트, 매 tick 색깔 깜빡 ── */}
      <div className="flex items-baseline justify-between border-y border-white/5 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">{i18n.t('trade.markPrice')}</span>
        </div>
        <div
          className={`font-mono text-2xl font-black tabular-nums leading-none transition-colors duration-150 ${markColor}`}
        >
          ${livePrice !== null ? formatUSD(livePrice) : '--'}
          {arrow && <span className="ml-1.5 text-base">{arrow}</span>}
        </div>
      </div>

      {/* ── PnL ── */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">{i18n.t('trade.pnl')}</span>
        <div className={`font-mono text-base font-black tabular-nums ${pnlColor}`}>
          {livePnl > 0 ? '+' : ''}
          {formatMoney(livePnl)}
        </div>
      </div>
    </div>
  );
}

// Stage 15.9 — 포트폴리오 탭 전용 라이브 feed (price + direction). direction 으로 OpenPositionRow
// 의 mark price 화살표/색상 깜빡 효과 구동.
function useLiveFeed(symbol: string) {
  const feed = useBinanceFeed(symbol, '1m');
  return { price: feed.price, direction: feed.direction };
}

function HistoryRow({ row }: { row: HistoryEntry }) {
  const m = getMarket(row.symbol);
  const pnlColor =
    row.pnl > 0 ? 'text-[var(--color-accent-long)]' : row.pnl < 0 ? 'text-[var(--color-accent-short)]' : 'text-slate-400';
  const statusLabel = row.status === 'liquidated' ? '🔴 LIQ' : '✓ CLOSE';
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/5 bg-slate-800/60 text-[11px] ${m.color}`}
        >
          {m.icon}
        </span>
        <div className="leading-tight">
          <div className="font-mono text-[11px] font-bold text-slate-100">
            {m.ticker} · {row.side.toUpperCase()} {row.leverage}x
          </div>
          <div className="text-[9px] text-slate-500">
            {statusLabel} · {row.closedAt ? new Date(row.closedAt).toLocaleString() : '-'}
          </div>
        </div>
      </div>
      <div className={`font-mono text-[12px] font-bold tabular-nums ${pnlColor}`}>
        {row.pnl > 0 ? '+' : ''}
        {formatMoney(row.pnl)}
      </div>
    </div>
  );
}
