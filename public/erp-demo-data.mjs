/**
 * Deterministic, fictional Egyptian-retail fixture for PUBLIC design previews.
 * No API keys, PII, production data or backend permissions are imported here.
 * Aggregates derive from individual sample invoice rows rather than adjusting
 * arbitrary totals when filters change. NEVER use these figures for billing.
 */
export const DEMO_SITES=Object.freeze([
  {id:'sample-0',name:'Atelier — القاهرة',slug:'atelier-demo'},
  {id:'sample-1',name:'Nova Studio — الجيزة',slug:'nova-demo'},
  {id:'sample-2',name:'Atlas Goods — الإسكندرية',slug:'atlas-demo'}
]);
export const DEMO_PRODUCTS=Object.freeze([
  {id:'hoodie',name:'هودي قطن بريميوم',category:'ملابس',price:1350},
  {id:'tee',name:'تيشيرت أساسي',category:'ملابس',price:550},
  {id:'pants',name:'بنطلون رياضي',category:'ملابس',price:990},
  {id:'linen',name:'قميص كتان',category:'ملابس',price:1200},
  {id:'bag',name:'شنطة قماش',category:'إكسسوارات',price:380},
  {id:'shoes',name:'حذاء يومي',category:'أحذية',price:1750}
]);
const STATUSES=['جديد','قيد التجهيز','تم الشحن','تم التسليم','ملغي'];
const METHODS=['cash','card','wallet','bank'];
const LOCATIONS=['القاهرة','الجيزة','الإسكندرية','المنصورة','طنطا'];
const ADDONS=['تغليف هدية','توصيل سريع','إضافة مخصصة'];
const STAFF=['مسؤول المبيعات','مسؤول الفرع','فريق الطلبات'];
const dateISO=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const add=(rows,name,value)=>{if(!rows.has(name))rows.set(name,0);rows.set(name,rows.get(name)+value);};
const total=(rows,key)=>rows.reduce((acc,row)=>acc+row[key],0);
const grouped=(rows,key,value='sales')=>{
 const sums=new Map();
 for(const row of rows)add(sums,row[key],row[value]);
 return [...sums].map(([name,amount])=>({name,value:Math.round(amount)})).filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
};
/** Fixed invoice generator, anchored to the selected calendar year. */
export function demoInvoices(year){
 if(!Number.isSafeInteger(year)||year<2000||year>2100)throw new RangeError('Invalid demo year');
 const rows=[];
 for(let month=0;month<12;month++)for(let siteIndex=0;siteIndex<3;siteIndex++)for(let p=0;p<6;p++)for(let week=0;week<4;week++){
   const day=[3,10,17,24][week];
   const product=DEMO_PRODUCTS[p],seed=month*89+siteIndex*23+p*11+week*7;
   const qty=1+(seed%4),sales=product.price*qty,returns=seed%13===0?Math.round(sales*.5):0;
   const cost=Math.round(sales*(.51+(p%3)*.04));
   rows.push({id:`d-${year}-${seed}-${month}-${siteIndex}-${p}-${week}`,date:dateISO(new Date(year,month,day)),siteId:DEMO_SITES[siteIndex].id,
     siteName:DEMO_SITES[siteIndex].name,productId:product.id,productName:product.name,variant:seed%2===0?'أساسي':'مميز',
     category:product.category,qty,sales,returns,cost,profit:sales-returns-cost,customerId:`sample-c-${siteIndex}-${seed%47}`,
     status:STATUSES[seed%STATUSES.length],method:METHODS[seed%METHODS.length],location:LOCATIONS[(seed+siteIndex)%LOCATIONS.length],
     addon:ADDONS[seed%ADDONS.length],staff:STAFF[seed%STAFF.length]});
 }
 return rows;
}
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+'T12:00:00').getTime());
/**
 * `view=brand` is a UI DEMO filter only. Actual staff access is enforced by
 * server-side erpContext in private routes, not by this public module.
 */
