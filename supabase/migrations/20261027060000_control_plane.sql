-- JAME3 CONTROL PLANE / POSTGRES DESIGN - NOT YET APPLIED
-- Apply ONLY inside a NEW independent Supabase project, never T.ONE or PROTOS.
-- The private schema is not exposed to Supabase Data API. All writes require
-- a dedicated trusted server that verifies actor identity + role + entitlement.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS platform_private;
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC, anon, authenticated;

CREATE TABLE platform_private.platform_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_private.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_private.organization_users (
  organization_id uuid NOT NULL REFERENCES platform_private.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','manager','catalog','viewer')),
  PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE platform_private.plans (
  id text PRIMARY KEY,
  price_piasters bigint NOT NULL CHECK (price_piasters>=0),
  max_sites integer NOT NULL CHECK (max_sites>0),
  max_products_per_site integer NOT NULL CHECK(max_products_per_site>0),
  max_staff_per_site integer NOT NULL CHECK(max_staff_per_site>0),
  features jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE platform_private.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES platform_private.organizations(id) ON DELETE RESTRICT,
  plan_id text NOT NULL REFERENCES platform_private.plans(id),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','cancelled')),
  billing_provider_reference text UNIQUE,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_private.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES platform_private.organizations(id) ON DELETE RESTRICT,
  slug text UNIQUE NOT NULL CHECK(slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  tagline text NOT NULL DEFAULT '',
  accent text NOT NULL DEFAULT '#254d46',
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,organization_id)
);
CREATE TABLE platform_private.site_features (
  site_id uuid NOT NULL REFERENCES platform_private.sites(id) ON DELETE CASCADE,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(site_id,key)
);
CREATE TABLE platform_private.site_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 100),
  price_piasters bigint NOT NULL CHECK(price_piasters BETWEEN 0 AND 100000000000),
  stock integer NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(site_id,organization_id) REFERENCES platform_private.sites(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX idx_platform_site_products ON platform_private.site_products(site_id,created_at DESC);
CREATE TABLE platform_private.site_invitations (
  token_sha256 text PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES platform_private.sites(id) ON DELETE CASCADE,
  intended_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager','catalog','viewer')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_private.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id),
  site_id uuid REFERENCES platform_private.sites(id),
  event text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_audit ON platform_private.audit_events(site_id,created_at DESC);

-- Defense in depth: no client role can query even when a schema is exposed
-- accidentally in the future. Server must handle authorization and transactions.
DO $$
DECLARE table_name text;
BEGIN
  FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname='platform_private'
  LOOP
    EXECUTE format('ALTER TABLE platform_private.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE platform_private.%I FROM PUBLIC, anon, authenticated',table_name);
  END LOOP;
END $$;
-- IMPORTANT: This DDL is a forward migration design. It does NOT yet implement
-- authoritative checkout, billing webhooks or payment settlement.
