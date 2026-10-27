-- Jame3 control plane (independent database ONLY; never run on T.ONE or PROTOS).
-- PostgreSQL 15+. This schema is not used by the Supabase Data API.
CREATE SCHEMA IF NOT EXISTS jame3_private;
REVOKE ALL ON SCHEMA jame3_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS jame3_private.users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE,
 salt text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','member')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jame3_private.owner_mfa_replay (
 user_id uuid PRIMARY KEY REFERENCES jame3_private.users(id) ON DELETE CASCADE,
 last_step bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS jame3_private.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES jame3_private.users(id) ON DELETE CASCADE,
 csrf_secret text NOT NULL, expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON jame3_private.sessions(expires_at);
CREATE TABLE IF NOT EXISTS jame3_private.sites (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
 name text NOT NULL, tagline text NOT NULL DEFAULT '', accent text NOT NULL,
 plan text NOT NULL CHECK(plan IN ('starter','growth','scale')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jame3_private.memberships (
 site_id uuid NOT NULL REFERENCES jame3_private.sites(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES jame3_private.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('manager','catalog','viewer')),
 PRIMARY KEY(site_id,user_id)
);
CREATE TABLE IF NOT EXISTS jame3_private.site_feature_overrides (
 site_id uuid NOT NULL REFERENCES jame3_private.sites(id) ON DELETE CASCADE,
 feature text NOT NULL, enabled boolean NOT NULL,
 PRIMARY KEY(site_id,feature)
);
CREATE TABLE IF NOT EXISTS jame3_private.products (
 id uuid PRIMARY KEY, site_id uuid NOT NULL REFERENCES jame3_private.sites(id) ON DELETE CASCADE,
 name text NOT NULL, price_piasters bigint NOT NULL CHECK(price_piasters BETWEEN 0 AND 100000000000),
 stock integer NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_site_idx ON jame3_private.products(site_id,created_at DESC);
CREATE TABLE IF NOT EXISTS jame3_private.invitations (
 token_hash text PRIMARY KEY, site_id uuid NOT NULL REFERENCES jame3_private.sites(id) ON DELETE CASCADE,
 email text NOT NULL, role text NOT NULL CHECK(role IN ('manager','catalog','viewer')),
 expires_at bigint NOT NULL, used_at bigint,
 created_by uuid NOT NULL REFERENCES jame3_private.users(id)
);
CREATE INDEX IF NOT EXISTS invitations_site_idx ON jame3_private.invitations(site_id);
CREATE TABLE IF NOT EXISTS jame3_private.audit_events (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES jame3_private.users(id),
 site_id uuid REFERENCES jame3_private.sites(id),
 event text NOT NULL, meta jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_site_idx ON jame3_private.audit_events(site_id,created_at DESC);
-- The DB credential is exclusively server-side. Never grant access to browser roles.
REVOKE ALL ON ALL TABLES IN SCHEMA jame3_private FROM PUBLIC;
