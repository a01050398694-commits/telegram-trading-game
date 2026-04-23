import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

type Locale = "en" | "ko";

export function LegalPage({
  title,
  lastUpdated,
  locale = "en",
  children,
}: {
  title: string;
  lastUpdated: string;
  locale?: Locale;
  children: ReactNode;
}) {
  const homeHref = locale === "ko" ? "/ko" : "/";
  const homeLabel = locale === "ko" ? "← 홈" : "← Home";
  const sectionLabel = locale === "ko" ? "법적 고지" : "Legal";
  const updatedLabel = locale === "ko" ? "최종 업데이트" : "Last updated";

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 py-4 backdrop-blur-md md:px-12">
        <Link href={homeHref} className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="font-black tracking-tight text-white">Trading Academy</span>
        </Link>
        <Link
          href={homeHref}
          className="text-xs font-bold text-slate-400 hover:text-white"
        >
          {homeLabel}
        </Link>
      </nav>

      <article className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16 md:px-8">
        <header className="flex flex-col gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-300">
            {sectionLabel}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">{title}</h1>
          <div className="text-xs text-slate-500">{updatedLabel}: {lastUpdated}</div>
        </header>

        <div className="prose prose-invert prose-slate max-w-none text-sm leading-relaxed text-slate-200 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_p]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:mb-4 [&_li]:mb-1 [&_a]:text-indigo-400 [&_a]:underline">
          {children}
        </div>
      </article>

      <SiteFooter locale={locale} />
    </div>
  );
}
