# Jame3 v0.3 — Independent Platform Architecture

> Owner portal + multi-site storefront generator + role-specific site workspaces.
> Independent of T.ONE, PROTOS, and every existing unrelated project.

## Three surfaces

1. `/` — public hub with featured hosted websites, subscription comparison and links to the older `/marketplace/` product demo. Not a real marketplace backend.
2. `/owner` — **server-protected** super-admin dashboard; cannot be opened without a valid signed-in owner session.
3. `/s/:slug` and `/dashboard/:slug` — website page and **server-protected** tenant dashboard. Only assigned site members can access the dashboard; no cross-tenant control.

## Architecture

- `src/server.mjs`: Node built-in HTTP router, authentication gates, origin and CSRF checks, server-rendered pages, fixed-path static serving.
- `src/store.mjs`: demo-only SQLite adapter with foreign keys, transactions, scoped queries and audit trail. On free Render, data is ephemeral.
- `src/security.mjs`: validation, password scrypt hashing, strict escaping, session and CSRF tokens, ACL, plan definitions.
- `src/templates.mjs`: server-side, escaped Arabic UI, with reusable components.
- `public/platform.css`: design tokens and responsive layouts.
- `public/{index.html,app.mjs,catalog.mjs,core.mjs,styles.css}`: original demo shop isolated as `/marketplace/`.
- `tests/`: guard/tenant/access/CSRF/form limits/password/invite and original cart tests.
- `supabase/migrations/`: proposed independent PostgreSQL schema. **Not deployed**.

## Security invariants

- No open registration; owner access bootstrapped ONLY through `OWNER_EMAIL` and `OWNER_PASSWORD` in private service configuration.
- Passwords hashed using scrypt with random salt; session cookies are random opaque values, stored hashed, HttpOnly+Secure over HTTPS, SameSite=Lax, 12-hour expiry.
- Owner rights always checked server-side; tenants scoped to `site_id`. Staff are never permitted to edit subscription plans, global sites, other tenants, or other users' accounts.
- CSRF secret tied to the authenticated session, Origin required for all POSTs.
- Requests limited to 10 KiB, duplicate parameter names rejected, path matching explicit, dynamic content encoded for HTML and attributes.
- Product prices are integer piasters; quantity and quotas checked under DB transactions. Sales checkout is **disabled**.
- Audit log for sensitive business changes; invites are random 256-bit tokens stored SHA-256 and one-use with 24h expiry.
- Security headers: CSP, anti-framing, MIME sniffs prevented, referrers removed, permission restrictions, no-store on authenticated pages.
- No secrets or customer data in publicly visible JS or git.

## Limitations before real SaaS launch

This version is a working **preview**, NOT a production SaaS. Required next:

1. Provision **dedicated** independently billed Postgres database and run reviewed migrations; no free ephemeral local DB for actual tenants.
2. Separate identity provider with MFA/WebAuthn for super admin, passkeys or TOTP, account recovery, real email delivery, credential rotation, session revocation.
3. Organization-level subscriptions/seat accounting, webhook-verified payments, dunning, quotas, central ledger and invoices. **Plan prices are placeholders.**
4. Tenant-isolation RLS test in dedicated DB, schema grants, privileged role boundaries.
5. Distributed rate limits and brute-force protection behind trusted proxies; abuse monitoring and captcha strategy.
6. Real products, photo storage, uploads scanning, secure admin actions + CSRF; sites custom domains + DNS ownership verification + automatic TLS.
7. Pentest by a qualified reviewer on a scoped staging instance; dependency auditing, SAST/DAST, incident response, backup/restore tests, access audit.
8. Operational guarantees and data retention/privacy compliance.

This release does not assert that any security audit proves the absence of exploitable vulnerabilities.
