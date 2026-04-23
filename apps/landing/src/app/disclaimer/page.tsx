import { LegalPage } from "../../components/LegalPage";

export const metadata = { title: "Risk Disclaimer" };

export default function DisclaimerPage() {
  return (
    <LegalPage title="Risk Disclaimer" lastUpdated="2026-04-22">
      <h2>Simulation only</h2>
      <p>
        Trading Academy is a <strong>paper-trading simulator</strong>. All balances,
        positions, profit/loss, leverage, and liquidations inside the Service are{" "}
        <strong>simulated</strong>. You cannot win or lose real money inside the Service.
      </p>

      <h2>Not financial advice</h2>
      <p>
        Nothing posted by Trading Academy, its employees, its bots, its Mini App content,
        its Elite Analyst Club chat, or any referral content constitutes investment advice,
        a solicitation to buy or sell any security, or a recommendation of any particular
        trading strategy.
      </p>

      <h2>Not a regulated service</h2>
      <p>
        We are not licensed as an investment advisor, broker-dealer, or money service in any
        jurisdiction. If you need personalized financial advice, consult a licensed
        professional in your country.
      </p>

      <h2>Market data</h2>
      <p>
        Price feeds originate from Binance public WebSocket streams. We make no warranty
        that feeds are complete, continuous, or free from delay. Outages do not entitle you
        to any compensation.
      </p>

      <h2>Acknowledge before trading real money</h2>
      <p>
        Practice results inside Trading Academy <strong>do not predict</strong> real-world
        results. If you choose to trade real money on any external exchange, you do so at
        your sole risk and responsibility.
      </p>
    </LegalPage>
  );
}
