import { useTranslation } from 'react-i18next';
import { TrendingUp, Briefcase, GraduationCap, BookOpen } from 'lucide-react';
import { hapticSelection } from '../utils/telegram';

// Stage 8.0 — vip → elite / premium → academy 로 키 이름 유지한 채 라벨만 교체.
// 라벨은 i18n 키로 동적 바인딩되므로 언어 토글 시 즉시 재렌더.
export type TabKey = 'trade' | 'portfolio' | 'vip' | 'premium';

type BottomNavProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

const TAB_META: { key: TabKey; icon: typeof TrendingUp; i18n: string }[] = [
  { key: 'trade', icon: TrendingUp, i18n: 'nav.trade' },
  { key: 'portfolio', icon: Briefcase, i18n: 'nav.portfolio' },
  { key: 'vip', icon: GraduationCap, i18n: 'nav.elite' },
  { key: 'premium', icon: BookOpen, i18n: 'nav.academy' },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="flex items-stretch rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-1)] shadow-lg">
      {TAB_META.map((tab) => {
        const on = tab.key === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              if (!on) hapticSelection();
              onChange(tab.key);
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              on ? 'text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">{t(tab.i18n)}</span>
            {on && <span className="mt-0.5 h-0.5 w-6 rounded-full bg-[var(--color-accent-gold)]" />}
          </button>
        );
      })}
    </nav>
  );
}
