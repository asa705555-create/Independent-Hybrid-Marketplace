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


## v0.8 — Protected inventory insights without duplicating the Premium dashboard

The original dark-green/gold owner and tenant dashboards and their 17 analytics widgets remain intact. This incremental release fixes operational functionality, not the brand identity:

- Server-authorized inventory snapshot within the existing owner or tenant context: filtered catalog counts, stock units, low/out-of-stock products, and inventory book-value **estimate** in piasters (decimal string, avoiding JS integer overflow).
- Product-name search, site/branch selection and CSV download are evaluated **after** server-side permission, tenant, and plan checks. Tenant members cannot query other brands by changing scope, site or branch query parameters.
- A spreadsheet-formula-safe CSV inventory export contains only authorized sites and products; no sessions, emails, passwords, API keys or private financial records.
- Multiple-site picker preserves choices through language switches, and search safely refreshes the authorized API with protection against late responses.
- Public previews remain fictional. Date-range selection controls sample commerce charts only; real stock is a current snapshot, not historical sales. Sample payment charts distinguish four payment channels rather than showing cost/profit proxies.
- A new inventory ribbon and the seven-column add-ons table extend the existing premium styling; mobile overflow is contained. Original owner command center, plan controls, and tenant permissions are not reimplemented.

### API and preview routes

- `GET /api/erp/context?scope=owner|tenant&site=<slug>&q=<name>&branch_id[]=<site-id>` — authorized JSON.
- `GET /api/erp/inventory.csv?...` — same access policy; download only when authenticated.
- `/demo/erp?view=owner` and `/demo/erp?view=brand` — public **fictional design previews**.
- `/owner/erp` and `/dashboard/:slug/erp` — protected dashboards, not public preview shortcuts.

See [ERP v0.8 security and testing notes](docs/ERP_V08.md). No real payments, orders, invoices, shipping provider or durable production database is integrated by this release. Demo Render instances use disposable preview storage; do not store real customer data.
