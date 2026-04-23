// L-07 — Live Leaderboard.
// 서버 컴포넌트. bot API `/api/rankings/today` 를 ISR(60초 revalidate) 로 호출.
// NEXT_PUBLIC_API_BASE 없으면 placeholder 10줄 렌더.

type RankingEntry = {
  rank: number;
  username: string;
  dailyPnl: number;
  dailyPnlPercent: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

async function fetchTop10(): Promise<RankingEntry[]> {
  if (!API_BASE) {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      username: `Trader${String(i + 1).padStart(3, "0")}`,
      dailyPnl: Math.round((0.2 - i * 0.02) * 20000),
      dailyPnlPercent: 20 - i * 2,
    }));
  }
  try {
    const res = await fetch(`${API_BASE}/api/rankings/today`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { rankings: RankingEntry[] };
    return body.rankings.slice(0, 10);
  } catch {
    return [];
  }
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function medal(rank: number): string {
  if (rank === 1) return "👑";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export async function LiveLeaderboard() {
  const rows = await fetchTop10();

  return (
    <section className="flex flex-col items-center justify-center border-t border-white/5 bg-slate-900/50 px-6 py-24 md:px-12 lg:px-24">
      <div className="mb-12 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-300">
          Today · Top 10
        </div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Live Leaderboard
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Refreshed every minute · Midnight KST snapshot saved daily
        </p>
      </div>

      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Leaderboard loading…
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.rank}
              className="flex items-center justify-between border-b border-white/5 px-5 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-800 font-mono text-sm font-bold text-white">
                  {medal(r.rank)}
                </span>
                <span className="font-mono text-sm font-semibold text-slate-200">
                  {r.username}
                </span>
              </div>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  r.dailyPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatMoney(r.dailyPnl)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
