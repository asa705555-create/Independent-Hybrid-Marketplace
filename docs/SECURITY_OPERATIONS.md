# Jame3 security & preview operations v0.5

This is an **independent project**. Never reuse T.ONE/PROTOS credentials or storage.

## Owner two-factor login
- Generate 20+ random bytes in a trusted location, Base32-encode them without padding. A local example: `python -c "import secrets,base64;print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip('='))"`.
- Put the resulting key in a **private Render** `OWNER_TOTP_SECRET` environment variable, **not** in GitHub.
- Enroll this key in an authenticator (TOTP, SHA1, 6 digits, 30 seconds); configure a new 20+ character `OWNER_PASSWORD`.
- When configured, the server requires both the password and the TOTP code. The last accepted step is stored atomically to reject replay. The server rejects malformed secret values on startup rather than silently disabling MFA.
- MFA presently covers the owner only. Configure independent identity-provider authentication/MFA/recovery for staff before onboarding real customers.
- Use the owner-only, CSRF-protected control to revoke every owner session. If the authenticator is lost, recovery requires private configuration rotation; there is no public recovery bypass.

## Demo backup and restore
Run `DB_FILE=./data/jame3-demo.sqlite npm run backup:demo -- ./private-backups/backup.sqlite` against a local file-backed SQLite preview.
The destination must not already exist. The snapshot is consistent, saved with `0600` permissions, and validated in the automated restore test.
Backups contain hashed credentials and tenant information; encrypt and protect them.
**This does not make Render's ephemeral free disk durable.** A dedicated permanent PostgreSQL instance, restoration drill, access control, and monitoring are needed before paid usage.

## Security boundaries
- Server-side owner/tenant permissions, tenant-filtered queries, transaction-enforced package limits.
- Session cookies HttpOnly, Secure in production; CSRF plus strict Origin checks.
- Account, address, and account+address sign-in throttles. These limits are in-memory; they are NOT a distributed WAF and need a trusted-proxy deployment configuration.
- XSS output escaping, strict form validation, audit log, invitation one-time use.
- Payment and fulfillment workflows are disabled, not simulated as production transactions.

CI includes abuse regression checks, TOTP RFC vectors, drift, replay, session revocation and SQLite backup/restore. They are *not* a professional penetration test or evidence of absence of vulnerabilities.
For real launch: dedicated database and RLS isolation tests, MFA for invited staff, audited billing and signed webhooks, backups, staging DAST, observability and incident response.

The GitHub repository is currently **public**. Do not upload credentials, private backups or customer data.
