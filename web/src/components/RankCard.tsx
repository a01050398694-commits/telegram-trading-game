import { useMemo } from 'react';

// F-08 — 랭킹 스냅샷 카드 (공유용).
// 외부 의존(html2canvas, satori, 이미지 CDN) 없이 순수 SVG 로 구성.
// 유저 액션:
//   1. `toBlob()` → Share API / clipboard.write
//   2. 직접 보기 (모달/미리보기)

export type RankCardProps = {
  rank: number;
  username: string;
  dailyPnl: number;
  dailyPnlPercent: number;
  equity: number;
  date?: string; // ISO date
  brand?: string;
};

const WIDTH = 1080;
const HEIGHT = 1920; // 9:16 (인스타 스토리 규격)

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function RankCard(props: RankCardProps) {
  const {
    rank,
    username,
    dailyPnl,
    dailyPnlPercent,
    equity,
    date = new Date().toISOString().slice(0, 10),
    brand = 'Trading Academy',
  } = props;

  const positive = dailyPnl >= 0;
  const accent = positive ? '#10b981' : '#f43f5e';

  const svg = useMemo(() => {
    return renderSvg({
      rank,
      username,
      dailyPnl,
      dailyPnlPercent,
      equity,
      date,
      brand,
      accent,
    });
  }, [rank, username, dailyPnl, dailyPnlPercent, equity, date, brand, accent]);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
      <div
        className="w-full"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

export function rankCardToDataUrl(props: RankCardProps): string {
  const positive = props.dailyPnl >= 0;
  const accent = positive ? '#10b981' : '#f43f5e';
  const svg = renderSvg({ ...props, accent, date: props.date ?? new Date().toISOString().slice(0, 10), brand: props.brand ?? 'Trading Academy' });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function copyRankCard(props: RankCardProps): Promise<boolean> {
  try {
    const svg = renderSvg({
      ...props,
      accent: props.dailyPnl >= 0 ? '#10b981' : '#f43f5e',
      date: props.date ?? new Date().toISOString().slice(0, 10),
      brand: props.brand ?? 'Trading Academy',
    });
    await navigator.clipboard.writeText(svg);
    return true;
  } catch {
    return false;
  }
}

function renderSvg(args: RankCardProps & { accent: string }): string {
  const { rank, username, dailyPnl, dailyPnlPercent, equity, date, brand, accent } = args;
  const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  const pnlSign = dailyPnl >= 0 ? '+' : '-';
  const pctSign = dailyPnlPercent >= 0 ? '+' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

  <text x="${WIDTH / 2}" y="180" font-size="48" fill="#94a3b8" text-anchor="middle" letter-spacing="12" font-weight="700">${(brand ?? '').toUpperCase()}</text>
  <text x="${WIDTH / 2}" y="260" font-size="32" fill="#64748b" text-anchor="middle" letter-spacing="6">${date}</text>

  <text x="${WIDTH / 2}" y="520" font-size="280" fill="#ffffff" text-anchor="middle" font-weight="900">${medal}</text>

  <text x="${WIDTH / 2}" y="780" font-size="60" fill="#e2e8f0" text-anchor="middle" font-weight="700">${escapeXml(username)}</text>

  <text x="${WIDTH / 2}" y="1020" font-size="48" fill="#94a3b8" text-anchor="middle" letter-spacing="8">DAILY PNL</text>
  <text x="${WIDTH / 2}" y="1180" font-size="180" fill="${accent}" text-anchor="middle" font-weight="900">${pnlSign}${formatUsd(Math.abs(dailyPnl))}</text>
  <text x="${WIDTH / 2}" y="1280" font-size="72" fill="${accent}" text-anchor="middle" font-weight="700">${pctSign}${dailyPnlPercent.toFixed(2)}%</text>

  <line x1="160" y1="1440" x2="${WIDTH - 160}" y2="1440" stroke="#1e293b" stroke-width="2"/>

  <text x="${WIDTH / 2}" y="1560" font-size="40" fill="#64748b" text-anchor="middle" letter-spacing="6">EQUITY</text>
  <text x="${WIDTH / 2}" y="1680" font-size="96" fill="#f8fafc" text-anchor="middle" font-weight="800">${formatUsd(equity)}</text>

  <text x="${WIDTH / 2}" y="1820" font-size="32" fill="#475569" text-anchor="middle" letter-spacing="4">Simulation only · No real money</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
