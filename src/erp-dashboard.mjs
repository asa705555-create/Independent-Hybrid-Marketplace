/**
 * Reusable ERP analytics shell shared by the owner and individual tenants.
 * Identity, role and feature entitlements are always checked by src/server.mjs.
 * This module only renders markup; NEVER treat UI state as authorization.
 */
import {escapeHtml as e, can, plans} from './security.mjs';

export const ERP_WIDGETS=Object.freeze([
  {id:'products',kind:'kpi',size:3,ar:'المنتجات',en:'Products'},
  {id:'customers',kind:'kpi',size:3,ar:'العملاء',en:'Customers'},
  {id:'invoices',kind:'kpi',size:3,ar:'الفواتير',en:'Invoices'},
  {id:'invoiceTotal',kind:'kpi',size:3,ar:'إجمالي الفواتير',en:'Total invoices'},
  {id:'branches',kind:'donut',size:6,ar:'المبيعات حسب الأفرع',en:'Sales by branches'},
  {id:'comparison',kind:'bars',size:6,ar:'مقارنة المبيعات',en:'Sales comparison'},
  {id:'totalSales',kind:'area',size:6,ar:'إجمالي المبيعات',en:'Total sales'},
  {id:'categories',kind:'donut',size:6,ar:'المبيعات بحسب التصنيف',en:'Sales by category'},
  {id:'topProducts',kind:'ranking',size:6,ar:'المنتجات عالية الأداء',en:'Top performing products'},
  {id:'lowProducts',kind:'ranking',size:6,ar:'المنتجات منخفضة الأداء',en:'Low performing products'},
  {id:'locations',kind:'locations',size:6,ar:'المبيعات حسب الموقع الجغرافي',en:'Sales by location'},
  {id:'orders',kind:'donut',size:6,ar:'حالة الطلبات',en:'Order status'},
  {id:'expenses',kind:'donut',size:6,ar:'المصروفات',en:'Expenses'},
  {id:'invoiceYear',kind:'area',size:6,ar:'إجمالي الفواتير خلال السنة',en:'Yearly invoices'},
  {id:'methods',kind:'bars',size:6,ar:'الإيرادات حسب طريقة الدفع',en:'Revenue by payment method'},
  {id:'topUsers',kind:'table',size:6,ar:'المستخدم الأكثر مبيعًا',en:'Top selling user'},
  {id:'addons',kind:'table',size:6,ar:'المبيعات حسب الإضافات',en:'Sales by add-ons'},
]);

