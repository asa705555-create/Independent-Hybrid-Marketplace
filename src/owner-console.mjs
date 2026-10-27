/**
 * Owner-only command center. All interpolated data is HTML encoded.
 * This module renders the view; the server must enforce owner authentication
 * BEFORE calling it. Never use it to make authorization decisions.
 */
import {escapeHtml as esc, csrfToken, plans} from './security.mjs';

const ar = n => new Intl.NumberFormat('ar-EG').format(n);
const csrf = session => `<input type="hidden" name="csrf" value="${esc(csrfToken(session))}">`;
const sym = (name, size=20) => {
  const lines = {
    overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sites:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    chart:'<path d="M3 20h18M6 16v-5M12 16V6M18 16v-9"/>',
    dollar:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M7 15h4"/>',
    boxes:'<path d="M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0112 0v2M17 5a3 3 0 010 6M19 20v-2a6 6 0 00-2-4"/>',
    shield:'<path d="M12 2l8 4v6c0 5-3 8-8 10C7 20 4 17 4 12V6zM9 12l2 2 4-4"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/>',
    activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
    arrow:'<path d="M5 12h14M12 5l7 7-7 7"/>',
    external:'<path d="M13 4h7v7M20 4l-9 9M20 14v6H4V4h6"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 6-5 12 0 18M12 3c5 6 5 12 0 18"/>',
    bell:'<path d="M18 8a6 6 0 00-12 0c0 6-3 7-3 8h18c0-1-3-2-3-8M10 20h4"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    download:'<path d="M12 3v13m-5-5l5 5 5-5M4 18v3h16v-3"/>',
    lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
    sparkle:'<path d="M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z"/>',
    layers:'<path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>'
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${lines[name]||lines.layers}</svg>`;
};
const nav = [
  ['overview','نظرة عامة','overview'],['sites','إدارة المواقع','sites'],['plans','الباقات والاشتراكات','layers'],
  ['commerce','الطلبات والتجارة','boxes'],['insights','التحليلات والتقارير','chart'],['customers','الفرق والعملاء','users'],
  ['marketing','التسويق والنمو','sparkle'],['security','الأمان وسجل الأنشطة','shield'],['system','إعدادات المنصة','settings']
];
const field=(label,key,{type='text',value='',extra=''}={})=>`<label class="oc-field"><span>${esc(label)}</span><input type="${type}" name="${key}" value="${esc(value)}" ${extra}></label>`;
const statusTag=site=>`<span class="oc-status ${site.status==='active'?'online':'offline'}"><i></i>${site.status==='active'?'نشط':'موقوف'}</span>`;
const pill=(txt,clazz='')=>`<span class="oc-pill ${clazz}">${esc(txt)}</span>`;
const auditLabels={"site.created":"إنشاء موقع","site.updated":"تعديل هوية","site.status":"تغيير حالة موقع","plan.changed":"تغيير باقة","feature.updated":"تعديل ميزة","product.created":"إضافة منتج","invite.created":"دعوة عضو","invite.accepted":"تفعيل دعوة","session.revoked_all":"إغلاق جميع الجلسات"};
const auditLine=(item, siteLookup)=>`<li class="oc-event"><span class="oc-event-mark"></span><div><b>${esc(auditLabels[item.event]||'حدث إداري')}</b><p>${esc(siteLookup.get(item.site_id)?.name||'المنصة')} · ${esc(item.event)}</p></div><time dir="ltr">${esc(item.created_at)}</time></li>`;
const summaryMetric=(label,val,delta,kind)=>`<article class="oc-metric oc-rise"><div class="oc-metric-head"><span>${label}</span><span class="oc-metric-icon">${sym(kind,19)}</span></div><strong>${ar(val)}</strong><small>${delta}</small></article>`;
const offlinePanel=(icon,title,description)=>`<div class="oc-soon-card"><div class="oc-soon-icon">${sym(icon,23)}</div><span class="oc-pill muted">قيد التكامل</span><h3>${title}</h3><p>${description}</p><span class="oc-soon-footer">لا توجد بيانات إنتاجية بعد</span></div>`;

/** `statistics` is server-side aggregate data, never client-supplied. */
export function ownerCommandCenter(sites,audits,session,{statistics={},message='',security={}}={}) {
  const siteLookup=new Map(sites.map(s=>[s.id,s]));
  const stats={sites:sites.length, active:sites.filter(s=>s.status==='active').length,
    suspended:sites.filter(s=>s.status==='suspended').length,
    products:Number(statistics.products||0), team:Number(statistics.members||0), invites:Number(statistics.invites||0)};
  const tally=Object.fromEntries(Object.keys(plans).map(k=>[k,sites.filter(s=>s.plan===k).length]));
  // All values below are counts of sites, products and staff. No synthetic GMV or revenue.
  const graphMax=Math.max(1,...Object.values(tally));
  const chart=Object.entries(plans).map(([k,p])=>`<div class="oc-bar-row"><span>${esc(p.label)}</span><div class="oc-bar-track"><div class="oc-bar" style="--bar-width:${Math.round(tally[k]/graphMax*100)}%" role="img" aria-label="${esc(p.label)}: ${ar(tally[k])} مواقع"></div></div><b>${ar(tally[k])}</b></div>`).join('');
  const siteRows=sites.map(s=>{
    const st=statistics.bySite?.[s.id]||{};
    return `<tr class="oc-site-row" data-filter="${esc((s.name+' '+s.slug+' '+s.plan).toLowerCase())}">
      <td><div class="oc-site-identity"><span class="oc-site-avatar" style="--tenant-color:${esc(s.accent)}">${esc(s.name.charAt(0))}</span><span><b>${esc(s.name)}</b><small dir="ltr">/s/${esc(s.slug)}</small></span></div></td>
      <td>${pill(plans[s.plan]?.label||s.plan,'accent')}</td><td>${ar(st.products||0)} / ${ar(plans[s.plan]?.maxProducts||0)}</td>
      <td>${ar(st.staff||0)}</td><td>${statusTag(s)}</td>
      <td><a class="oc-row-link" href="/dashboard/${esc(s.slug)}" aria-label="إدارة ${esc(s.name)}">إدارة ${sym('arrow',15)}</a></td></tr>`;
  }).join('');
  const planCards=Object.entries(plans).map(([k,p],i)=>`<article class="oc-pricing-card ${i===1?'featured':''}"><div class="oc-pricing-top"><div>${pill(i===1?'الأكثر مرونة':'الباقة '+(i+1),i===1?'accent':'muted')}<h3>${esc(p.label)}</h3></div>${sym('layers',23)}</div><div class="oc-price">${ar(p.price)} <small>ج.م / شهر</small></div><p class="oc-fineprint">سعر مقترح · التحصيل غير مفعّل</p><div class="oc-pricing-meta"><span>المواقع الحالية <strong>${ar(tally[k])}</strong></span><span>المنتجات <strong>${ar(p.maxProducts)}</strong></span><span>الموظفون <strong>${ar(p.maxStaff)}</strong></span></div><div class="oc-features">${p.features.map(f=>`<span>✓ ${esc(f.replaceAll('_',' '))}</span>`).join('')}</div></article>`).join('');
  const emptyRow=`<tr><td colspan="6" class="oc-empty">لسه مفيش مواقع. ابدأ بإنشاء موقع جديد من النموذج.</td></tr>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#101d1a"><title>مركز القيادة | جامع</title><link rel="stylesheet" href="/assets/owner-console.css"><script type="module" src="/assets/owner-console.mjs"></script></head>
  <body class="oc-body"><div class="oc-app">
   <aside class="oc-sidebar" id="oc-sidebar" aria-label="تنقل لوحة المالك"><a href="/" class="oc-brand"><span class="oc-brand-symbol">ج</span><span><b>جامع<span class="oc-gold">.</span></b><small>OPERATING SYSTEM</small></span></a>
    <div class="oc-workspace"><span class="oc-workspace-mark">${sym('layers',18)}</span><span><b>لوحة مالك المنصة</b><small>Master workspace</small></span>${sym('shield',16)}</div>
    <p class="oc-nav-eyebrow">القائمة الرئيسية</p><nav aria-label="أقسام لوحة التحكم" class="oc-nav">${nav.map(([id,label,ico],i)=>`<a href="#${id}" class="oc-nav-link ${i===0?'active':''}" data-section-link="${id}">${sym(ico,19)}<span>${label}</span></a>`).join('')}</nav>
    <div class="oc-sidebar-bottom"><div class="oc-secure-flag"><span></span> بوابة خاصة بالمالك</div><a href="/" class="oc-view-site">${sym('globe',17)} معاينة الموقع الرئيسي ${sym('external',15)}</a></div>
   </aside>
   <div class="oc-main-wrap"><header class="oc-top"><div class="oc-top-leading"><button type="button" class="oc-mobile-toggle" id="oc-menu" aria-expanded="false" aria-controls="oc-sidebar" aria-label="فتح القائمة">${sym('menu',22)}</button><div class="oc-breadcrumb">المنصة <span>/</span> إدارة الأعمال <span>/</span> <b>مركز القيادة</b></div></div><div class="oc-top-actions"><span class="oc-live-dot">نظام المعاينة متصل</span><a class="oc-visit" href="/">${sym('globe',18)} <span>عرض المنصة</span></a><span class="oc-owner-avatar" title="مالك المنصة">م</span></div></header>
   <main id="main" class="oc-content">
    <section class="oc-intro oc-rise" id="overview"><div><div class="oc-eyebrow">CONTROL CENTER / SUPER ADMIN</div><h1>كل أعمالك في <em>مساحة واحدة.</em></h1><p>تحكم شامل بالمواقع المستقلة، الباقات، الفرق، المحتوى والتشغيل — في لوحة واحدة مصممة للنمو.</p><div class="oc-intro-meta"><span>${sym('shield',16)} وصول خاص بالمالك</span><span>${sym('activity',16)} إحصاءات مباشرة من قاعدة المعاينة</span></div></div><div class="oc-intro-actions"><a href="#new-site" class="oc-btn oc-btn-primary">${sym('plus',18)} إنشاء موقع</a><a href="/owner/reports/sites.csv" class="oc-btn oc-btn-line">${sym('download',17)} تقرير المواقع CSV</a></div></section>
    ${message?`<div class="oc-notice" role="status">${esc(message)}</div>`:''}
    <section class="oc-metrics" aria-label="أرقام المنصة">${summaryMetric('إجمالي المواقع',stats.sites,'كل المواقع المسجلة','sites')}${summaryMetric('المواقع النشطة',stats.active,'متاحة للزيارة الآن','globe')}${summaryMetric('المنتجات التجريبية',stats.products,'عبر جميع المواقع','boxes')}${summaryMetric('أعضاء الفرق',stats.team,'عضويات مواقع مستقلة','users')}${summaryMetric('دعوات معلقة',stats.invites,'لم تنتهِ بعد','activity')}${summaryMetric('المواقع المتوقفة',stats.suspended,'موقوفة بقرار إداري','shield')}</section>
    <div class="oc-section-head"><div><span class="oc-eyebrow">BUSINESS OPERATIONS</span><h2>نظرة تشغيلية شاملة</h2></div>${pill('بيانات حقيقية من بيئة المعاينة','outline')}</div>
    <div class="oc-insights-layout" id="insights"><section class="oc-panel oc-rise"><div class="oc-panel-head"><div><h3>توزيع المواقع على الباقات</h3><p>عدد المواقع الفعلي في كل باقة</p></div>${sym('chart',20)}</div><div class="oc-bar-chart">${chart}</div><div class="oc-chart-footer">${ar(stats.sites)} موقع إجماليًا <span>·</span> بدون أرقام مبيعات تقديرية</div></section>
    <section class="oc-panel oc-spotlight oc-rise"><span class="oc-eyebrow">PLATFORM READINESS</span><h3>المشروع في مرحلة البناء.</h3><p>واجهات الإدارة والصلاحيات والكتالوج التجريبي متاحة. الاشتراكات الفعلية والدفع والشحن والمحاسبة بحاجة إلى Backend وخدمات إنتاج مستقلة.</p><div class="oc-ready"><span><i></i> إدارة المواقع</span><span><i></i> حدود الباقات</span><span><i></i> سجل المراجعة</span></div><a href="#system" class="oc-text-link">اعرف ما ينقص للإطلاق ${sym('arrow',16)}</a></section></div>
    <section class="oc-panel oc-sites-panel oc-rise" id="sites"><div class="oc-panel-head oc-sites-head"><div><span class="oc-eyebrow">WEBSITE NETWORK</span><h2>كل المواقع تحت إدارتك</h2><p>عرض وإدارة جميع مواقع المنصة دون خلط بياناتها.</p></div><div class="oc-table-actions"><label class="oc-search-wrap">${sym('search',17)} <span class="visually-hidden">ابحث في المواقع</span><input id="oc-site-search" type="search" placeholder="بحث عن موقع أو باقة" autocomplete="off"></label><a href="#new-site" class="oc-btn oc-btn-primary oc-btn-sm">${sym('plus',16)} موقع جديد</a></div></div><div class="oc-table-scroll"><table class="oc-table"><thead><tr><th>اسم الموقع</th><th>الباقة</th><th>المنتجات</th><th>الفريق</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="oc-site-rows">${siteRows||emptyRow}</tbody></table></div><p id="oc-no-results" class="oc-no-results" hidden>لا توجد مواقع تطابق البحث.</p><div class="oc-table-bottom"><span>البيانات معزولة لكل موقع · التأكيد النهائي للصلاحيات يتم على السيرفر</span><a href="/owner/reports/sites.csv">تنزيل تقرير المواقع ${sym('download',15)}</a></div></section>
    <section class="oc-dual-layout" id="new-site"><div class="oc-panel oc-create-card oc-rise"><div class="oc-panel-head"><div><span class="oc-eyebrow">NEW WORKSPACE</span><h2>أنشئ موقعًا جديدًا</h2><p>كل موقع يحصل على مساحة إدارية مستقلة.</p></div><span class="oc-plus-big">${sym('plus',22)}</span></div><form method="post" action="/owner/sites" class="oc-create-form">${csrf(session)}<div class="oc-form-grid">${field('اسم الموقع','name',{extra:'required minlength="2" maxlength="80" placeholder="اسم العلامة أو المتجر"'})}${field('الرابط المختصر','slug',{extra:'required pattern="[a-z][a-z0-9-]+" maxlength="40" placeholder="my-store" dir="ltr"'})}</div>${field('تعريف مختصر','tagline',{extra:'maxlength="140" placeholder="نبذة قصيرة تظهر على صفحة الموقع"'})}<div class="oc-form-grid">${field('لون الهوية','accent',{type:'color',value:'#204d45',extra:'required'})}<label class="oc-field"><span>الباقة المبدئية</span><select name="plan">${Object.entries(plans).map(([k,p])=>`<option value="${k}">${esc(p.label)} — ${ar(p.price)} ج.م مقترح</option>`).join('')}</select></label></div><button type="submit" class="oc-btn oc-btn-primary oc-submit">إنشاء الموقع الآن ${sym('arrow',18)}</button></form><p class="oc-form-note">الإعدادات الحالية تجريبية وقد تُفقد عند إعادة تشغيل الخدمة؛ لا تستخدم بيانات حقيقية هنا.</p></div>
    <div class="oc-panel oc-activity-card oc-rise" id="security"><div class="oc-panel-head"><div><span class="oc-eyebrow">AUDIT TRAIL</span><h2>آخر الأنشطة</h2><p>سجل التغييرات الإدارية داخل المنصة</p></div>${sym('shield',22)}</div><ul class="oc-timeline">${audits.slice(0,8).map(a=>auditLine(a,siteLookup)).join('')||'<li class="oc-no-events">لا توجد تغييرات مسجلة حاليًا.</li>'}</ul><div class="oc-security-footer">${sym('lock',15)} لا تظهر لوحة المالك أو تقاريرها للزوار غير المصرح لهم.</div></div></section>
    <section class="oc-plans-section" id="plans"><div class="oc-section-head"><div><span class="oc-eyebrow">PLANS & ENTITLEMENTS</span><h2>الباقات وحدود الإمكانيات</h2><p>حدود المنتجات وأعضاء الفرق يتم تطبيقها داخل السيرفر.</p></div>${pill('الأسعار للتخطيط فقط','outline')}</div><div class="oc-pricing-grid">${planCards}</div></section>
    <section class="oc-business-section" id="commerce"><div class="oc-section-head"><div><span class="oc-eyebrow">COMMERCE WORKSPACE</span><h2>التجارة والعمليات</h2><p>المساحات الجاهزة للتكامل القادم، بدون ادعاء وجود معاملات حقيقية.</p></div></div><div class="oc-soon-grid">${offlinePanel('boxes','الطلبات والمخزون','طلبات العملاء، التسويات الفرعية لكل بائع، وشحنات التجميع.')}${offlinePanel('dollar','المدفوعات والتسويات','الفواتير، عمولات المنصة، الاشتراكات، والمستحقات.')}${offlinePanel('activity','الشحن والمرتجعات','خدمات شركات الشحن، التتبع، التجميع، والاسترجاع.')}</div></section>
    <section class="oc-business-section" id="customers"><div class="oc-section-head"><div><span class="oc-eyebrow">PEOPLE & ACCESS</span><h2>إدارة الفرق والصلاحيات</h2></div></div><div class="oc-people-banner"><div>${sym('users',24)}<h3>${ar(stats.team)} عضوية مسجلة</h3><p>مدير موقع، مسؤول كتالوج، أو مشاهد فقط. أنشئ دعوة من داخل لوحة الموقع، ولا تمنح صلاحيات المالك لأي فريق خارجي.</p></div><a class="oc-btn oc-btn-line" href="#sites">اختيار موقع لإدارة فريقه ${sym('arrow',16)}</a></div></section>
    <section class="oc-business-section" id="marketing"><div class="oc-section-head"><div><span class="oc-eyebrow">GROWTH CENTER</span><h2>التسويق والتوسع</h2></div></div><div class="oc-soon-grid">${offlinePanel('chart','التقارير المتقدمة','مبيعات كل موقع ومصدر الزيارات والتحويلات عند الربط الإنتاجي.')}${offlinePanel('sparkle','الحملات والترويج','الكوبونات، الحملات المشتركة، ومزايا الباقة حسب الموقع.')}${offlinePanel('globe','الدومينات والتخصيص','ربط دومينات مستقلة، SEO، وتخصيص واجهات البراندات.')}</div></section>
    <section class="oc-system-section oc-panel" id="system"><div class="oc-section-head"><div><span class="oc-eyebrow">SECURITY & SYSTEM</span><h2>جاهزية المنصة وحماية الحساب</h2></div>${pill('Prototype — Not Production','warning')}</div><div class="oc-system-grid"><div><h3>الحماية الحالية</h3><ul class="oc-check-list"><li>جلسة HTTP-only وصلاحيات تم التحقق منها على السيرفر</li><li>منع CSRF ومحاولة الوصول لموقع بائع آخر</li><li>تصفية المدخلات وحماية من حقن HTML</li><li>سجل مراجعة للتعديلات الإدارية</li>${security.mfaEnabled?'<li>رمز التحقق بخطوتين للمالك مفعّل ومضاد لإعادة الاستخدام</li>':''}</ul></div><div><h3>مطلوب قبل التشغيل الحقيقي</h3><ul class="oc-check-list pending"><li>قاعدة PostgreSQL إنتاجية منفصلة ودائمة</li>${security.mfaEnabled?'<li>تأمين الاسترداد والنسخ الاحتياطية لمفاتيح MFA</li>':'<li>تفعيل MFA للمالك من إعدادات الخادم</li>'}<li>مدفوعات واشتراكات وشحن فعلي معتمد</li><li>مراقبة مركزية ونسخ احتياطية واختبارات اختراق مستقلة</li></ul></div></div><div class="oc-system-bottom"><div><b>جلسة الإدارة الخاصة</b><span>اخرج من الحساب عند انتهاء الاستخدام.</span></div><form method="post" action="/session/logout">${csrf(session)}<button type="submit" class="oc-btn oc-btn-line">تسجيل الخروج ${sym('external',16)}</button></form></div><form method="post" action="/owner/sessions/revoke-all" class="oc-session-revoke">${csrf(session)}<button class="oc-btn oc-btn-line" type="submit">${sym('lock',15)} إغلاق جميع جلسات حساب المالك</button><small>يُلغي كل الجلسات المفتوحة، بما فيها الجلسة الحالية. لا يحذف بيانات المواقع.</small></form></section>
    <footer class="oc-footer"><span>جامع · مركز قيادة خاص · مشروع مستقل تمامًا</span><span>بيئة معاينة · لا توجد عمليات مالية حقيقية</span></footer>
   </main></div></div><div class="oc-overlay" id="oc-overlay" hidden></div></body></html>`;
}
