// L-05 — 미니앱 스크린샷 슬로트 + 30초 데모 비디오 영역.
// 실제 이미지/비디오는 디자인팀(M-05, M-06) 배포 후 교체. 자리표시자로 그라디언트 카드.

const SCREENS = [
  { label: "Trade", icon: "📈", tint: "from-indigo-500/30 to-slate-900" },
  { label: "Portfolio", icon: "💼", tint: "from-emerald-500/30 to-slate-900" },
  { label: "Elite Club", icon: "👑", tint: "from-amber-500/30 to-slate-900" },
];

export function LivePreview() {
  return (
    <section className="flex flex-col items-center justify-center border-t border-white/5 bg-slate-950 px-6 py-24 md:px-12 lg:px-24">
      <div className="mb-12 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-300">
          Live Inside Telegram
        </div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          See it before you play
        </h2>
      </div>

      <div className="grid w-full max-w-5xl gap-6 sm:grid-cols-3">
        {SCREENS.map((s) => (
          <div
            key={s.label}
            className={`relative aspect-[9/16] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b ${s.tint} p-5`}
          >
            <div className="absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="mb-6 text-[10px] font-bold uppercase tracking-[0.35em] text-white/60">
              {s.label}
            </div>
            <div className="flex h-[calc(100%-2.5rem)] flex-col items-center justify-center gap-4">
              <div className="text-7xl">{s.icon}</div>
              <div className="text-xs text-slate-400">Screenshot placeholder</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-xs text-slate-500">
        30-second demo video →{" "}
        <span className="text-slate-400">M-05 배포 후 자동 링크</span>
      </div>
    </section>
  );
}
