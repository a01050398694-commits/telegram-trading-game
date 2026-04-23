import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomNav, type TabKey } from './components/BottomNav';
import { TradeTab } from './tabs/TradeTab';
import { PortfolioTab } from './tabs/PortfolioTab';
import { VIPTab } from './tabs/VIPTab';
import { PremiumTab } from './tabs/PremiumTab';
import { useTelegram } from './hooks/useTelegram';
import { ApiError, fetchUserStatus, type UserStatus } from './lib/api';
import { initAnalytics, identify, track } from './lib/analytics';

// Stage 6: 4-탭 멀티 스크린 쉘.
// - App 은 탭 라우팅 + 공통 상태(status 폴링)만 담당
// - 각 탭은 필요한 상태를 prop 으로 받거나 자체 fetch
// - BottomNav 는 safe-area-inset 아래에 고정

const STATUS_POLL_MS = 2000;

export default function App() {
  const { user, isInsideTelegram } = useTelegram();
  const [tab, setTab] = useState<TabKey>('trade');
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const telegramUserId = user?.id ?? null;

  // F-13 — PostHog / Web Vitals 초기화. mount 1회.
  useEffect(() => {
    initAnalytics();
    track('app_opened', { inside_telegram: isInsideTelegram });
  }, [isInsideTelegram]);

  useEffect(() => {
    if (telegramUserId !== null) {
      identify(telegramUserId, {
        language: user?.language_code ?? null,
        username: user?.username ?? null,
      });
    }
  }, [telegramUserId, user?.language_code, user?.username]);

  useEffect(() => {
    track('tab_viewed', { tab });
  }, [tab]);

  const pollTimerRef = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (telegramUserId === null) return;
    try {
      const s = await fetchUserStatus(telegramUserId);
      setStatus(s);
      setStatusError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setStatusError(msg);
    }
  }, [telegramUserId]);

  useEffect(() => {
    if (telegramUserId === null) return;
    void refresh();
    pollTimerRef.current = window.setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    };
  }, [telegramUserId, refresh]);

  if (status === null && statusError === null) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-slate-950 text-white">
        <div className="text-4xl">🚀</div>
        <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          Loading Data...
        </div>
      </div>
    );
  }

  return (
    // Stage 8.11 — Android Chrome 100vh 버그 회피. Telegram 이 계산한 viewportStableHeight
    // 를 --tg-viewport-height 변수로 받아 <main> 높이에 직접 적용. 브라우저 프리뷰 fallback
    // 은 100vh. 이걸로 BottomNav 가 공중에 뜨는 현상 완전 제거.
    <main
      className="safe-area flex flex-col gap-2 bg-slate-950 text-white select-none"
      style={{ height: 'var(--tg-viewport-height, 100dvh)' }}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'trade' && (
          <TradeTab
            telegramUserId={telegramUserId}
            user={user}
            isInsideTelegram={isInsideTelegram}
            status={status}
            statusError={statusError}
            refresh={refresh}
          />
        )}
        {tab === 'portfolio' && (
          <PortfolioTab telegramUserId={telegramUserId} status={status} />
        )}
        {tab === 'vip' && <VIPTab status={status} />}
        {tab === 'premium' && (
          <PremiumTab telegramUserId={telegramUserId} status={status} />
        )}
      </div>

      {telegramUserId === null && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-[10px] font-medium text-amber-300">
          Browser preview — educational demo only. Open via the Telegram bot for full paper-trading.
        </div>
      )}

      <BottomNav active={tab} onChange={setTab} />
    </main>
  );
}
