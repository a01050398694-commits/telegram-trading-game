import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, setLang, type SupportedLang } from '../lib/i18n';
import { hapticSelection } from '../utils/telegram';

type SettingsModalProps = {
  onClose: () => void;
};

// Stage 8.0 — Glassmorphism 설정 모달.
// 현재 유일 옵션: 언어 전환 (en / ko).
// 하단에 모의 거래 교육용 안내 문구 (법적 리스크 회피).
export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const current = (i18n.language?.slice(0, 2) ?? 'en') as SupportedLang;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePick = (lang: SupportedLang) => {
    if (lang !== current) hapticSelection();
    setLang(lang);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="grain glass-specular relative w-[92%] max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-black tracking-tight text-white">
            ⚙️ {t('settings.title')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs font-bold text-white/50 hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/40">
          {t('settings.language')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SUPPORTED_LANGS.map((lang) => {
            const active = lang === current;
            const label = lang === 'ko' ? t('settings.korean') : t('settings.english');
            return (
              <button
                key={lang}
                type="button"
                onClick={() => handlePick(lang)}
                className={`rounded-xl border px-3 py-3 text-sm font-bold transition-all active:scale-[0.97] ${
                  active
                    ? 'border-indigo-400/60 bg-indigo-500/15 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]'
                    : 'border-white/10 bg-slate-900/70 text-white/70 hover:border-white/20 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-white/40">
          {t('settings.disclaimer')}
        </div>
      </div>
    </div>
  );
}
