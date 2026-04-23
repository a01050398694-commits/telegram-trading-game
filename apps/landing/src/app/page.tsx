import Link from "next/link";
import { LiveLeaderboard } from "../components/LiveLeaderboard";
import { PricingTable } from "../components/PricingTable";
import { FAQ } from "../components/FAQ";
import { SiteFooter } from "../components/SiteFooter";
import { LivePreview } from "../components/LivePreview";

const BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || "https://t.me/Tradergames_bot";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500/30">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 py-4 backdrop-blur-md md:px-12 lg:px-24">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <span className="text-lg font-black tracking-tight text-white">Trading Academy</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/ko"
            className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 transition-colors hover:bg-white/5 sm:block"
          >
            한국어
          </Link>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
          >
            Play on Telegram
          </a>
        </div>
      </nav>

      {/* L-03 Hero */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:px-12 lg:px-24">
        <div className="pointer-events-none absolute top-0 z-0 h-[500px] w-full max-w-2xl rounded-full bg-indigo-500/20 opacity-50 blur-[120px]" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
            Now Live on Telegram
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.1] tracking-tighter text-white sm:text-6xl md:text-7xl lg:text-8xl">
            Master the Market with{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
              $100K Practice Capital
            </span>
          </h1>
          <p className="max-w-2xl text-lg text-slate-400 sm:text-xl">
            Experience real-time futures trading directly in your Telegram app. Compete with
            thousands, practice risk management, and climb the global leaderboards — no real
            money at risk.
          </p>

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-2xl bg-indigo-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-indigo-500/25 transition-transform hover:scale-105 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.888-.662 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              Start Playing Free
            </a>
            <a
              href="#features"
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-base font-bold text-white transition-colors hover:bg-white/10"
            >
              Explore Features
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
            <span>🔒 No real money</span>
            <span>⚡ Live Binance data</span>
            <span>🏆 Daily leaderboards</span>
            <span>👑 Elite chat club</span>
          </div>
        </div>
      </section>

      {/* L-04 Features */}
      <section
        id="features"
        className="flex flex-col items-center justify-center border-t border-white/5 bg-slate-900/50 px-6 py-24 md:px-12 lg:px-24"
      >
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Everything you need to master trading
          </h2>
          <p className="mt-4 text-slate-400">
            Professional-grade features wrapped in a simple Telegram mini-app.
          </p>
        </div>

        <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard icon="⚡" title="60+ Crypto Assets" description="Trade Bitcoin, Ethereum, Solana, and top altcoins with real-time Binance price feeds." accent="bg-indigo-500/20" />
          <FeatureCard icon="🔥" title="Up to 125x Leverage" description="Practice high-risk margin trading safely without losing a single dollar of real money." accent="bg-fuchsia-500/20" />
          <FeatureCard icon="🏆" title="Daily Leaderboards" description="Compete with traders worldwide. See daily snapshots, win streaks, and rank up." accent="bg-emerald-500/20" />
          <FeatureCard icon="👑" title="Elite Chat Club" description="Top 10 learners earn a 21:50–24:00 KST chat invitation every single night." accent="bg-amber-500/20" />
        </div>
      </section>

      {/* L-05 Live Preview */}
      <LivePreview />

      {/* L-07 Live Leaderboard — server component hits /api/rankings/today */}
      <LiveLeaderboard />

      {/* L-06 Pricing */}
      <PricingTable botUrl={BOT_URL} />

      {/* L-08 FAQ */}
      <FAQ />

      {/* L-09 Footer */}
      <SiteFooter />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  accent,
}: {
  icon: string;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-transform hover:-translate-y-1">
      <div className={`rounded-xl ${accent} p-3 text-2xl`}>{icon}</div>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}