const svg=(name)=>{
 const p={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',analytics:'<path d="M3 20h18M6 16v-5M12 16V6M18 16v-9"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',back:'<path d="M6 12h12M12 6l6 6-6 6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',layers:'<path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',bell:'<path d="M18 8a6 6 0 00-12 0c0 6-3 7-3 8h18c0-1-3-2-3-8M10 20h4"/>',monitor:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/>',search:'<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>'};
 return `<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${p[name]||p.grid}</svg>`;
};

/**
 * A user can access only their own tenant. No cross-site comparisons are
 * permitted for a tenant, including via manipulated query parameters.
 */
export async function erpContext(store,{isOwner=false,user,slug=null,branchIds=[],productQuery=''}={}){
 if(typeof productQuery!=='string'||productQuery.length>80||/[\u0000-\u001f\u007f]/.test(productQuery))return {status:400};
 const query=productQuery.trim().toLocaleLowerCase('ar');
 const summarize=(sites,productGroups,scope,scopeId)=>{
  // All products are queried only AFTER role, plan and branch scope verification.
  // Never use a client-supplied site ID to expand a tenant's authority.
  const records=sites.flatMap((site,i)=>productGroups[i].map(p=>({
   id:String(p.id),name:String(p.name),siteId:site.id,
   siteName:site.name,stock:Number(p.stock)||0,pricePiasters:String(p.price_piasters||0)
  })));
  const filtered=query?records.filter(p=>p.name.toLocaleLowerCase('ar').includes(query)):records;
  const stockUnits=filtered.reduce((n,p)=>n+p.stock,0);
  const inventoryPiasters=filtered.reduce((n,p)=>n+BigInt(p.pricePiasters)*BigInt(p.stock),0n);
  return {scope,scopeId,sites:sites.map(s=>({id:s.id,slug:s.slug,name:s.name,status:s.status})),
   products:filtered.map(({id,name,siteId,stock})=>({id,name,siteId,stock})),
   productsCount:filtered.length,totalProductsCount:records.length,stockUnits,
   lowStock:filtered.filter(p=>p.stock>0&&p.stock<=5).length,
   outOfStock:filtered.filter(p=>p.stock===0).length,
   inventoryPiasters:String(inventoryPiasters),dataMode:'operational',financialIntegrated:false};
 };

 if(!user) return {status:401};
 if(isOwner && !slug){
  const allSites=await store.listSites();
  if(branchIds.length && branchIds.some(id=>!allSites.some(s=>s.id===id)))return {status:403};
  const sites=branchIds.length?allSites.filter(s=>branchIds.includes(s.id)):allSites;
  const productsBySite=await Promise.all(sites.map(s=>store.listProducts(s.id)));
  return {status:200,value:summarize(sites,productsBySite,'owner','all')};
 }
 if(!slug || !/^[a-z][a-z0-9-]{1,39}$/.test(slug))return {status:404};
 const site=await store.getSite(slug);
 if(!site)return {status:404};
 if(branchIds.length && branchIds.some(id=>id!==site.id))return {status:403};
 if(!isOwner){
  const role=await store.membership(user.id,site.id);
  if(!can(role,'view_reports'))return {status:403};
  if(!await store.hasFeature(site,'analytics'))return {status:403};
 }
 const products=await store.listProducts(site.id);
 return {status:200,value:summarize([site],[products],isOwner?'owner':'tenant',site.slug)};
}

/** For preview only: all numbers in mock mode are fictitious. */
export function erpDashboardPage({scope='demo',site=null,previewRole=null}={}){
 const demo=scope==='demo',owner=scope==='owner'||(demo&&previewRole==='owner'),scopeName=owner?'الإدارة الرئيسية':site?.name||'البراند التجريبي';
 const slug=site?.slug||'atelier-demo';
 const back=demo?'/':owner?'/owner':'/dashboard/'+slug;
 const scoped=demo?'/':owner?'/owner/erp':'/dashboard/'+slug+'/erp';
 const active=owner?'كل المواقع':'موقع واحد';
 const widget=ERP_WIDGETS.map((w,i)=>`<section class="erp-widget erp-widget-${e(w.kind)}" data-widget="${e(w.id)}" data-span="${w.size}" style="--entry:${i*23}ms" aria-label="${e(w.ar)}"><header class="erp-widget-head"><div><small class="erp-widget-index">${String(i+1).padStart(2,'0')}</small><h2 data-widget-heading="${e(w.id)}">${e(w.ar)}</h2></div><span class="erp-widget-handle" title="اسحب لترتيب الودجت" aria-label="اسحب لتغيير الترتيب" tabindex="0">⋮⋮</span></header><div class="erp-widget-body" data-widget-content="${e(w.id)}"><div class="erp-loading"></div></div><footer class="erp-widget-controls"><button type="button" data-move-up="${e(w.id)}" aria-label="تقديم الودجت">↑</button><button type="button" data-move-down="${e(w.id)}" aria-label="تأخير الودجت">↓</button><button type="button" data-span-toggle="${e(w.id)}" aria-label="تغيير حجم الودجت">↔</button></footer></section>`).join('');
 const link=(href,title,icon)=>`<a href="${e(href)}" class="erp-side-link">${svg(icon)}<span>${e(title)}</span></a>`;
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>تحليلات ${e(scopeName)} | جامع</title><link rel="stylesheet" href="/assets/owner-console.css"><link rel="stylesheet" href="/assets/erp-dashboard.css"><script type="module" src="/assets/erp-dashboard.mjs"></script></head>
 <body class="oc-body erp-body"><div class="oc-app">
 <aside class="oc-sidebar erp-sidebar" id="erp-side"><a class="oc-brand" href="/"><span class="oc-brand-symbol">ج</span><span><b>جامع<span class="oc-gold">.</span></b><small>OPERATING SYSTEM</small></span></a>
 <div class="oc-workspace"><span class="oc-workspace-mark">${svg('grid')}</span><span><b>${e(scopeName)}</b><small>${owner?'SUPER ADMIN':demo?'DESIGN DEMONSTRATION':'BRAND WORKSPACE'}</small></span>${svg('lock')}</div>
 <p class="oc-nav-eyebrow" data-i18n="nav">القائمة الرئيسية</p><nav class="erp-side-nav">
 ${link(back,'نظرة عامة','grid')}<a class="erp-side-link active" href="${e(scoped)}">${svg('analytics')}<span data-i18n="analytics">التحليلات المتقدمة</span></a>
 ${link(owner?'/owner#sites':demo?'/demo/erp':'/dashboard/'+slug,'إدارة المواقع','monitor')}
 ${link(owner?'/owner#plans':demo?'/demo/erp':'/dashboard/'+slug,'الباقات والصلاحيات','layers')}
 ${link(owner?'/owner#security':demo?'/demo/erp':'/dashboard/'+slug,'الإعدادات والأمان','settings')}</nav>
 <div class="oc-sidebar-bottom"><div class="oc-secure-flag"><span></span>${demo?'معاينة عامة بلا بيانات حقيقية':'الوصول محمي بصلاحيات السيرفر'}</div><a href="${e(back)}" class="oc-view-site">${svg('back')}<span data-i18n="back">الرجوع للوحة الأصلية</span></a></div></aside>
 <div class="oc-main-wrap erp-main"><header class="oc-top"><div class="oc-top-leading"><button type="button" class="erp-menu-toggle" id="erp-menu" aria-label="فتح القائمة">☰</button><div class="oc-breadcrumb"><span data-i18n="platform">المنصة</span><span>/</span>${e(scopeName)}<span>/</span><b data-i18n="analytics">التحليلات المتقدمة</b></div></div><div class="oc-top-actions"><span class="erp-indicator">${demo?'DEMO PREVIEW':'PRIVATE WORKSPACE'}</span><button class="erp-icon-button" type="button" id="erp-notifications" aria-label="التنبيهات">${svg('bell')}</button><span class="oc-owner-avatar">${owner?'م':demo?'ع':e(scopeName[0])}</span></div></header>
 <main class="oc-content erp-content" id="main" data-erp-root data-scope="${e(scope)}" data-slug="${e(slug)}"><section class="erp-page-heading"><div><span class="oc-eyebrow">BUSINESS INTELLIGENCE / ${owner?'SUPER ADMIN':'WORKSPACE'}</span><h1><span data-i18n="dashboardTitle">لوحة المبيعات والتحليلات</span><em>.</em></h1><p data-i18n="dashboardSubtitle">كل التفاصيل التشغيلية في مكان واحد — بنفس هوية جامع Premium.</p></div><div class="erp-heading-actions">${demo&&previewRole?'<a class="erp-ghost-btn" href="/owner/">الإدارة الرئيسية</a><a class="erp-ghost-btn" href="/brand/">البراند</a>':''}<span class="erp-scope-chip">${svg('lock')} ${e(active)}</span><button class="erp-primary-btn" id="erp-edit" type="button">${svg('grid')}<span data-i18n="widgets">الودجت</span></button></div></section>
 <div class="erp-demo-notice" role="status" id="erp-data-banner">${demo?'جميع البيانات المالية والمنتجات هنا تجريبية — لا تعكس معاملات حقيقية.':'الإحصائيات الحقيقية للمنتجات فقط؛ المبيعات والفواتير غير متصلة بعد. يمكن تشغيل العرض التجريبي من الإعدادات.'}</div>
 <div class="erp-toolbar" role="group" aria-label="فلاتر التحليلات"><label><span data-i18n="from">من</span><input type="date" id="erp-from"></label><label><span data-i18n="to">إلى</span><input type="date" id="erp-to"></label><label class="erp-select-wrap"><span data-i18n="branches">المواقع / الفروع</span><select id="erp-branches" multiple size="3" aria-label="اختيار المواقع والفروع"><option value="all">جميع المواقع</option></select></label><label class="erp-product-filter"><span data-i18n="productSearch">البحث عن منتج</span><input type="search" id="erp-products" list="erp-product-options" autocomplete="off" placeholder="ابحث عن منتج"><datalist id="erp-product-options"></datalist></label><button type="button" class="erp-ghost-btn" id="erp-language">English / العربية</button><button type="button" class="erp-ghost-btn" id="erp-data-toggle">${demo?'إظهار الفراغ':'عرض بيانات تجريبية'}</button></div>
 <section class="erp-edit-panel" id="erp-editor" hidden><div><b data-i18n="editorTitle">تخصيص اللوحة</b><p data-i18n="editorHint">اسحب الكروت أو استخدم الأسهم، وعدّل العرض وأخفِ ما لا تحتاجه.</p></div><div class="erp-editor-list" id="erp-editor-list"></div><button class="erp-ghost-btn" id="erp-reset" type="button" data-i18n="reset">استعادة الترتيب الأصلي</button></section>
 <div class="erp-live-summary"><span class="erp-live-pip"></span><b id="erp-range-label">هذا الشهر</b><span id="erp-scope-label">${e(scopeName)}</span><span class="erp-mock-stamp" id="erp-mock-stamp">${demo?'بيانات توضيحية':'بيانات تشغيلية'}</span></div>
 <section class="erp-operational" id="erp-operational" aria-label="مؤشرات المخزون التشغيلي"><div class="erp-operational-head"><div><b data-i18n="inventoryTitle">حالة المخزون الفعلية</b><small data-i18n="inventoryNote">المخزون لحظة الطلب؛ فلتر التاريخ يخص المبيعات المستقبلية فقط.</small></div>${!demo?'<a class="erp-ghost-btn" id="erp-export" href="#" download="jame3-inventory.csv">تصدير مخزون CSV</a>':''}</div><div class="erp-operational-grid" id="erp-operational-grid" aria-live="polite"></div></section>
 <div class="erp-grid" id="erp-grid">${widget}</div><footer class="erp-footer">JAME3 OPERATING SYSTEM — DEMONSTRATION / © 2026 <span data-i18n="footer">الفوترة والشحن والطلبات الفعلية لم تُربط بعد.</span></footer></main></div></div><div class="erp-overlay" id="erp-overlay" hidden></div></body></html>`;
}
