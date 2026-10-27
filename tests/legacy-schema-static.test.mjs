/** Static architectural checks only; NOT a live PostgreSQL/RLS security test. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261027000000_initial_schema.sql',import.meta.url),'utf8');
const required=['platform_staff','sellers','seller_memberships','brands','products','product_variants',
'warehouses','inventory_balances','inventory_movements','orders','seller_orders','order_items',
'shipments','shipment_items','payments','refunds','seller_settlements','ledger_journals',
'ledger_postings','tax_profiles','audit_events'];
test('every planned public table has RLS declared in the migration',()=>{
 for(const table of required){
  assert.match(sql,new RegExp(`create table public\\.${table}\\s*\\(`,'i'));
  assert.match(sql,new RegExp(`'${table}'`,'i'));
 }
 assert.match(sql,/enable row level security/i);
});
test('cross-seller foreign key boundaries are defined for products and order items',()=>{
 assert.match(sql,/foreign key \(brand_id,seller_id\) references public\.brands\(id,seller_id\)/i);
 assert.match(sql,/foreign key \(variant_id,seller_id\) references public\.product_variants\(id,seller_id\)/i);
 assert.match(sql,/foreign key \(seller_order_id,seller_id\) references public\.seller_orders\(id,seller_id\)/i);
});
test('payment idempotency, immutable order price snapshots and integer amounts appear in schema',()=>{
 assert.match(sql,/idempotency_key text not null unique/i);
 assert.match(sql,/unit_price_piasters bigint not null/i);
 assert.match(sql,/product_name_snapshot text not null/i);
});
