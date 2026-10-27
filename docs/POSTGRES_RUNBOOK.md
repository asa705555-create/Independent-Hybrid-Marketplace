# PostgreSQL control-plane migration — Jame3 v0.6

## Isolation & rollout policy

This is a **third independent project**. Never point `DATABASE_URL` at an existing T.ONE / PROTOS / marketing database or reuse their credentials. Keep billing, deployment, passwords, MFA and storage separate. The SQL schema used here is `jame3_private`; the older `supabase/migrations/` files are **not** the same migration path, must not be mixed with it, and are kept only as historical design references.

**The free Render Postgres database expires after 30 days, has no backup service and is NOT production-durable.** Its only permissible role in this release is a disposable integration-testing database. Upgrade only after obtaining approval for a non-zero charge and implementing automated backups and restore rehearsals. No customer, payment or personal data should be entered in the free staging database.

## Production design

- Node.js backend uses PostgreSQL with the pinned `pg` dependency; browser receives NO database credentials.
- Set `DATABASE_URL` in the private Render environment, not in GitHub, HTML or JS.
- Apply `npm run db:migrate` with a dedicated authorized database role as an explicit deployment operation. Migration checksum ledger ensures applied migrations cannot silently change; serializes migrations with an advisory transaction lock.
- Runtime `OWNER_EMAIL`, `OWNER_PASSWORD` (minimum 20 characters) are only used to bootstrap the first owner. **Existing PostgreSQL owner passwords are never overwritten on restart.** Configure independent MFA with `OWNER_TOTP_SECRET` before production startup.
- `PUBLIC_ORIGIN` must exactly match the HTTPS service domain, no trailing path, and `NODE_ENV=production` ensures Secure cookies + HSTS. `DATABASE_URL` takes precedence over `DEMO_EPHEMERAL`.
- The app refuses to start without `DATABASE_URL` unless `DEMO_EPHEMERAL=1` is explicitly enabled, and the `/ready` endpoint responds with 503 if PostgreSQL is unhealthy.
- Owners can manage sites and plans, while staff queries are filtered by their site membership; sensitive changes are audited. There is **no real checkout or billing**.

## Commands (run on an authorized isolated environment only)

```bash
npm install --ignore-scripts
npm run check
npm test
# Explicitly configure DATABASE_URL and other environment values privately first:
npm run db:migrate
npm start
```

For Render deploys: if the Render service is configured with `DATABASE_URL`, run `npm run db:migrate` in the build or pre-deploy command **after validating this database is dedicated to Jame3**. The web service must not launch against an unmigrated database. Separate read-only runtime role from privileged migration role before full production launch.

## Operational checks

- `/health` means the Node server process is answering. `/ready` verifies DB connectivity.
- Check create-site, plan downgrade/quota enforcement, invite replay prevention, 2FA replay, tenant isolation and redeploy persistence on staging before accepting customers.
- Verify backup encryption, retention, restore tests, credentials rotation, alerting and audit logs before paid launch.
- Protect migration credentials, configure database network access restrictions and prepare incident-response contacts.
- Free database expiration means test data can be lost and production rollout MUST NOT assume durability.

## Current limitations

This version exposes a dedicated async Postgres adapter and schema but does **not** implement tenant row-level security at the Postgres role level, billing provider webhooks, tokenized payments, 3-D Secure, VAT invoicing, outbound email, custom domain verification, production data backups, disaster recovery, or professional penetration testing. The service enforces tenant membership on the server. A separate least-privileged runtime DB role and independently verified RLS policies are required before production.
