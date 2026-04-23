// L-08 — FAQ 섹션. CSS details 태그로 JS 없이 accordion.

type FaqItem = { q: string; a: string };

const ITEMS: FaqItem[] = [
  {
    q: "Is this a real trading platform?",
    a: "No. Trading Academy is a paper-trading simulator. You receive $100,000 of simulated capital once on signup and can never lose real money. All market data is live from Binance, but every trade is virtual.",
  },
  {
    q: "How do I access it?",
    a: "Open Telegram, start our bot, then tap the Mini App button. No downloads, no account creation — your Telegram identity is your account.",
  },
  {
    q: "What happens if I get liquidated?",
    a: "Your practice balance drops to $0 and your account becomes locked. You can pay 150 Stars to reset and receive a fresh $100,000. This is intentional — it teaches real risk management.",
  },
  {
    q: "What are the Academy and Lifetime plans?",
    a: "Academy ($29.99/mo) unlocks the Elite Analyst chat and tournaments. Lifetime ($7.99/mo) freezes that price forever in exchange for verifying a UID on one of our partner exchanges.",
  },
  {
    q: "Do you store my personal data?",
    a: "We only store your Telegram ID, username (if public), and trading activity. We never see your phone number, bank info, or private chats. See our Privacy Policy for details.",
  },
  {
    q: "Can I use this for financial advice?",
    a: "Absolutely not. This is an educational simulator. We are not licensed investment advisors. Nothing inside Trading Academy is financial advice.",
  },
];

export function FAQ() {
  return (
    <section
      id="faq"
      className="flex flex-col items-center justify-center border-t border-white/5 bg-slate-900/50 px-6 py-24 md:px-12 lg:px-24"
    >
      <div className="mb-12 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-400">
          FAQ
        </div>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Common questions
        </h2>
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-3">
        {ITEMS.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors open:border-white/20"
          >
            <summary className="flex cursor-pointer items-center justify-between font-bold text-white">
              <span>{item.q}</span>
              <span className="text-slate-500 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
