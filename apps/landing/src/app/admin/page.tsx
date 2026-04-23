"use client";

import { useEffect, useState } from "react";

// A-05 — 대표님 전용 Admin 대시보드.
// 토큰 인증은 클라이언트에서 x-admin-secret 헤더로 전송.
// 실제 요청은 bot API (`NEXT_PUBLIC_API_BASE`) 에 직접 붙는다.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

type Metrics = {
  totalUsers: number;
  dau: number;
  mau: number;
  liquidated: number;
  liquidationRate: number;
  verified: number;
  conversionRate: number;
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!secret) {
      setErr("Enter admin secret first.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/metrics`, {
        headers: { "x-admin-secret": secret },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as Metrics;
      setMetrics(data);
      sessionStorage.setItem("admin_secret", secret);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_secret");
    if (cached) setSecret(cached);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-white/5 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <span className="font-black">Admin Dashboard</span>
          </div>
          <span className="text-xs text-slate-500">
            Internal use only. Do not share this URL.
          </span>
        </div>
      </nav>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Admin Secret
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="x-admin-secret"
              className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "..." : "Load"}
            </button>
          </div>
          {err && <div className="text-sm text-rose-400">{err}</div>}
        </section>

        {metrics && (
          <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <MetricCard label="Total Users" value={metrics.totalUsers.toLocaleString()} />
            <MetricCard label="DAU (24h trades)" value={metrics.dau.toLocaleString()} />
            <MetricCard label="MAU (30d trades)" value={metrics.mau.toLocaleString()} />
            <MetricCard
              label="Liquidation Rate"
              value={`${metrics.liquidationRate.toFixed(1)}%`}
              sub={`${metrics.liquidated} liquidated`}
            />
            <MetricCard
              label="Verified Users"
              value={metrics.verified.toLocaleString()}
              sub={`${metrics.conversionRate.toFixed(1)}% conversion`}
            />
          </section>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 font-mono text-3xl font-black text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
