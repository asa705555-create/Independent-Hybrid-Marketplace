# Jame3 v0.8 — ERP inventory reporting and security acceptance

## Scope / invariants

- Isolated multi-brand project, no shared T.ONE or PROTOS resources.
- Keep the original Premium visual identity and **17 existing widgets**.
- `scope=owner` works for the authenticated owner only; `scope=tenant` works for a member with `view_reports` and the active `analytics` entitlement, or for the owner.
- Branch selections may only reduce owner-visible site sets; a tenant can never request any other site ID.
- CSV and JSON share one authorization and query-validation path. Numeric inventory valuation is an estimate, not realized revenue or cash.
- All demo sales, profits, invoices, customers, payment method breakdowns and user rankings remain clearly fictitious. No real transaction providers are connected.

## Automated checks

Run `npm run check && npm test` with Node 22.13+.

The ERP test suite covers tenant-scoped live product search, owner/tenant stock calculation, blocking cross-brand IDOR via both JSON and CSV, avoiding CSV formula execution, owner-only aggregate reporting, invalid date ranges, duplicate query parameters and oversized queries. Existing authentication, session, MFA, plan entitlement, CSRF, login throttle, and schema tests remain part of `npm test`.

## Deployment

Deploy a new free preview branch and link directly to `/demo/erp?view=owner` or `/demo/erp?view=brand`. Do not attach production payment methods or use a shared database. For a free Render preview set `DEMO_EPHEMERAL=1`, a unique private owner password, `NODE_ENV=production` and the canonical HTTPS `PUBLIC_ORIGIN`. Public previews use no real catalog/identity data.

**Not complete:** independent production penetration testing, production-grade backups, PostgreSQL RLS verified under a least-privileged runtime role, actual financial ledger/invoicing, authenticated multi-tenant analytics storage, commercial billing and shipping. 
