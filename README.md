# جامع — Independent Hybrid Marketplace (Live Preview)

**Status:** Interactive public prototype. **Not a commercial live store.**

## Preview
https://jame3-independent-marketplace-preview.onrender.com

## Scope
This is a completely independent third project. It does **not** use code, accounts, databases, branding, inventory, or customer information from T.ONE or PROTOS.

The published `index.html` is a self-contained version of the previously built storefront preview, including its CSS and JavaScript. It contains fictional brands and demo products, category filtering/search, a client-side cart and a simulated per-seller order breakdown.

There is **no real checkout**, payment collection, shipping integration, seller onboarding, shared production database or admin finance dashboard. No client-side cart amount should ever be trusted for real orders.

## Render
- Service: `jame3-independent-marketplace-preview`
- Publish command: `mkdir -p dist && cp index.html dist/index.html`
- Publish directory: `dist`
- Automatic deployment on updates to `main`.

## Local preview
Serve the repository as static files, e.g. `python3 -m http.server 4173`, then visit http://localhost:4173.

## Next production milestones
1. Bring the modular application source, unit tests and initial Postgres migrations into this repository.
2. Provision a **new dedicated** Supabase organization/project; never use the existing T.ONE Supabase project.
3. Add authenticated seller/admin roles and restrictive tenant row-level security.
4. Implement authoritative inventory reservation and server-side pricing.
5. Integrate a compliant Egyptian marketplace payment provider and multi-seller settlements.
6. Add shipping aggregation, returns, audit trails, and end-to-end tests.

Working name «جامع» is not confirmed as a registered brand or domain.
