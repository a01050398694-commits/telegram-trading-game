import { LegalPage } from "../../components/LegalPage";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="2026-04-22">
      <h2>1. Acceptance</h2>
      <p>
        By opening the Trading Academy Telegram bot or Mini App (the &quot;Service&quot;), you
        agree to these Terms of Service. If you do not agree, do not use the Service.
      </p>

      <h2>2. Nature of the Service</h2>
      <p>
        Trading Academy is a <strong>paper-trading simulator</strong> for educational purposes.
        Balances, positions, and PnL shown inside the Service are <strong>simulated</strong>.
        Nothing in the Service constitutes investment advice, brokerage, or any regulated
        financial service. We are <strong>not</strong> a licensed investment advisor under any
        jurisdiction.
      </p>

      <h2>3. Account</h2>
      <p>
        Your Telegram identity (user ID, username, language code) is used as your account.
        You are responsible for all activity under that Telegram account. We do not ask for,
        store, or transmit real-money credentials.
      </p>

      <h2>4. Subscriptions &amp; Payments</h2>
      <p>
        Paid tiers (Academy, Lifetime Academy) are processed via third-party services
        (InviteMember, Telegram Stars, Stripe) as applicable. Billing terms are governed by
        those providers. We do not collect or store your payment method directly.
      </p>

      <h2>5. Prohibited Conduct</h2>
      <ul>
        <li>Using bots or automation to inflate rankings or referrals.</li>
        <li>Attempting to bypass HMAC authentication or exploit the API.</li>
        <li>Sharing, selling, or transferring your account.</li>
        <li>Harassment inside the Elite Analyst Club chat.</li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>
        All content, trademarks, and design elements remain the property of Trading Academy
        or its licensors. You may not copy or redistribute them without permission.
      </p>

      <h2>7. Termination</h2>
      <p>
        We may suspend or terminate your access at any time, with or without notice, for
        violations of these Terms or suspected abuse.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        The Service is provided &quot;as is.&quot; To the maximum extent permitted by law, we
        disclaim all warranties and shall not be liable for any indirect, incidental, or
        consequential damages arising from your use of the Service.
      </p>

      <h2>9. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the Republic of Korea. Disputes shall be
        resolved in the courts of Seoul Central District, unless a mandatory consumer law
        states otherwise.
      </p>

      <h2>10. Contact</h2>
      <p>
        For any question regarding these Terms, contact us via Telegram at the support
        handle listed on the Service.
      </p>
    </LegalPage>
  );
}
