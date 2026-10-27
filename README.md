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
