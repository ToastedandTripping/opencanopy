# Production Audit: OpenCanopy — 2026-06-05
**Score: 73/100 · Grade: B · branch refresh/2026-06-02**

Inline multi-domain audit (subagent dispatch was unavailable; orchestrator ran all
domains directly). Audited: Ted (code), Razor (security), Quinn (perf), Jen (UX/a11y),
Charity (devops), Petra (privacy). DB/payments N/A (static public map).

## Executive summary
No FAILs. The app is safe to ship and the code-refresh diff is clean (independent
review gate already PASSed it). Findings are pre-existing hardening items — none are
introduced by the refresh and none block the merge. The standouts: the WFS proxy has
no rate limiting, there's no CI pipeline, and there's an analytics tracker with no
privacy notice. The one "high" npm advisory (Next.js middleware bypass) is **not
exploitable** in a static export (no server/middleware).

## Domain verdicts
| Domain | Verdict | Notes |
|--------|---------|-------|
| Ted (code) | PASS | Build clean, 427 tests green, 2 `as any`, 2 `console.log`. Solid. |
| Razor (security) | WARN | Proxy is well-built (no SSRF/injection/leak) but unthrottled; dep bumps; no CSP. |
| Quinn (perf) | WARN | 1.9 MB JS (1 MB = maplibre, the WebGL floor; ~300 KB gzip). conservation-priority still province-scale. |
| Jen (UX/a11y) | WARN | Keyboard coverage gaps; WFS silent-fail has no error UI. |
| Charity (devops) | WARN | No CI/CD; no monitoring. Strong headers + atomic deploys otherwise. |
| Petra (privacy) | WARN | Analytics tracker with no privacy notice/consent. |

## What's genuinely good (don't touch)
- **WFS proxy edge function** (`netlify/edge-functions/wfs-proxy.ts`): `layer` is allowlisted against a fixed `LAYER_CONFIG` (no SSRF); bbox/point/zoom are parsed to numbers, clamped, and rounded before query injection (no CQL injection); errors return generic messages, detail only to server logs (no leakage); 7-day cache, 3× retry with backoff, feature-count caps by zoom.
- **Security headers** (`netlify.toml`): HSTS w/ preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. Cache headers correct (immutable static, 7-day tiles + CORS).
- **Secrets**: clean in source and full git history; `.env` gitignored; `.env.example` placeholder-only.
- **deploy-tiles.sh**: idempotent (size check), `set -euo pipefail`, validates inputs.

## WARN items (remediation, in rough priority)
1. **WFS proxy has no rate limiting** (`wfs-proxy.ts`) — a caller can hammer `/api/wfs`, driving Netlify edge invocations and load on the BC gov upstream (which could block the proxy). *Fix:* per-IP token bucket (Netlify edge + KV) or a short per-IP cap; or cache-key throttle.
2. **No CI/CD** (no `.github/workflows`) — tests/build/`npm audit` are not gated on push/PR; deploy is manual. *Fix:* a GH Action running `npm test` + `npm run build` on PR; optionally `npm audit --audit-level=high`.
3. **Analytics tracker, no privacy notice** (`layout.tsx:69`) — `ssc-ops` tracker collects visitor data with no privacy policy or consent. PIPEDA expects a notice if personal data (e.g. IP) is collected. *Fix:* add a short privacy page/footer link; confirm the tracker is anonymized/cookieless.
4. **Runtime dep advisories** — `next` 16.2.0 → 16.2.7 (the "high" is a static-export non-issue but bump anyway); `npm audit fix` clears the maplibre→protocol-buffers-schema moderate (not on the runtime decode path). *Fix:* `npm i next@16.2.7 && npm audit fix`.
5. **WFS silent-fail has no error UI** (`DataLayer.tsx:990`) — already on the Bucket-B list; users can't tell "no data here" from "BC server down."
6. **conservation-priority (258K fill) has no raster fallback** — far milder than the now-fixed logging-risk 6.2M; monitor low-zoom perf.
7. **Keyboard a11y coverage** — `onClick` handlers in 8 component files, `onKeyDown` in 1; verify non-`<button>` click targets have keyboard equivalents + focus states.
8. **No CSP header**, **no SRI on the third-party tracker script**, **no error monitoring** — defense-in-depth / ops-visibility, minor for a static site.

## Trend
First production audit for this project.

## Merge decision
**Safe to merge.** Zero FAILs; the refresh diff is independently reviewed and green;
every WARN is a pre-existing hardening item, not a regression. Recommend landing the
refresh now and tracking the WARNs (rate limiting, CI, privacy notice, dep bumps) as
follow-up — most fit a single `/relay` pass.
