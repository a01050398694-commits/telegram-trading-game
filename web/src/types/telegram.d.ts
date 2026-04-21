// Telegram Web App SDK 최소 타입 정의
// 공식 문서: https://core.telegram.org/bots/webapps
export {};

declare global {
  interface TelegramWebAppUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
  }

  interface TelegramWebAppInitData {
    user?: TelegramWebAppUser;
    auth_date?: number;
    hash?: string;
  }

  // Bot API 6.1+ 에서 제공되는 색상 토큰. 없을 수도 있으므로 전부 optional.
  interface TelegramWebAppThemeParams {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    header_bg_color?: string;
    bottom_bar_bg_color?: string;
    accent_text_color?: string;
    section_bg_color?: string;
    section_header_text_color?: string;
    subtitle_text_color?: string;
    destructive_text_color?: string;
  }

  interface TelegramHapticFeedback {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  }

  // Stage 7.5 — Share 기능에 필요한 저수준 API.
  // Telegram 버전별로 제공 여부가 다르므로 전부 optional.
  type InlineChatType = 'users' | 'bots' | 'groups' | 'channels';

  interface TelegramPopupButton {
    id?: string;
    type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
    text?: string;
  }

  interface TelegramPopupParams {
    title?: string;
    message: string;
    buttons?: TelegramPopupButton[];
  }

  interface TelegramWebApp {
    initData: string;
    initDataUnsafe: TelegramWebAppInitData;
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: TelegramWebAppThemeParams;
    viewportHeight: number;
    viewportStableHeight: number;
    isExpanded: boolean;
    isVerticalSwipesEnabled?: boolean;
    HapticFeedback?: TelegramHapticFeedback;
    ready: () => void;
    expand: () => void;
    close: () => void;
    sendData: (data: string) => void;
    // 6.1+ — 구버전 클라이언트에서는 no-op 이어야 하므로 optional.
    setHeaderColor?: (color: string) => void;
    setBackgroundColor?: (color: string) => void;
    setBottomBarColor?: (color: string) => void;
    // 7.7+ — 풀스크린 게임에서 아래로 당기면 닫히는 현상 방지.
    disableVerticalSwipes?: () => void;
    enableClosingConfirmation?: () => void;
    // 6.6+ — 텍스트 공유. Stage 7.5 viral share 에 사용.
    switchInlineQuery?: (query: string, choose_chat_types?: InlineChatType[]) => void;
    // 7.8+ — 인스타 스토리 스타일 공유.
    shareToStory?: (mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }) => void;
    // 6.1+ — 인앱 토스트 대체용 네이티브 팝업.
    showPopup?: (params: TelegramPopupParams, cb?: (buttonId: string) => void) => void;
    showAlert?: (message: string, cb?: () => void) => void;
    openTelegramLink?: (url: string) => void;
    // Stage 8.11 — viewportChanged 구독. 안드로이드 URL 바 토글 대응.
    onEvent?: (eventType: string, eventHandler: () => void) => void;
    offEvent?: (eventType: string, eventHandler: () => void) => void;
  }

  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}
