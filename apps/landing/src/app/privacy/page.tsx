import { LegalPage } from "../../components/LegalPage";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="2026-04-22">
      <h2>1. What we collect</h2>
      <ul>
        <li>Telegram user ID (numeric)</li>
        <li>Telegram username (if public) and first name</li>
        <li>Preferred language code</li>
        <li>Simulated trading activity (positions, PnL, rankings)</li>
        <li>Referral graph (who invited whom)</li>
        <li>Optional exchange UID you voluntarily submit for verification</li>
      </ul>

      <h2>2. What we do NOT collect</h2>
      <ul>
        <li>Phone numbers or email (unless you voluntarily provide one)</li>
        <li>Payment card details (handled by Telegram Stars / InviteMember / Stripe)</li>
        <li>Private Telegram chats or contacts</li>
        <li>Real wallet private keys or exchange API keys</li>
      </ul>

      <h2>3. How we use data</h2>
      <ul>
        <li>Deliver the Service (authenticate requests via Telegram initData HMAC).</li>
        <li>Compute daily leaderboards and referral missions.</li>
        <li>Anonymous product analytics (PostHog) and error tracking (Sentry).</li>
      </ul>

      <h2>4. Data sharing</h2>
      <p>
        We share data only with providers that operate the Service: Supabase (database &amp;
        hosting), Render/Vercel (compute), PostHog (analytics), Sentry (errors),
        InviteMember (subscriptions). Each operates under their own data-processing terms.
      </p>

      <h2>5. Retention</h2>
      <p>
        Personal account data is retained while your Telegram ID is active on the Service.
        Ranking snapshots older than 90 days are automatically purged.
      </p>

      <h2>6. Your rights (GDPR / PIPA / CCPA)</h2>
      <p>
        You may request export or deletion of your personal data by contacting us via
        Telegram. We honor the rights applicable under your local law.
      </p>

      <h2>7. Children</h2>
      <p>
        The Service is not directed to children under 13 (or the minimum age required in
        your country). We do not knowingly collect data from minors.
      </p>

      <h2>8. Updates</h2>
      <p>
        Material changes to this policy will be announced via the Telegram bot at least 14
        days before taking effect.
      </p>
    </LegalPage>
  );
}
