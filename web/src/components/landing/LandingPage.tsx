import { useTranslation } from 'react-i18next';
import { TrendingUp, Trophy, Shield, Zap, Globe, GraduationCap } from 'lucide-react';

const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined)?.trim() || 'Tradergames_bot';
const BOT_DEEP_LINK = `https://t.me/${BOT_USERNAME}`;

// SEO landing page shown when the site is opened in a regular browser (no Telegram WebApp context).
// Same domain as the Mini App; Telegram users still get the React Mini App because they have window.Telegram.WebApp.
// CTA → t.me/Tradergames_bot. No payment, no signup.

export function LandingPage() {
  const { t } = useTranslation();

  const features = [
    { icon: TrendingUp, key: 'realtime' as const },
    { icon: Trophy, key: 'leaderboard' as const },
    { icon: Shield, key: 'risk' as const },
    { icon: Zap, key: 'instant' as const },
    { icon: Globe, key: 'i18n' as const },
    { icon: GraduationCap, key: 'learn' as const },
  ];

  const faqKeys = ['cost', 'real', 'experience', 'install', 'data', 'leverage'] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <header className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24">
        <div className="flex flex-col items-center text-center">
          <span className="mb-6 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
            {t('landing.hero.badge')}
          </span>
          <h1 className="text-balance text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            {t('landing.hero.title')}
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-base text-slate-300 sm:text-lg">
            {t('landing.hero.subtitle')}
          </p>
          <a
            href={BOT_DEEP_LINK}
            className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-8 py-4 text-base font-black uppercase tracking-wider text-white shadow-[0_8px_24px_rgba(16,185,129,0.4)] transition-all hover:brightness-110 active:scale-[0.97]"
          >
            {t('landing.hero.cta')}
            <span aria-hidden>→</span>
          </a>
          <p className="mt-3 text-[11px] uppercase tracking-widest text-slate-500">
            {t('landing.hero.ctaHint')}
          </p>
        </div>
      </header>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">
          {t('landing.features.title')}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, key }) => (
            <div
              key={key}
              className="rounded-2xl border border-white/5 bg-slate-900/60 p-5 transition-colors hover:border-emerald-400/30 hover:bg-slate-900"
            >
              <Icon size={22} strokeWidth={2} className="text-emerald-400" />
              <h3 className="mt-3 text-base font-bold">{t(`landing.features.${key}.title`)}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                {t(`landing.features.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">
          {t('landing.how.title')}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
              <div className="font-mono text-3xl font-black text-emerald-400">{`0${n}`}</div>
              <h3 className="mt-2 text-base font-bold">{t(`landing.how.step${n}.title`)}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                {t(`landing.how.step${n}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">
          {t('landing.faq.title')}
        </h2>
        <div className="mt-10 space-y-3">
          {faqKeys.map((key) => (
            <details
              key={key}
              className="group rounded-xl border border-white/5 bg-slate-900/60 px-5 py-4 open:border-emerald-400/30"
            >
              <summary className="cursor-pointer list-none text-sm font-bold marker:hidden">
                <span className="inline-flex w-full items-center justify-between gap-4">
                  <span>{t(`landing.faq.${key}.q`)}</span>
                  <span aria-hidden className="text-emerald-400 transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
                {t(`landing.faq.${key}.a`)}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 via-slate-900 to-slate-950 p-10 text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            {t('landing.finalCta.title')}
          </h2>
          <p className="mt-3 text-[14px] text-slate-300">{t('landing.finalCta.subtitle')}</p>
          <a
            href={BOT_DEEP_LINK}
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-8 py-4 text-base font-black uppercase tracking-wider text-white shadow-[0_8px_24px_rgba(16,185,129,0.4)] transition-all hover:brightness-110 active:scale-[0.97]"
          >
            {t('landing.finalCta.cta')}
            <span aria-hidden>→</span>
          </a>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-10 text-center text-[11px] text-slate-500">
        <div className="space-x-4">
          <a href="/?legal=terms" className="hover:text-slate-300">
            {t('landing.footer.terms')}
          </a>
          <a href="/?legal=privacy" className="hover:text-slate-300">
            {t('landing.footer.privacy')}
          </a>
          <a href="/?legal=refund" className="hover:text-slate-300">
            {t('landing.footer.refund')}
          </a>
        </div>
        <p className="mt-3">{t('landing.footer.disclaimer')}</p>
      </footer>
    </div>
  );
}
