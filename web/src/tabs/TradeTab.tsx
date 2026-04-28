import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { TradingChart } from '../components/TradingChart';
import { ActionPanel, type Position } from '../components/ActionPanel';
import { BalanceBar } from '../components/BalanceBar';
import { LiquidationOverlay } from '../components/LiquidationOverlay';
import { CoinSelector } from '../components/CoinSelector';
import { OrderBook } from '../components/OrderBook';
import { RecentTrades } from '../components/RecentTrades';
import { FundingTicker } from '../components/FundingTicker';
import { useBinanceFeed } from '../lib/useBinanceFeed';
import { calcPnl } from '../lib/format';
import { MARKETS, type MarketSymbol } from '../lib/markets';
import { hapticNotification, hapticImpact, openTelegramLinkSafe } from '../utils/telegram';
import {
  ApiError,
  closeTrade,
  openTrade,
  type UserStatus,
} from '../lib/api';

const RECHARGE_USD = 1_000;
const RECHARGE_PRICE_LABEL = '$2.99';

type TradeTabProps = {
  telegramUserId: number | null;
  user: TelegramWebAppUser | null;
  isInsideTelegram: boolean;
  status: UserStatus | null;
  statusError: string | null;
  refresh: () => Promise<void>;
};

// Stage 8.7 Single-Scroll TradeTab — Binance mobile 앱과 동일한 단일 스크롤 구조.
//
// 왜 3단 flex 를 버렸나:
//   · 기존: TOP(shrink-0) · MIDDLE(flex-1 overflow-y-auto) · BOTTOM(shrink-0)
//     → ActionPanel 이 BOTTOM 에 고정되면서 MIDDLE 영역이 쪼그라들어 차트/호가창이
//     사라지는 사고. 특히 포지션 없음 상태에서 ActionPanel 높이가 커지면 MIDDLE 이
//     0 px 이 되어 `lightweight-charts` 가 throw.
//   · 해결: 루트 전체가 하나의 overflow-y-auto. 위에서부터 자연스럽게 쌓이고,
//     유저는 스크롤로 차트 → 주문 → 호가창 순서로 이동.
//
// 레이아웃 순서 (top → bottom):
//   1. Header, FundingTicker, CoinSelector
//   2. TradingChart (h-[350px] shrink-0 — 시원한 차트 우선)
//   3. ActionPanel (relative wrapper — LiquidationOverlay 가 overlay 로 덮을 수 있게)
//   4. BalanceBar
//   5. OrderBook + RecentTrades (2-col)
//
// pb-32 로 BottomNav 뒤에 가려지지 않게 충분한 스크롤 마진.
export function TradeTab({
  telegramUserId,
  user,
  isInsideTelegram,
  status,
  statusError,
  refresh,
}: TradeTabProps) {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState<MarketSymbol>(MARKETS[0]!.symbol);
  const feed = useBinanceFeed(symbol, '1m');

  const [tradePending, setTradePending] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [rechargeError, setRechargeError] = useState<string | null>(null);

  const serverPosition = status?.position ?? null;
  const positionForPanel: Position | null =
    serverPosition && serverPosition.symbol.toLowerCase() === symbol
      ? {
          side: serverPosition.side,
          entryPrice: serverPosition.entryPrice,
          size: serverPosition.size,
          leverage: serverPosition.leverage,
        }
      : null;

  const livePnl =
    positionForPanel && feed.price !== null
      ? calcPnl(
          positionForPanel.side,
          positionForPanel.entryPrice,
          feed.price,
          positionForPanel.size,
          positionForPanel.leverage,
        )
      : 0;

  const balance = status?.balance ?? 10000;
  const isLiquidated = status?.isLiquidated ?? false;

  const prevLiqRef = useRef(isLiquidated);
  useEffect(() => {
    if (!prevLiqRef.current && isLiquidated) {
      hapticNotification('error');
    }
    prevLiqRef.current = isLiquidated;
  }, [isLiquidated]);

  const handleOpen = async ({
    side,
    size,
    leverage,
  }: {
    side: 'long' | 'short';
    size: number;
    leverage: number;
  }) => {
    if (telegramUserId === null) {
      setTradeError(t('trade.errorNoTelegram'));
      return;
    }
    setTradeError(null);
    setTradePending(true);
    try {
      await openTrade({ telegramUserId, symbol, side, size, leverage, fallbackPrice: feed.price ?? 0 });
      await refresh();
      hapticNotification('success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setTradeError(msg);
      hapticNotification('error');
    } finally {
      setTradePending(false);
    }
  };

  const handleClose = async () => {
    if (telegramUserId === null || !serverPosition) return;
    setTradeError(null);
    setTradePending(true);
    try {
      await closeTrade(telegramUserId, serverPosition.id, feed.price ?? 0);
      await refresh();
      hapticNotification('success');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setTradeError(msg);
      hapticNotification('error');
    } finally {
      setTradePending(false);
    }
  };

  // Stage 15.1 — Recharge = InviteMember 멤버십 페이지 redirect.
  const handleRecharge = () => {
    setRechargeError(null);
    hapticImpact('medium');
    const url = import.meta.env.VITE_INVITEMEMBER_RECHARGE_URL;
    if (!url) {
      setRechargeError('Recharge link not configured');
      return;
    }
    openTelegramLinkSafe(url);
  };

  const panelDisabled = telegramUserId === null || isLiquidated;
  const panelError = tradeError ?? statusError;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 pb-[150px]">
      <Header
        symbol={feed.symbol}
        price={feed.price}
        direction={feed.direction}
        status={feed.status}
        stats24h={feed.stats24h}
        user={user}
        isInsideTelegram={isInsideTelegram}
      />
      <FundingTicker symbol={symbol} />
      <CoinSelector symbol={symbol} onChange={setSymbol} />

      {/* Stage 8.10 — 상단 pt-2 로 candle wick 잘림 해결. overflow-hidden 은 둥근 모서리 때문에 유지. */}
      <section className="h-[350px] shrink-0 overflow-hidden rounded-xl border border-white/5 bg-slate-900/40 pt-2">
        <TradingChart key={symbol} history={feed.history} ticking={feed.ticking} />
      </section>

      {/* Stage 8.9 — 차트 바로 아래에 OrderBook + RecentTrades. 주문 내리기 전 호가창 보는 게 정상.
          "호가창 → 매수/매도 버튼" 순서가 Binance/Bybit 등 모든 프로 거래소 표준. */}
      <div className="grid grid-cols-2 gap-1.5">
        <OrderBook symbol={symbol} midPrice={feed.price} rows={5} />
        <RecentTrades symbol={symbol} rows={5} />
      </div>

      {/* ActionPanel — 호가창 아래. LiquidationOverlay 가 덮을 수 있게 relative wrapper. */}
      <div className="relative">
        <ActionPanel
          position={positionForPanel}
          markPrice={feed.price}
          balance={balance}
          pending={tradePending}
          errorMessage={panelError}
          disabled={panelDisabled}
          onOpen={handleOpen}
          onClose={handleClose}
        />
        {isLiquidated && (
          <LiquidationOverlay
            rechargeAmount={RECHARGE_USD}
            priceLabel={RECHARGE_PRICE_LABEL}
            errorMessage={rechargeError}
            onRecharge={handleRecharge}
          />
        )}
      </div>

      <BalanceBar
        balance={balance + livePnl}
        pnl={livePnl}
        hasPosition={positionForPanel !== null}
      />

      {/* Stage 8.9 — 물리 스페이서. pb-[150px] 가 모바일에서 collapse 되는 버그 원천 차단.
          shrink-0 로 flex 에서도 압축 불가 + pointer-events-none 으로 UX 무영향. */}
      <div className="h-[150px] shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
}
