import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tradingacademy.app";
const BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || "https://t.me/Tradergames_bot";

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Trading Academy — $100K Daily Practice Capital",
    template: "%s · Trading Academy",
  },
  description:
    "Practice crypto futures trading with $100K simulated capital. Compete on daily leaderboards, join the Elite Analyst Club, and master risk management — directly inside Telegram.",
  keywords: [
    "trading simulator",
    "paper trading",
    "crypto futures",
    "telegram mini app",
    "leverage practice",
    "risk management",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Trading Academy",
    title: "Trading Academy — $100K Daily Practice Capital",
    description:
      "Safe paper-trading simulator powered by live Binance data. No real money involved.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Trading Academy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trading Academy — $100K Daily Practice Capital",
    description:
      "Safe paper-trading simulator powered by live Binance data. Available on Telegram.",
    images: [`${SITE_URL}/og-image.png`],
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      en: `${SITE_URL}/`,
      ko: `${SITE_URL}/ko`,
    },
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "telegram-bot-url": BOT_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
