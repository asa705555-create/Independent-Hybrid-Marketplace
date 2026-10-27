-- INDEPENDENT HYBRID MARKETPLACE SCHEMA (v0.1)
-- Apply ONLY to a NEW, dedicated Supabase project. Never run against existing brands' projects.
-- This migration creates an isolated multi-seller base; NOT a completed payments or tax engine.
create extension if not exists pgcrypto;

create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','support','finance','fulfillment')),
  created_at timestamptz not null default now()
);
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  legal_name text not null,
  entity_type text not null check (entity_type in ('individual','company')),
  tax_registration text,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending','approved','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.seller_memberships (
  seller_id uuid not null references public.sellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','catalog','finance','fulfillment')),
  created_at timestamptz not null default now(),
  primary key (seller_id,user_id)
);
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null,
  description text not null default '',
  logo_url text,
  state text not null default 'draft' check (state in ('draft','active','suspended')),
  created_at timestamptz not null default now(),
  unique (id,seller_id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  brand_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null,
  description text not null default '',
  category text not null,
  state text not null default 'draft' check (state in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  foreign key (brand_id,seller_id) references public.brands(id,seller_id) on delete restrict,
  unique (seller_id,slug), unique (id,seller_id)
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  product_id uuid not null,
  sku text not null,
  color text,
  size text,
  price_piasters bigint not null check (price_piasters>=0),
  state text not null default 'active' check (state in ('active','unavailable')),
  foreign key (product_id,seller_id) references public.products(id,seller_id) on delete restrict,
  unique (seller_id,sku), unique (id,seller_id)
);
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  label text not null,
  location_reference text,
  unique (id,seller_id)
);
create table public.inventory_balances (
  variant_id uuid not null,
  warehouse_id uuid not null,
  seller_id uuid not null,
  on_hand integer not null default 0 check (on_hand>=0),
  reserved integer not null default 0 check (reserved>=0),
  updated_at timestamptz not null default now(),
  check (reserved<=on_hand),
  primary key (variant_id,warehouse_id),
  foreign key (variant_id,seller_id) references public.product_variants(id,seller_id) on delete restrict,
  foreign key (warehouse_id,seller_id) references public.warehouses(id,seller_id) on delete restrict
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  variant_id uuid not null,
  warehouse_id uuid not null,
  quantity_delta integer not null check (quantity_delta<>0),
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now(),
  foreign key (variant_id,warehouse_id) references public.inventory_balances(variant_id,warehouse_id)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  display_number bigint generated always as identity unique,
  status text not null default 'pending' check (status in ('pending','payment_pending','paid','fulfilling','completed','cancelled')),
  currency text not null default 'EGP' check (currency='EGP'),
  items_total_piasters bigint not null check (items_total_piasters>=0),
  shipping_piasters bigint not null default 0 check (shipping_piasters>=0),
  created_at timestamptz not null default now(),
  idempotency_key text unique
);
create table public.seller_orders (
  id uuid primary key default gen_random_uuid(),
  parent_order_id uuid not null references public.orders(id) on delete restrict,
  seller_id uuid not null references public.sellers(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','packed','shipped','delivered','cancelled','returned')),
  items_total_piasters bigint not null check (items_total_piasters>=0),
  created_at timestamptz not null default now(),
  unique (parent_order_id,seller_id), unique (id,seller_id)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  seller_order_id uuid not null,
  seller_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity>0),
  unit_price_piasters bigint not null check (unit_price_piasters>=0),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  created_at timestamptz not null default now(),
  foreign key (seller_order_id,seller_id) references public.seller_orders(id,seller_id) on delete restrict,
  foreign key (variant_id,seller_id) references public.product_variants(id,seller_id) on delete restrict
);
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  parent_order_id uuid not null references public.orders(id) on delete restrict,
  carrier text,
  tracking_reference text,
  status text not null default 'draft' check (status in ('draft','ready','shipped','delivered','returned','cancelled')),
  created_at timestamptz not null default now()
);
create table public.shipment_items (
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity>0),
  primary key (shipment_id,order_item_id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  parent_order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  provider_reference text,
  amount_piasters bigint not null check (amount_piasters>0),
  status text not null default 'pending' check (status in ('pending','authorized','captured','failed','refunded')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  unique (provider,provider_reference)
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  amount_piasters bigint not null check (amount_piasters>0),
  status text not null default 'requested' check (status in ('requested','approved','processed','rejected')),
  provider_reference text,
  created_at timestamptz not null default now()
);
create table public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  sales_piasters bigint not null default 0,
  commission_piasters bigint not null default 0,
  adjustments_piasters bigint not null default 0,
  payout_piasters bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','approved','paid','held')),
  created_at timestamptz not null default now(),
  check (period_end>=period_start)
);
create table public.ledger_journals (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_kind,source_id)
);
create table public.ledger_postings (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.ledger_journals(id) on delete restrict,
  seller_id uuid references public.sellers(id) on delete restrict,
  account_code text not null,
  side text not null check (side in ('debit','credit')),
  amount_piasters bigint not null check (amount_piasters>0)
);
create table public.tax_profiles (
  seller_id uuid primary key references public.sellers(id) on delete cascade,
  registration_category text,
  tax_id text,
  vat_status text not null default 'unverified' check (vat_status in ('unverified','registered','not_registered')),
  invoice_integration_status text not null default 'not_connected',
  updated_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_brands_seller on public.brands(seller_id);
create index idx_products_brand_state on public.products(brand_id,state);
create index idx_variants_seller_product on public.product_variants(seller_id,product_id);
create index idx_orders_customer on public.orders(customer_id,created_at desc);
create index idx_seller_orders_seller on public.seller_orders(seller_id,created_at desc);
create index idx_items_seller_order on public.order_items(seller_order_id);
create index idx_settlements_seller on public.seller_settlements(seller_id,period_start);
create index idx_inventory_seller on public.inventory_balances(seller_id);
create index idx_audit_entity on public.audit_events(entity_type,entity_id,created_at);

-- RLS everywhere in public. Authenticated users get read-only scopes; no user-facing mutation rights.
do $$ declare t text; begin
  foreach t in array array[
    'platform_staff','sellers','seller_memberships','brands','products','product_variants',
    'warehouses','inventory_balances','inventory_movements','orders','seller_orders',
    'order_items','shipments','shipment_items','payments','refunds','seller_settlements',
    'ledger_journals','ledger_postings','tax_profiles','audit_events'] loop
      execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy staff_can_view_own on public.platform_staff for select to authenticated
  using (user_id=(select auth.uid()));
create policy seller_members_view_self on public.seller_memberships for select to authenticated
  using (user_id=(select auth.uid()) or exists (
    select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())
  ));
