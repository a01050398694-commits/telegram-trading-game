import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ko from '../locales/ko.json';
import ru from '../locales/ru.json';
import tr from '../locales/tr.json';
import vi from '../locales/vi.json';
import id from '../locales/id.json';

// Stage 8.0 — 클라이언트 i18n.
// 저장소: localStorage 'tg-trading.lang'.
// 우선순위: saved > Telegram language_code > navigator > 'en'.
// 추후 추가 언어(ru/es/ja/tr/pt/vi/zh/hi) 는 locales/*.json 만 드롭하면 됨.

const STORAGE_KEY = 'tg-trading.lang';
export const SUPPORTED_LANGS = ['en', 'ko', 'ru', 'tr', 'vi', 'id'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

function detect(): SupportedLang {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) {
    return saved as SupportedLang;
  }
  const tg = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (tg) {
    const code = tg.slice(0, 2);
    if ((SUPPORTED_LANGS as readonly string[]).includes(code)) {
      return code as SupportedLang;
    }
  }
  const nav = window.navigator.language ?? 'en';
  const navCode = nav.slice(0, 2);
  if ((SUPPORTED_LANGS as readonly string[]).includes(navCode)) {
    return navCode as SupportedLang;
  }
  return 'en';
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
      ru: { translation: ru },
      tr: { translation: tr },
      vi: { translation: vi },
      id: { translation: id },
    },
    lng: detect(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export function setLang(lang: SupportedLang): void {
  void i18n.changeLanguage(lang);
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage 접근 실패는 조용히 무시 (시크릿 모드 등)
  }
}

export function currentLang(): SupportedLang {
  return (i18n.language?.slice(0, 2) as SupportedLang) || 'en';
}

export default i18n;
