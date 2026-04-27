import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openTelegramLinkSafe } from '../utils/telegram';
import { formatMoney, formatUSD, calcPnl } from '../lib/format';
import { getMarket } from '../lib/markets';
import { ShareROIButton } from '../components/ShareROIButton';
import { SharePortfolioButton } from '../components/SharePortfolioButton';
import { PnLChart } from '../components/PnLChart';
import { useBinanceFeed } from '../lib/useBinanceFeed';
import {
  ApiError,
  fetchUserHistory,
  requestStarsInvoice,
  type HistoryEntry,
  type UserStatus,
} from '../lib/api';
import { hapticNotification } from '../utils/telegram';

type PortfolioTabProps = {
  telegramUserId: number | null;
  status: UserStatus | null;
};

// Stage 8.10 Luxury Wallet 리디자인.
//   · 싼 티 나는 이전 카드 전부 폐기. Amex/Apple Wallet 레퍼런스.
//   · Hero Equity: font-size 6xl, metallic gradient, glassmorphism shell.
//   · 3-stat 그리드: Balance · Margin · PnL (각 glass cell).
//   · Position/History 섹션 backdrop-blur-xl + border-white/10 통일.
const STARTING_SEED = 100_000;

export function PortfolioTab({ telegramUserId, status }: PortfolioTabProps) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralToast, setReferralToast] = useState(false);
  const [starsPending, setStarsPending] = useState(false);
  const [starsError, setStarsError] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  const balance = status?.balance ?? STARTING_SEED;
  const position = status?.position ?? null;
  const totalPnl = history.reduce((sum, h) => sum + h.pnl, 0);

  // Stage 8.16 — 4-stat 그리드에 쓰이는 승률만 잔류. Avg Win/Loss 는 화면 단순화로 제거.
  const totalTrades = history.length;
  const winningCount = history.reduce((n, h) => (h.pnl > 0 ? n + 1 : n), 0);
  const winRate = totalTrades > 0 ? (winningCount / totalTrades) * 100 : 0;

  const livePrice = useLivePrice(position?.symbol.toLowerCase() ?? 'btcusdt');
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
  const deltaColor = isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400';

  // Stage 8.11 — Android fix. background-clip:text 는 안드로이드 크롬에서 불안정해 글자가
  // 통째로 사라지는 버그가 재발. 솔리드 color 로 돌리고, glow 로 럭셔리 질감만 유지한다.
  const equityColor = isUp ? 'text-emerald-300' : isDown ? 'text-rose-300' : 'text-white';
  const equityGlow = ''; // Stage 8.12: Android drop-shadow vanishing bug fix

  const handleReferralCopy = () => {
    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'Tradergames_bot';
    const url = `https://t.me/${botUsername}?start=${telegramUserId ?? 'demo'}`;
    // Stage 8.13 — clipboard API 가 거부되는 일부 Android WebView 대비 textarea fallback.
    void navigator.clipboard?.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    });
    setReferralToast(true);
    window.setTimeout(() => setReferralToast(false), 1800);
  };

  // Stage 14.2 — 네이티브 텔레그램 결제창 복구. handleRecharge 동일 패턴.
  const handleRecharge = async () => {
    if (telegramUserId === null) return;
    setStarsError(null);
    setStarsPending(true);
    try {
      const { invoiceLink } = await requestStarsInvoice(telegramUserId, 'reset');
      const openInvoice = window.Telegram?.WebApp?.openInvoice;
      if (openInvoice) {
        openInvoice(invoiceLink, (status) => {
          if (status === 'paid') {
            void load();
            hapticNotification('success');
          }
          setStarsPending(false);
        });
      } else {
        const fallbackUrl = import.meta.env.VITE_INVITEMEMBER_BOT_URL;
        if (fallbackUrl) openTelegramLinkSafe(fallbackUrl);
        setStarsPending(false);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setStarsError(msg);
      hapticNotification('error');
      setStarsPending(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 pb-[150px]">
      {/* ── REFERRAL CTA ────────────────────────────────
          Stage 8.16 — 안드로이드 CSS 버그(overflow-hidden + shadow 등 결합 시 높이 찌그러짐)를 원천 차단하기 위해
          overflow-hidden 과 복잡한 box-shadow 제거. 둥근 테두리 및 단색 위주로 단순화. */}
      <button
        type="button"
        onClick={handleReferralCopy}
        className="relative mt-2 flex w-full items-center justify-between rounded-2xl border border-indigo-400/40 bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 px-4 py-3 transition-transform active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl shrink-0">🎁</span>
          <div className="text-left min-w-0">
            <div className="text-[12px] font-bold text-white break-words">
              {t('portfolio.referralTitle')}
            </div>
            <div className="text-[10px] text-indigo-200 mt-0.5">
              {t('portfolio.referralSub')}
            </div>
          </div>
        </div>
        <span className="text-indigo-300 shrink-0 ml-2">→</span>
      </button>

      {/* ── MASSIVE HERO TEXT (CARDLESS) ──────────────────
          Stage 8.16 — 박스/카드/border/backdrop-blur/그라디언트 전면 파기.
          안드로이드 WebView 의 카드 렌더링 버그(높이 collapse, 하단 증발)를 원천 차단하려면
          컨테이너 자체를 없애는 것이 가장 안전. 텍스트 하나만 화면 상단 정중앙에 전면 배치. */}
      <div className="mt-8 flex flex-col items-center justify-center pb-6">
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
              <button
                type="button"
                disabled={starsPending}
                onClick={handleRecharge}
                className="w-full rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-3.5 text-slate-900 shadow-lg shadow-amber-500/20 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">
                  {t('liquidation.resetCta')}
                </div>
                <div className="mt-0.5 text-lg font-extrabold">
                  {starsPending ? t('common.loading') : `150 ⭐`}
                </div>
              </button>
              {starsError && (
                <div className="mt-2 rounded-lg border border-rose-500/50 bg-rose-950/80 px-3 py-2 text-center text-[11px] font-medium text-rose-200">
                  {starsError}
                </div>
              )}
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
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
          <OpenPositionRow pos={position} livePnl={livePnl} />
        ) : (
          <div className="py-5 text-center text-[11px] text-slate-500">{t('portfolio.noOpen')}</div>
        )}
      </div>

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

      {/* Stage 8.9 — 물리 스페이서. pb-[150px] collapse 방지. */}
      <div className="h-[150px] shrink-0 pointer-events-none" aria-hidden="true" />

      {/* Stage 8.13 — Referral 복사 완료 토스트. */}
      {referralToast && (
        <div className="pointer-events-none fixed bottom-32 left-1/2 z-40 -translate-x-1/2 rounded-full border border-indigo-400/40 bg-black/90 px-4 py-2 text-[11px] font-bold text-white backdrop-blur-xl">
          {t('portfolio.referralCopied')}
        </div>
      )}
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
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</div>
      <div
        className={`mt-0.5 font-mono text-[13px] font-bold tabular-nums ${valueClass ?? 'text-white'}`}
      >
        {value}
      </div>
    </div>
  );
}

