// L-06 — Pricing 섹션. 3컬럼 구성.

type Plan = {
  name: string;
  price: string;
  cadence: string;
  highlight: boolean;
  features: string[];
  cta: string;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    highlight: false,
    features: [
      "One-time $100K practice capital",
      "60+ live futures markets",
      "Daily leaderboards",
      "Referral bonuses",
    ],
    cta: "Start Free",
  },
  {
    name: "Academy",
    price: "$29.99",
    cadence: "per month",
    highlight: true,
    features: [
      "Everything in Free",
      "Elite Analyst Club chat (21:50–24:00 KST)",
      "Weekly global tournaments",
      "Risk Reset −30% discount",
    ],
    cta: "Upgrade",
  },
  {
    name: "Lifetime Academy",
    price: "$7.99",
    cadence: "per month · locked forever",
    highlight: false,
    features: [
      "Partner exchange UID verification",
      "Permanent $29.99 → $7.99 freeze",
      "All Academy perks",
      "Priority support",
    ],
    cta: "Verify UID",
  },
];

export function PricingTable({ botUrl }: { botUrl: string }) {
  return (
    <section
      id="pricing"
      className="flex flex-col items-center justify-center border-t border-white/5 bg-slate-950 px-6 py-24 md:px-12 lg:px-24"
    >
      <div className="mb-12 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-indigo-300">
          Membership
        </div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Fair pricing. No hidden fees.
        </h2>
      </div>

      <div className="grid w-full max-w-5xl gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col gap-5 rounded-3xl border p-6 backdrop-blur-sm ${
              plan.highlight
                ? "border-indigo-400/50 bg-gradient-to-b from-indigo-500/10 to-slate-900 shadow-[0_0_60px_rgba(99,102,241,0.3)]"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                {plan.name}
              </span>
              {plan.highlight && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-indigo-300">
                  Popular
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white">{plan.price}</span>
              <span className="text-xs text-slate-500">{plan.cadence}</span>
            </div>
            <ul className="flex flex-1 flex-col gap-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-200">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                plan.highlight
                  ? "bg-indigo-500 text-white hover:bg-indigo-400"
                  : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
