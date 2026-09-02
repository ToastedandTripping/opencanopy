import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | OpenCanopy",
  description: "Privacy policy and data collection practices for OpenCanopy.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0c] text-white">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors mb-12 block"
        >
          &larr; OpenCanopy
        </Link>

        <h1 className="text-2xl font-semibold text-white mb-2">Privacy</h1>
        <p className="text-sm text-zinc-400 mb-12">Last updated June 2026</p>

        <div className="space-y-10 text-sm text-zinc-400 leading-relaxed">
          <section>
            <h2 className="text-base font-medium text-zinc-200 mb-3">
              What we collect
            </h2>
            <p>
              OpenCanopy uses a small analytics script served from this site
              to understand how the map is used. It records page views (the
              page URL, title and referrer), scroll depth, time on page, basic
              interaction events (clicks, tab switches), and your screen and
              viewport size. Events are received by a function on
              ssc-ops.netlify.app, a server we also operate. Each session is
              assigned a random ID that resets when you close your browser
              tab. No cookies are set. No IP addresses are stored. No data is
              sent to Google, Meta, or any third-party ad network.
            </p>
            <p className="mt-3">
              The session ID is stored in{" "}
              <code className="text-zinc-300 bg-white/5 px-1 py-0.5 rounded text-xs">
                sessionStorage
              </code>{" "}
              only — it does not persist across browser sessions and is not
              synchronized across devices.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-zinc-200 mb-3">
              What we do not collect
            </h2>
            <ul className="space-y-1 list-disc list-inside text-zinc-400">
              <li>Names, email addresses, or contact information</li>
              <li>IP addresses or precise location</li>
              <li>Persistent identifiers or cross-session tracking</li>
              <li>Anything sold to or shared with advertisers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-zinc-200 mb-3">
              Data sources
            </h2>
            <p>
              All map data comes from publicly available BC Government datasets,
              including the BC Data Catalogue, the BC Freshwater Atlas, and the
              Vegetation Resources Inventory. OpenCanopy displays this data as
              an independent research tool.
            </p>
            <p className="mt-3 text-zinc-400">
              OpenCanopy is not affiliated with or endorsed by the Province of
              British Columbia.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-zinc-200 mb-3">
              Open source
            </h2>
            <p>
              The full source code — including the analytics tracker
              (public/tracker.js) — is available on{" "}
              <a
                href="https://github.com/ToastedandTripping/opencanopy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white transition-colors underline underline-offset-2"
              >
                GitHub
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