function OpenPositionRow({
  pos,
  livePnl,
}: {
  pos: NonNullable<UserStatus['position']>;
  livePnl: number;
}) {
  const m = getMarket(pos.symbol);
  const sideColor = pos.side === 'long' ? 'text-emerald-400' : 'text-rose-400';
  const pnlColor =
    livePnl > 0 ? 'text-emerald-400' : livePnl < 0 ? 'text-rose-400' : 'text-slate-400';
  return (
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
      <div className="text-right">
        <div className={`font-mono text-sm font-bold tabular-nums ${pnlColor}`}>
          {livePnl > 0 ? '+' : ''}
          {formatMoney(livePnl)}
        </div>
        <div className="font-mono text-[10px] text-white/40">Entry ${formatUSD(pos.entryPrice)}</div>
      </div>
    </div>
  );
}

// Stage 7.5 — 포트폴리오 탭 전용 가벼운 실시간 가격 구독자.
function useLivePrice(symbol: string): number | null {
  const feed = useBinanceFeed(symbol, '1m');
  return feed.price;
}

function HistoryRow({ row }: { row: HistoryEntry }) {
  const m = getMarket(row.symbol);
  const pnlColor =
    row.pnl > 0 ? 'text-emerald-400' : row.pnl < 0 ? 'text-rose-400' : 'text-slate-400';
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