export function buildDemoModel({view='owner',from,to,branchIds=[],search='',withVariants=true}={}){
 if(!validDate(from)||!validDate(to)||from>to)throw new RangeError('Invalid date range');
 const authorizedSiteIds=view==='brand'?['sample-0']:DEMO_SITES.map(s=>s.id);
 const picked=[...new Set(branchIds)].filter(id=>authorizedSiteIds.includes(id));
 const effectiveSiteIds=picked.length?picked:authorizedSiteIds;
 const filteredSites=DEMO_SITES.filter(s=>effectiveSiteIds.includes(s.id));
 const needle=search.trim().toLocaleLowerCase('ar');
 const availableProducts=DEMO_PRODUCTS.filter(p=>!needle||p.name.toLocaleLowerCase('ar').includes(needle));
 const rows=Array.from({length:Math.min(10,Number(to.slice(0,4))-Number(from.slice(0,4))+1)},(_,i)=>demoInvoices(Number(from.slice(0,4))+i)).flat().filter(r=>r.date>=from&&r.date<=to&&effectiveSiteIds.includes(r.siteId)&&(!needle||r.productName.toLocaleLowerCase('ar').includes(needle)));
 const seriesBuckets=new Map();
 const span=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000)+1;
 const monthly=span>62;
 for(const row of rows){
  const key=monthly?row.date.slice(0,7):String(Math.floor((Date.parse(row.date+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/(86400000*7))+1);
  if(!seriesBuckets.has(key))seriesBuckets.set(key,{label:monthly?key:`الأسبوع ${key}`,sales:0,returns:0,cost:0,profit:0,invoice:0,cash:0,card:0,wallet:0,bank:0});
  const bucket=seriesBuckets.get(key);for(const k of ['sales','returns','cost','profit'])bucket[k]+=row[k];bucket.invoice++;bucket[row.method]+=row.sales-row.returns;
 }
 const series=[...seriesBuckets.values()];
 const revenue=total(rows,'sales')-total(rows,'returns');
 const productMap=new Map();
 for(const row of rows){const key=withVariants?`${row.productId}:${row.variant}`:row.productId;
  if(!productMap.has(key))productMap.set(key,{name:withVariants?`${row.productName} — ${row.variant}`:row.productName,qty:0,value:0});
  const item=productMap.get(key);item.qty+=row.qty;item.value+=row.sales-row.returns;
 }
 const productsData=[...productMap.values()].sort((a,b)=>b.qty-a.qty);
 const people=new Map(),addons=new Map();
 for(const row of rows){
  const staff=people.get(row.staff)||{name:row.staff,sales:0,returns:0};staff.sales+=row.sales;staff.returns+=row.returns;people.set(row.staff,staff);
  const addon=addons.get(row.addon)||{name:row.addon,invoices:0,sales:0,returns:0};addon.invoices++;addon.sales+=row.sales;addon.returns+=row.returns;addons.set(row.addon,addon);
 }
 const yearly=demoInvoices(Number(from.slice(0,4))).filter(r=>effectiveSiteIds.includes(r.siteId)&&(!needle||r.productName.toLocaleLowerCase('ar').includes(needle)));
 const yearlySeries=Array.from({length:12},(_,m)=>{
  const selected=yearly.filter(row=>Number(row.date.slice(5,7))===m+1);
  return {label:String(m+1),sales:total(selected,'sales'),payments:total(selected.filter(row=>row.status==='تم التسليم'),'sales')-total(selected.filter(row=>row.status==='تم التسليم'),'returns')};
 });
 return {
   scope:view,sites:filteredSites,products:availableProducts.length*filteredSites.length,customers:new Set(rows.map(r=>r.customerId)).size,
   invoices:rows.length,invoiceTotal:revenue,money:revenue,series,yearlySeries,methodsSeries:series,
   productsData,topUsers:[...people.values()].sort((a,b)=>b.sales-a.sales),addons:[...addons.values()].sort((a,b)=>b.sales-a.sales),
   matrix:{branches:grouped(rows,'siteName'),categories:grouped(rows,'category'),orders:grouped(rows,'status','qty'),expenses:grouped(rows,'category','cost'),locations:grouped(rows,'location'),methods:grouped(rows,'method')},
   empty:rows.length===0,recordCount:rows.length,synthetic:true
 };
}