create policy sellers_view_scoped on public.sellers for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy public_active_brands on public.brands for select to anon,authenticated
  using (state='active'); -- Publish only after seller approval on the privileged server
create policy seller_own_brands on public.brands for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=brands.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy public_active_products on public.products for select to anon,authenticated
  using (state='active' and exists(select 1 from public.brands b where b.id=brand_id and b.state='active'));
create policy seller_own_products on public.products for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=products.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy public_active_variants on public.product_variants for select to anon,authenticated
  using (state='active' and exists(select 1 from public.products p where p.id=product_id and p.state='active'
    and exists(select 1 from public.brands b where b.id=p.brand_id and b.state='active')));
create policy seller_own_variants on public.product_variants for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=product_variants.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy warehouses_seller_read on public.warehouses for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=warehouses.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy inventory_seller_read on public.inventory_balances for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=inventory_balances.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy inventory_movements_seller_read on public.inventory_movements for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=inventory_movements.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy orders_customer_read on public.orders for select to authenticated
  using (customer_id=(select auth.uid()) or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy seller_orders_scoped_read on public.seller_orders for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=seller_orders.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.orders o where o.id=parent_order_id and o.customer_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy order_items_scoped_read on public.order_items for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=order_items.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.seller_orders so join public.orders o on o.id=so.parent_order_id
      where so.id=order_items.seller_order_id and o.customer_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy shipments_customer_staff_read on public.shipments for select to authenticated
  using (exists(select 1 from public.orders o where o.id=parent_order_id and o.customer_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy shipment_items_customer_staff_read on public.shipment_items for select to authenticated
  using (exists(select 1 from public.shipments sh join public.orders o on o.id=sh.parent_order_id
    where sh.id=shipment_id and o.customer_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy settlements_seller_read on public.seller_settlements for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=seller_settlements.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy tax_profiles_seller_read on public.tax_profiles for select to authenticated
  using (exists(select 1 from public.seller_memberships sm where sm.seller_id=tax_profiles.seller_id and sm.user_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy payments_customer_read on public.payments for select to authenticated
  using (exists(select 1 from public.orders o where o.id=parent_order_id and o.customer_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));
create policy refunds_customer_read on public.refunds for select to authenticated
  using (exists(select 1 from public.payments p join public.orders o on o.id=p.parent_order_id where p.id=payment_id and o.customer_id=(select auth.uid()))
    or exists(select 1 from public.platform_staff ps where ps.user_id=(select auth.uid())));

-- Explicit table grants are still needed for the Data API. No client INSERT/UPDATE/DELETE.
grant usage on schema public to anon,authenticated;
grant select on public.brands,public.products,public.product_variants to anon;
grant select on public.platform_staff,public.sellers,public.seller_memberships,
  public.brands,public.products,public.product_variants,public.warehouses,
  public.inventory_balances,public.inventory_movements,public.orders,
  public.seller_orders,public.order_items,public.shipments,public.shipment_items,
  public.payments,public.refunds,public.seller_settlements,public.tax_profiles
  to authenticated;
-- No client grant for audit events, financial journals or postings; server-only.
-- Provision the first platform owner through a reviewed privileged migration or server tool, not client-side.
