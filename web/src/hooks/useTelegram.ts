import { useEffect, useState } from 'react';

// 앱 전역 다크 베이스 — Telegram 헤더/배경과 동기화해 "웹뷰 띠" 가 안 보이도록.
const APP_BG = '#020617'; // tailwind slate-950

export type TelegramContext = {
  webApp: TelegramWebApp | null;
  user: TelegramWebAppUser | null;
  isInsideTelegram: boolean;
  platform: string | null;
};

// 브라우저 직접 접속도 지원하기 위해 WebApp 존재 여부를 null 로 구분한다.
// 텔레그램 클라이언트 외부에서는 window.Telegram이 없다.
export function useTelegram(): TelegramContext {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    // ready 는 첫 렌더 직후 1회 호출 — 로딩 스피너 제거 신호.
    tg.ready();
    // 하프-스크린 → 풀-스크린 확장. 게임 느낌에 필수.
    tg.expand();

    // 구버전 클라이언트는 set*Color 가 없음 — optional chaining 으로 안전 호출.
    // 헤더·배경을 슬레이트-950 으로 고정해 Telegram UI 와 경계 없애기.
    tg.setHeaderColor?.(APP_BG);
    tg.setBackgroundColor?.(APP_BG);
    tg.setBottomBarColor?.(APP_BG);

    // 차트 스와이프 중 WebApp 이 닫히는 사고 방지 (Telegram 7.7+).
    tg.disableVerticalSwipes?.();

    // Stage 8.11 — Android Chrome 은 100vh 에 URL 바 영역을 포함시켜 BottomNav 가 공중에 뜸.
    // Telegram 이 제공하는 viewportStableHeight 를 CSS 변수로 주입해 <main> 이 실제 가시
    // 영역에 딱 맞게 한다. viewportChanged 이벤트로 화면 크기 변화(키보드 등)에도 재계산.
    const applyViewport = () => {
      const stable = tg.viewportStableHeight ?? tg.viewportHeight ?? window.innerHeight;
      document.documentElement.style.setProperty('--tg-viewport-height', `${stable}px`);
    };
    applyViewport();
    tg.onEvent?.('viewportChanged', applyViewport);

    setWebApp(tg);

    return () => {
      tg.offEvent?.('viewportChanged', applyViewport);
    };
  }, []);

  return {
    webApp,
    user: webApp?.initDataUnsafe.user ?? null,
    isInsideTelegram: webApp !== null,
    platform: webApp?.platform ?? null,
  };
}
