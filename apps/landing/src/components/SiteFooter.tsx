import Link from "next/link";

type Locale = "en" | "ko";

// L-09 — Footer. 법무 페이지 링크 + 저작권. 로케일별 링크/라벨 분기.

const COPY: Record<Locale, {
  tosLabel: string;
  privacyLabel: string;
  disclaimerLabel: string;
  refundLabel: string;
  cookiesLabel: string;
  langSwitchLabel: string;
  langSwitchHref: string;
  rights: string;
  tagline: string;
  paths: {
    terms: string;
    privacy: string;
    disclaimer: string;
    refund: string;
    cookies: string;
  };
}> = {
  en: {
    tosLabel: "Terms of Service",
    privacyLabel: "Privacy",
    disclaimerLabel: "Disclaimer",
    refundLabel: "Refund",
    cookiesLabel: "Cookies",
    langSwitchLabel: "한국어",
    langSwitchHref: "/ko",
    rights: "All rights reserved.",
    tagline:
      "This is a paper-trading simulator for educational purposes only. Not financial advice. Not an investment service. Your results are not guaranteed.",
    paths: {
      terms: "/terms",
      privacy: "/privacy",
      disclaimer: "/disclaimer",
      refund: "/refund",
      cookies: "/cookies",
    },
  },
  ko: {
    tosLabel: "이용약관",
    privacyLabel: "개인정보처리방침",
    disclaimerLabel: "투자위험 고지",
    refundLabel: "환불규정",
    cookiesLabel: "쿠키정책",
    langSwitchLabel: "English",
    langSwitchHref: "/",
    rights: "모든 권리 보유.",
    tagline:
      "이 서비스는 교육 목적의 모의 트레이딩 시뮬레이터입니다. 투자자문이 아니며, 실제 투자 수익을 보장하지 않습니다. 본 서비스는 유사투자자문업 신고 대상이 아닙니다.",
    paths: {
      terms: "/ko/terms",
      privacy: "/ko/privacy",
      disclaimer: "/ko/disclaimer",
      refund: "/ko/refund",
      cookies: "/ko/cookies",
    },
  },
};

export function SiteFooter({ locale = "en" }: { locale?: Locale } = {}) {
  const year = new Date().getFullYear();
  const c = COPY[locale];
  return (
    <footer className="border-t border-white/5 bg-slate-950 px-6 py-12 md:px-12 lg:px-24">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="font-black text-white">Trading Academy</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <Link href={c.paths.terms} className="hover:text-white">{c.tosLabel}</Link>
          <Link href={c.paths.privacy} className="hover:text-white">{c.privacyLabel}</Link>
          <Link href={c.paths.disclaimer} className="hover:text-white">{c.disclaimerLabel}</Link>
          <Link href={c.paths.refund} className="hover:text-white">{c.refundLabel}</Link>
          <Link href={c.paths.cookies} className="hover:text-white">{c.cookiesLabel}</Link>
          <Link href={c.langSwitchHref} className="hover:text-white">{c.langSwitchLabel}</Link>
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
          © {year} Trading Academy. {c.rights}
          <br />
          {c.tagline}
        </p>
      </div>
    </footer>
  );
}
