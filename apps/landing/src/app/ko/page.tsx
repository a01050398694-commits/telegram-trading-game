import Link from "next/link";
import { LiveLeaderboard } from "../../components/LiveLeaderboard";
import { SiteFooter } from "../../components/SiteFooter";
import { FAQ } from "../../components/FAQ";
import { PricingTable } from "../../components/PricingTable";
import { LivePreview } from "../../components/LivePreview";

const BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || "https://t.me/Tradergames_bot";

export const metadata = {
  title: "트레이딩 아카데미 — 연습용 $100K 가상 자본",
  description:
    "텔레그램에서 바로 시작하는 크립토 선물 모의 투자 시뮬레이터. 실제 돈 없이 리스크 관리를 연습하고 글로벌 랭킹에서 경쟁하세요.",
  alternates: {
    canonical: "/ko",
    languages: {
      en: "/",
      ko: "/ko",
    },
  },
};

export default function HomeKo() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500/30">
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 py-4 backdrop-blur-md md:px-12 lg:px-24">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <span className="text-lg font-black tracking-tight text-white">트레이딩 아카데미</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/5 sm:block"
          >
            English
          </Link>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
          >
            텔레그램에서 시작
          </a>
        </div>
      </nav>

      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:px-12 lg:px-24">
        <div className="pointer-events-none absolute top-0 z-0 h-[500px] w-full max-w-2xl rounded-full bg-indigo-500/20 opacity-50 blur-[120px]" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
            텔레그램에서 라이브
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.1] tracking-tighter text-white sm:text-6xl md:text-7xl lg:text-8xl">
            연습용{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
              $100K
            </span>
            로
            <br />
            마스터하는 실시간 트레이딩
          </h1>
          <p className="max-w-2xl text-lg text-slate-400 sm:text-xl">
            실제 돈 한 푼 쓰지 않고도 라이브 바이낸스 데이터로 연습합니다. 매일 랭킹에서
            경쟁하고, Elite Analyst 클럽에 초대받고, 리스크 관리를 체계적으로 배우세요.
          </p>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl bg-indigo-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-indigo-500/25 hover:scale-105 active:scale-95"
          >
            무료로 시작하기
          </a>
        </div>
      </section>

      <LivePreview />
      <LiveLeaderboard />
      <PricingTable botUrl={BOT_URL} />
      <FAQ />
      <SiteFooter locale="ko" />
    </div>
  );
}
