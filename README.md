# جامع (working title) — Independent Multi-Site Platform v0.6

**Third independent project**, unrelated to every existing apparel-brand website, store, database or marketing system.

## What this build really does

- Public central **hub** with links to independent hosted sites, demo subscription tiers and a separate catalog demo.
- Securely gated **owner control panel**: add sites, change their plans, configure individual feature switches, suspend/reactivate sites and invite limited tenant staff.
- Unique public mini-sites at `/s/:slug` and tenant-scoped dashboards at `/dashboard/:slug`.
- Functional demo product catalog editor with verified integer minor-currency values and per-package limits.
- Login sessions and permission checks performed **on the server**, not a hidden JavaScript-only dashboard.
- Automated adversarial regression suite with tenant isolation, IDOR, CSRF, XSS output encoding, traversal attempts, token expiry/replay, input validation, login throttling and feature quota tests.

## Local run (Node 22.16+)

```bash
cp .env.example .env   # fill private credentials
# Set these variables in your shell or run with an env loader; no dependencies installed:
DEMO_EPHEMERAL=1 DEMO_SEED=1 PORT=3000 PUBLIC_ORIGIN=http://localhost:3000 \
OWNER_EMAIL=owner@example.invalid OWNER_PASSWORD='your-private-random-20+-characters' \
node src/server.mjs
```

- Main hub: `http://localhost:3000/`
- Owner sign-in: `http://localhost:3000/login` then `/owner`
- Site demo: `/s/atelier-demo`
- Existing cart preview: `/marketplace/`

Run `npm run check && npm test` before deploying.

## CRITICAL: data is NOT permanent on preview

`node:sqlite` stores preview data in process memory by default, and Render's free runtime filesystems are ephemeral. Any instance restart **can reset sites, product edits, invitations and accounts**. Do not invite real external brands or put customer/financial data in it. A new dedicated production-grade database and resilient storage adapter are required before release.

## Financial operations

Displayed package fees are **proposal numbers**, not agreed prices or collected subscriptions. Billing, payouts, taxes, checkout, payment providers, shipping and real customer orders remain intentionally disabled.

## Existing production preview preservation

The original root `index.html` remains untouched when this app is pushed to the existing GitHub repository, so the old Render **static** demo keeps working. The new server app is deployed as a **separate Render web service**. No existing T.ONE/PROTOS resource should be modified or referenced.

## Documentation

Read [Architecture and security limits](docs/ARCHITECTURE.md). Apply the proposed `supabase/` migrations **only** to a NEW independent Supabase instance after review; never to another project's DB.

## v0.4 — Premium command center (development)

This release adds a premium, responsive **owner command center** with:

- Real counts of sites, live vs suspended status, tenant products, memberships and pending invitations, calculated on the server from the demo database.
- Site search, package-distribution charts based on real counts, detailed site roster, one-click navigation to tenant dashboards, and create-site form.
- Dedicated panels for plans/limits, tenant staff, audit history, security posture and a **clearly labeled** roadmap for sales, fulfillment, payment, CRM, marketing, custom domains and monitoring.
- A strictly owner-only CSV operational report with spreadsheet-formula injection mitigation. The report never contains passwords, tokens or customer data.
- A refined public homepage and tenant dashboard color system, light decorative CSS animations and `prefers-reduced-motion` support.
- **No new authentication shortcut.** All owner/tenant privileges, payments (disabled), and plan limits remain server-validated.

This is an **ephemeral preview**, not a production-grade SaaS. Do not store sensitive customer data, real financial records, or issue live subscriptions. A dedicated durable database, MFA, billing, monitoring, secure multi-tenant domain routing and an independent professional security review must precede launch.

Run `npm run check && npm test` after edits. The `tests/owner-console.test.mjs` cases verify owner-only reporting, count accuracy, injection mitigation and no-store/security headers.

## v0.5 — Owner MFA + safer operational tooling (feature branch)

- Configurable **owner TOTP (RFC6238)**; when a private `OWNER_TOTP_SECRET` is set the owner needs both password and a fresh 6-digit code.
- One-time TOTP step enforcement in the preview DB, cross-account/address login throttling and a protected **revoke all owner sessions** control.
- A read-only SQLite snapshot tool for local preview backups and a verified restore test. This is **not** durable Render production storage.
- Detailed setup and limitations: [`docs/SECURITY_OPERATIONS.md`](docs/SECURITY_OPERATIONS.md).
- Existing v0.4 previews need to rotate any previously disclosed passwords. The new release should use **brand-new secrets** stored only in private Render environment settings.
- **Still not a production release**. A dedicated permanent Postgres service and proper identity/recovery and payments remain unfinished; no paid service was provisioned by this release.


## v0.6 — Dedicated PostgreSQL staging support

