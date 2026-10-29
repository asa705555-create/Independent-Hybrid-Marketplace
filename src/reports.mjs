/** CSV reporting: export only non-sensitive operational site metadata.
 * Never expose this endpoint without the owner gate in the HTTP router.
 */
import {plans} from './security.mjs';

export function safeCsvCell(value) {
  let text=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ');
  // Spreadsheet apps may execute cells starting with formula metacharacters;
  // strip leading space and neutralize these before wrapping the CSV cell.
  if (/^[\s]*[=+\-@]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function sitesCsv(sites,stats={}) {
  const headers=['Site slug','Site name','Plan','Status','Products','Staff','Plan price EGP (proposal only)'];
  const rows=sites.map(s=>[
    s.slug,s.name,plans[s.plan]?.label||s.plan,s.status,
    stats.bySite?.[s.id]?.products||0,stats.bySite?.[s.id]?.staff||0,
    plans[s.plan]?.price||0
  ]);
  return '\uFEFF'+[headers,...rows].map(row=>row.map(safeCsvCell).join(',')).join('\r\n')+'\r\n';
}

/** Export only already-authorized, filtered catalog entries; amounts are stock value estimates, never sales. */
export function inventoryCsv(context){
  const sites=new Map(context.sites.map(site=>[site.id,site.name]));
  const head=['Site','Product','Stock units','Availability'];
  const lines=context.products.map(p=>[sites.get(p.siteId)||'',p.name,p.stock,p.stock===0?'Out of stock':p.stock<=5?'Low stock':'Available']);
  return '\uFEFF'+[head,...lines].map(row=>row.map(safeCsvCell).join(',')).join('\r\n')+'\r\n';
}
