import { useTranslation } from 'react-i18next';
import { hapticSelection } from '../utils/telegram';

// Stage 8.0 — vip → elite / premium → academy 로 키 이름 유지한 채 라벨만 교체.
// 라벨은 i18n 키로 동적 바인딩되므로 언어 토글 시 즉시 재렌더.
export type TabKey = 'trade' | 'portfolio' | 'vip' | 'premium';

type BottomNavProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

const TAB_META: { key: TabKey; icon: string; i18n: string }[] = [
  { key: 'trade', icon: '📈', i18n: 'nav.trade' },
  { key: 'portfolio', icon: '💼', i18n: 'nav.portfolio' },
  { key: 'vip', icon: '🎓', i18n: 'nav.elite' },
  { key: 'premium', icon: '📘', i18n: 'nav.academy' },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="flex items-stretch rounded-xl border border-white/5 bg-slate-900/95 shadow-lg">
      {TAB_META.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              if (!on) hapticSelection();
              onChange(tab.key);
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              on ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className={`text-lg leading-none ${on ? '' : 'grayscale opacity-70'}`}>
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider">{t(tab.i18n)}</span>
            {on && <span className="mt-0.5 h-0.5 w-6 rounded-full bg-amber-400" />}
          </button>
        );
      })}
    </nav>
  );
}
