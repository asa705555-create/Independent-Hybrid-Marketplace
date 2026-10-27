# جامع (working title) — Independent Multi-Site Platform v0.3

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