- Added a standalone async PostgreSQL adapter (`src/postgres-store.mjs`) so each site, account, session, product, invitation and audit event can persist in its **own isolated database**.
- Added a migration with immutable checksums and advisory locking (`db/001_postgres_control_plane.sql`, `scripts/migrate-postgres.mjs`). The PostgreSQL schema is separate from the old Supabase design draft.
- All application routes now await the store, so the SQLite preview works unchanged and the same routes can use PostgreSQL. Runtime rejects a missing database unless `DEMO_EPHEMERAL=1` is set for a test preview.
- New `/ready` endpoint checks database health; PostgreSQL bootstraps the owner once, preserving credentials across deployments; production PostgreSQL requires MFA.
- Expanded tests exercise async routes, parameter binding, transaction/lock behavior and immutable migrations. No real payments or shipping have been enabled.
- **Render's Free PostgreSQL is a 30-day disposable test database**, not durable production storage. No automatic backups; upgrade and get a separately approved price before live users.

For the safe setup sequence and restrictions see [Postgres Runbook](docs/POSTGRES_RUNBOOK.md).

## v0.7 — Premium ERP analytics added to both control panels

The existing **green/gold Premium owner dashboard is unchanged**; analytics is a **new reusable, same-brand screen** linked from it. Existing site creation, roles, plans, catalog, audit and MFA are not reimplemented.

- `/owner/erp`: private Super Admin analytics across accessible hosted sites, with site/branch filters.
- `/dashboard/:slug/erp`: private per-brand analytics, with server-enforced tenant membership and an active `analytics` plan entitlement. Other brands' data cannot be requested through a different slug or modified query parameters.
- `/demo/erp`: public **fictional demo only**, using no customer or production data; useful for design review without issuing administrative credentials.
- 17 optional widgets matching the supplied Arabic dashboard functional specifications: KPIs, weekly comparisons, area/donut charts, product rankings, geographic bars, orders, expenses, invoice trends, payment methods, top sellers and add-ons.
- Interactive date range, branch selector, product search, Arabic/English direction switch, widget hide/show, drag ordering, resize widths, reset and scoped localStorage preferences.
- Real data adapter (`/api/erp/context`) reports actual tenant-local product totals. All other commerce widgets show empty state until real sales/orders are integrated. The sample mode uses conspicuously **fictional** data generated only in the client.
- Original owner-console visual colors (`#102b25`, moss green, warm gold), typography, sidebar treatment and radii are retained via `public/owner-console.css` and additive `public/erp-dashboard.css`.
- Server-side authorization, no-store private responses, CSP and same-origin JavaScript. The public demo has no admin endpoints.

### Testing

```bash
npm run check
npm test
```

Tests cover 17-widget registry, role and package authorization, cross-tenant IDOR attempts, forged branch filters, parameter pollution, owner aggregation, content security policy, output encoding and file allowlisting.

### Deployment and known limits

For a free isolated preview, set `DEMO_EPHEMERAL=1`, `DEMO_SEED=1`, a **unique** 20+-character owner password (not in Git), `PUBLIC_ORIGIN` to the deployment URL and `NODE_ENV=production`. Free-preview storage is disposable. Do **not** use fake ERP sales as a source of financial decisions. No real billing/receipts/payment provider is enabled.

### Live design-preview links (no login and no real data)

- Owner visual preview: `https://jame3-erp-design-preview-v07.onrender.com/?view=owner`
- Brand visual preview: `https://jame3-erp-design-preview-v07.onrender.com/?view=brand`

These links only toggle the labels and navigation context of the public **fictional demo**. They do not grant owner or tenant access. The protected application routes remain `/owner/erp` and `/dashboard/:slug/erp` and require a private server with real authentication and per-brand authorization.

## v0.8 — Scoped, consistent demonstration analytics (non-production)

- Retains the **existing Premium green/gold design**, routes, owner and brand auth, plans and other functionality. No redesign or brand merge.
- Fixes the owner/brand **preview switch links** so they open `/demo/erp?view=...` rather than accidentally returning to the marketplace homepage. Only the expressly configured preview service has the option `ERP_PUBLIC_PREVIEW=1` to show the demo dashboard on `/`. Other services retain the public hub.
- Moves all fictional analytics into the testable, deterministic, isolated client fixture `public/erp-demo-data.mjs`. KPIs, invoices, charts, payment-method splits, top products/users, and expenses all derive from individual sample rows. Date, brand and product filters now filter records rather than scaling headline numbers.
- **Demo brand view** is restricted to one fictional site, while demo owner view can filter the three fictional sites. URL role switching is only a design preview; actual auth checks in `/owner/erp`, `/dashboard/:slug/erp` and `/api/erp/context` are unchanged. No private tenant records are exposed to the public demo.
- Improves reusable analytics widgets: ranking variant selector actually groups products, payment series reflects separate payment methods, yearly payment chart uses relevant transactions, and local layout settings use separate keys for owner versus brand demo.
- For real authenticated dashboards: only the product count and scoped product names are operational. Billing, money, customer and order figures stay **empty/unconnected** unless a source is integrated; no demo totals are ever silently promoted to production figures.
- Adds 14 fixture/auth test cases and Chromium rendering checks (desktop/mobile). This is **not** a production penetration test or a real payments integration.

**IMPORTANT:** The GitHub repository is currently public; all data here is fictional and contains no production credentials. For production, create an approved dedicated backed-up PostgreSQL, independent storage, real RLS and durable auth audit before onboarding external brands or collecting money.
