import { LegalPage } from "../../components/LegalPage";

export const metadata = { title: "Refund Policy" };

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy" lastUpdated="2026-04-22">
      <h2>Subscriptions (Academy / Lifetime Academy)</h2>
      <p>
        All recurring subscriptions are billed through <strong>InviteMember</strong> and
        follow the refund policy of that platform. In general:
      </p>
      <ul>
        <li>Requests made within 7 days of the first payment and before heavy use are eligible for a full refund.</li>
        <li>Renewed monthly charges are non-refundable once the new period starts.</li>
        <li>Lifetime Academy is a recurring locked-price subscription, not a one-time purchase.</li>
      </ul>

      <h2>Telegram Stars (Risk Management Reset)</h2>
      <p>
        Telegram Stars payments (150⭐ to reset a liquidated practice balance) are{" "}
        <strong>non-refundable</strong> once consumed, because the reset is delivered
        instantly upon payment confirmation.
      </p>

      <h2>How to request a refund</h2>
      <p>
        Open a support conversation with our Telegram bot and send{" "}
        <code>/refund</code>. Include the payment reference provided by the payment
        processor. We aim to respond within 3 business days.
      </p>

      <h2>Chargebacks</h2>
      <p>
        Filing a chargeback without first contacting support results in permanent account
        suspension.
      </p>
    </LegalPage>
  );
}
