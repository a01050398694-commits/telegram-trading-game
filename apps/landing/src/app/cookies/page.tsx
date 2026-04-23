import { LegalPage } from "../../components/LegalPage";

export const metadata = { title: "Cookie Notice" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Notice" lastUpdated="2026-04-22">
      <h2>What are cookies</h2>
      <p>
        Cookies are small files placed on your device. This landing page uses a minimal set
        of cookies and browser storage for the functions below.
      </p>

      <h2>Cookies we use</h2>
      <ul>
        <li>
          <strong>PostHog</strong> — anonymous product analytics (page views, click events,
          performance metrics). IP addresses are truncated.
        </li>
        <li>
          <strong>Next.js</strong> session — technical cookie to maintain UI state (locale
          preference).
        </li>
        <li>
          <strong>Sentry</strong> — session replay disabled by default; only error reports
          are sent with stack traces.
        </li>
      </ul>

      <h2>Third parties</h2>
      <p>
        We do not allow any third-party advertising networks on this site. When you follow
        a link to Telegram, Telegram&apos;s own privacy and cookie policies apply.
      </p>

      <h2>How to disable</h2>
      <p>
        You can block cookies in your browser settings. The landing page will still work;
        some analytics events may be missing. The Telegram Mini App itself does not use
        browser cookies — Telegram&apos;s WebView does not persist them across sessions.
      </p>
    </LegalPage>
  );
}
