/** Interactive Jame3 ERP widgets; preview figures are ALWAYS explicitly fictitious.
 * This client is presentation-only. Data scoping and permissions live in server.mjs.
 * Stored preferences never confer access to a tenant or any backend resource.
 */
const root=document.querySelector('[data-erp-root]');
if(!root)throw new Error('ERP dashboard root not found');
const scope=root.dataset.scope;
const siteSlug=root.dataset.slug;
const demo=scope==='demo';
const ids=['products','customers','invoices','invoiceTotal','branches','comparison','totalSales','categories','topProducts','lowProducts','locations','orders','expenses','invoiceYear','methods','topUsers','addons'];
const titles={
 products:['المنتجات','Products'],customers:['العملاء','Customers'],invoices:['الفواتير','Invoices'],invoiceTotal:['إجمالي الفواتير','Total invoices'],
 branches:['المبيعات حسب الأفرع','Sales by branch'],comparison:['مقارنة المبيعات','Sales comparison'],totalSales:['إجمالي المبيعات','Total sales'],
 categories:['المبيعات بحسب التصنيف','Sales by category'],topProducts:['المنتجات عالية الأداء','Top performing products'],lowProducts:['المنتجات منخفضة الأداء','Low performing products'],
 locations:['المبيعات حسب الموقع الجغرافي','Sales by location'],orders:['حالة الطلبات','Order status'],expenses:['المصروفات','Expenses'],
 invoiceYear:['إجمالي الفواتير خلال السنة','Yearly invoices'],methods:['الإيرادات حسب طريقة الدفع','Revenue by payment method'],
 topUsers:['المستخدم الأكثر مبيعًا','Top selling user'],addons:['المبيعات حسب الإضافات','Sales by add-ons']
};
const labels={
 ar:{nav:'القائمة الرئيسية',analytics:'التحليلات المتقدمة',back:'الرجوع للوحة الأصلية',platform:'المنصة',dashboardTitle:'لوحة المبيعات والتحليلات',dashboardSubtitle:'كل التفاصيل التشغيلية في مكان واحد — بنفس هوية جامع Premium.',widgets:'الودجت',from:'من',to:'إلى',branches:'المواقع / الفروع',productSearch:'البحث عن منتج',editorTitle:'تخصيص اللوحة',editorHint:'اسحب الكروت أو استخدم الأسهم، وعدّل العرض وأخفِ ما لا تحتاجه.',reset:'استعادة الترتيب الأصلي',footer:'الفوترة والشحن والطلبات الفعلية لم تُربط بعد.',none:'لا يوجد عناصر',currency:'جنيه مصري',week:'الأسبوع',sample:'بيانات توضيحية',operational:'بيانات تشغيلية',sales:'المبيعات',returns:'المرتجعات',cost:'التكلفة',profit:'الربح',pending:'غير متصل',all:'جميع المواقع',editDone:'حفظ الترتيب',withVariants:'مع المتغيرات',withoutVariants:'بدون المتغيرات',demoOn:'إخفاء البيانات التجريبية',demoOff:'عرض بيانات تجريبية',emptyNotice:'لا توجد بيانات تجارة حقيقية؛ ربط الطلبات والمدفوعات غير مفعّل.',sampleNotice:'الأرقام والأسماء في هذه المعاينة افتراضية بالكامل، ولا توجد مبيعات أو مدفوعات حقيقية.'},
 en:{nav:'MAIN MENU',analytics:'Advanced analytics',back:'Back to main console',platform:'Platform',dashboardTitle:'Sales and analytics',dashboardSubtitle:'All the operating details together, in the original Jame3 Premium design.',widgets:'Widgets',from:'From',to:'To',branches:'Sites / branches',productSearch:'Find a product',editorTitle:'Customize dashboard',editorHint:'Drag cards or use arrows to reorder, resize or hide widgets.',reset:'Reset original layout',footer:'Real billing, shipping and sales are not integrated.',none:'No data yet',currency:'Egyptian pound',week:'Week',sample:'Sample data',operational:'Operational data',sales:'Sales',returns:'Returns',cost:'Cost',profit:'Profit',pending:'Not connected',all:'All sites',editDone:'Save layout',withVariants:'With variants',withoutVariants:'Without variants',demoOn:'Disable sample data',demoOff:'Show sample data',emptyNotice:'No real commerce data is connected; payments and orders are disabled.',sampleNotice:'Every amount, sale and person shown here is fictional. No real transactions are processed.'}
};
const $=id=>document.getElementById(id);
const cards=[...document.querySelectorAll('[data-widget]')];
const grid=$('erp-grid');
const storageNamespace=`${scope}:${demo?'demo':scope==='owner'?'owner':siteSlug}`;
const layoutKey=`dashboard_widget_layout_v1:${storageNamespace}`;
const dateKey=`dashboard_date_range:${storageNamespace}`;
const localeKey=`dashboard_locale:${storageNamespace}`;
function getStorage(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function saveStorage(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{ /* storage may be blocked */ }}
function originalLayout(){return ids.map(id=>({id,visible:true,span:Number(document.querySelector(`[data-widget="${id}"]`)?.dataset.span||6)}));}
function restoreLayout(){const raw=getStorage(layoutKey);if(!raw||!Array.isArray(raw.widgets))return originalLayout();const byId=new Map(raw.widgets.filter(w=>ids.includes(w?.id)).map(w=>[w.id,w]));return [...ids].map(id=>{const w=byId.get(id)||{};return{id,visible:w.visible!==false,span:[3,6,12].includes(Number(w.span))?Number(w.span):originalLayout().find(x=>x.id===id).span};}).sort((a,b)=>{const index=raw.widgets.map(v=>v.id);return (index.indexOf(a.id)===-1?999:index.indexOf(a.id))-(index.indexOf(b.id)===-1?999:index.indexOf(b.id))});}
function thisMonth(){const d=new Date();const y=d.getFullYear(),m=d.getMonth();const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;return [iso(new Date(y,m,1)),iso(new Date(y,m+1,0))]}
function validISO(x){return /^\d{4}-\d{2}-\d{2}$/.test(x||'')&&!Number.isNaN(new Date(x).getTime())}
const storedDates=getStorage(dateKey)?.dateRange;
const defaultDates=Array.isArray(storedDates)&&storedDates.length===2&&storedDates.every(validISO)&&storedDates[0]<=storedDates[1]?storedDates:thisMonth();
const savedLocale=getStorage(localeKey);
const state={language:['ar','en'].includes(savedLocale)?savedLocale:'ar',from:defaultDates[0],to:defaultDates[1],selectedSites:[],search:'',mock:demo,edit:false,layout:restoreLayout(),scopeData:null,loading:true};
const palette=['#285e47','#74ac84','#d5bc8c','#a0c6ab','#3b8770'];
const money=n=>Number(n||0).toLocaleString(state.language==='ar'?'ar-EG':'en-US',{maximumFractionDigits:0});
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=k=>labels[state.language][k]||k;
const textOrDash=x=>x===null?'—':money(x);
const cardMap=new Map(cards.map(n=>[n.dataset.widget,n]));
const colors=['#2f7655','#8ec19b','#d3b783','#5b9a80','#b9d6c0'];

function buildModel(){
 const operational=state.scopeData;
 const rawCount=Number(operational?.productsCount||0);
 const siteCount=state.selectedSites.length || (operational?.sites?.length||3);
 const span=Math.max(1,Math.round((Date.parse(state.to)-Date.parse(state.from))/86400000)+1);
 const scale=Math.min(3.5,Math.max(.15,span/30));
 let filterRatio=1;
 if(state.search.trim())filterRatio=.35;
 if(state.selectedSites.length)filterRatio=Math.min(1,state.selectedSites.length/Math.max(1,(operational?.sites?.length||3)));
 const factor=scale*filterRatio;
 if(!state.mock){return{products:rawCount,customers:null,invoices:null,invoiceTotal:null,empty:true,series:[],labels:[],sites:operational?.sites||[]};}
 const series=Array.from({length:5},(_,i)=>{
   const v=Math.round((21000+4800*(i%3)+6000*Math.sin(i*.9+siteCount*.4))*factor);
   const returns=Math.round(v*(.055+i*.008));const cost=Math.round(v*(.51+i*.015));
   return {label:tr('week')+' '+money(i+1),sales:v,returns,cost,profit:v-returns-cost,invoice:Math.round(v/750)};
 });
 const sum=key=>series.reduce((a,x)=>a+x[key],0);
 const revenue=sum('sales');
 const products=['هودي قطن بريميوم','تيشيرت أساسي','بنطلون رياضي','قميص كتان','شنطة قماش','سويت شيرت'];
 const brandNames=operational?.sites?.map(x=>x.name)||[];
 const branchNames=brandNames.length?brandNames:['فرع القاهرة','فرع الجيزة','فرع الإسكندرية'];
 const selectedNames=state.selectedSites.length?branchNames.filter((_,i)=>state.selectedSites.includes(operational?.sites?.[i]?.id||`sample-${i}`)):branchNames;
 const subCategories=['ملابس','إكسسوارات','أحذية','عناية'];
 const matrix={branches:selectedNames.map((name,i)=>({name,value:Math.round(revenue/(selectedNames.length||1)*(1+.1*Math.sin(i)))})),categories:subCategories.map((name,i)=>({name,value:Math.round(revenue*[.4,.28,.2,.12][i])})),orders:['جديد','تجهيز','شحن','تم التسليم','ملغي'].map((name,i)=>({name,value:Math.round(42*factor*[.13,.19,.26,.38,.04][i])})),expenses:['تشغيل','تسويق','شحن','مرتجعات'].map((name,i)=>({name,value:Math.round(revenue*.2*[.35,.25,.26,.14][i])})),locations:['القاهرة','الجيزة','الإسكندرية','المنصورة','طنطا'].map((name,i)=>({name,value:Math.round(revenue*[.4,.26,.16,.1,.08][i])})),methods:['كاش','بطاقة','محفظة','تحويل'].map((name,i)=>({name,value:Math.round(revenue*[.35,.4,.19,.06][i])}))};
 const prodData=products.map((name,i)=>({name,qty:Math.max(1,Math.round((62-i*9)*factor)),value:Math.max(150,Math.round((35-i*4)*1300*factor))}));
 return{products:rawCount||Math.max(1,Math.round(134*factor)),customers:Math.round(329*factor),invoices:Math.round(126*factor),invoiceTotal:revenue,series,labels:series.map(x=>x.label),money:revenue,productsData:prodData,branchNames,matrix,empty:false};
}
function empty(){return `<div class="erp-empty"><span class="erp-empty-symbol">×</span><span>${tr('none')}</span></div>`;}
function donut(rows){const values=(rows||[]).filter(v=>v.value>0);if(!values.length)return empty();const total=values.reduce((a,x)=>a+x.value,0);let angle=0;const parts=values.map((r,i)=>{const start=angle;angle+=r.value/total*360;return `${colors[i%colors.length]} ${start.toFixed(2)}deg ${angle.toFixed(2)}deg`});return `<div class="erp-donut-wrap"><div class="erp-donut" style="background:conic-gradient(${parts.join(',')})"><div class="erp-donut-center">${money(total)}<small>${tr('sample')}</small></div></div><div class="erp-legend-vertical">${values.map((r,i)=>`<span><span><i style="background:${colors[i%colors.length]}"></i>${escapeHTML(r.name)}</span><b>${money(r.value)}</b></span>`).join('')}</div></div>`}
const svgText=(x,y,label,extra='')=>`<text x="${x}" y="${y}" class="erp-chart-label" ${extra}>${escapeHTML(label)}</text>`;
function lineChart(series,year=false){if(!series.length)return empty();const width=620,height=165;const data=year?Array.from({length:12},(_,i)=>({label:String(i+1),sales:Math.round(series[i%series.length].sales*(.48+i*.052)),returns:Math.round(series[i%series.length].returns*(.48+i*.052))})):series;
 const max=Math.max(1,...data.map(x=>x.sales))*1.18;const coords=(key)=>data.map((r,i)=>[35+i*((width-60)/(data.length-1)),height-25-r[key]/max*(height-45)]);const points=(key)=>coords(key).map(a=>a.map(n=>n.toFixed(1)).join(',')).join(' ');
 const gridlines=[0,.25,.5,.75,1].map(f=>`<line class="erp-gridline" x1="35" x2="600" y1="${(height-25-f*(height-45)).toFixed(1)}" y2="${(height-25-f*(height-45)).toFixed(1)}"/>`).join('');
 const area=`35,${height-25} ${points('sales')} 600,${height-25}`;
 return `<svg viewBox="0 0 ${width} ${height}" class="erp-chart" role="img" aria-label="${year?'Yearly':'Weekly'} area chart" preserveAspectRatio="none"><defs><linearGradient id="grad-${year?'yr':'sales'}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc5a0" stop-opacity=".34"/><stop offset="1" stop-color="#8cc5a0" stop-opacity="0"/></linearGradient></defs>${gridlines}<polygon points="${area}" fill="url(#grad-${year?'yr':'sales'})"/><polyline fill="none" stroke="#2a7654" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points('sales')}"/><polyline fill="none" stroke="#d0ae78" stroke-width="2" stroke-dasharray="5 6" points="${points('returns')}"/>${data.filter((_,i)=>i%Math.ceil(data.length/6)===0).map((d,i)=>svgText(35+(data.indexOf(d)*(width-60)/(data.length-1)),height-7,d.label,`text-anchor="middle"`)).join('')}</svg><div class="erp-legend"><span><i style="background:#2a7654"></i>${year?tr('invoices'):tr('sales')}</span><span><i style="background:#d0ae78"></i>${year?'Payments':tr('returns')}</span></div>`;
}
function barChart(series,methods=false){if(!series.length)return empty();const W=620,H=166;const keys=methods?['sales','cost','profit']:['sales','returns','cost','profit'];const cs=methods?['#3a8060','#d2b780','#8dbca0']:['#307657','#c8b17b','#8dbca0','#5b966f'];const max=Math.max(1,...series.flatMap(s=>keys.map(k=>s[k])))*1.2;let bars='';const w=520/series.length;
 series.forEach((r,i)=>{const center=55+i*w;keys.forEach((key,j)=>{const val=r[key],bh=Math.max(1,(val/max)*120);bars+=`<rect x="${(center+j*17).toFixed(1)}" y="${(H-26-bh).toFixed(1)}" width="13" height="${bh.toFixed(1)}" rx="3" fill="${cs[j]}" ><title>${escapeHTML(r.label)} · ${escapeHTML(key)} · ${money(val)}</title></rect>`;});bars+=svgText(center+22,H-7,r.label,`text-anchor="middle"`)});
 const lines=[0,.25,.5,.75,1].map(f=>`<line x1="35" y1="${H-26-f*120}" x2="600" y2="${H-26-f*120}" class="erp-gridline"/>`).join('');return `<svg viewBox="0 0 ${W} ${H}" class="erp-chart" role="img" aria-label="Grouped sales bars">${lines}${bars}</svg><div class="erp-legend">${keys.map((k,i)=>`<span><i style="background:${cs[i]}"></i>${tr(k)}</span>`).join('')}</div>`;
}
function ranking(rows,low=false){if(!rows?.length)return empty();return `<div class="erp-subheading"><span class="erp-legend">${low?'↘':'↗'} ${tr('sample')}</span><select class="erp-variant-select" aria-label="Variants"><option>${tr('withVariants')}</option><option>${tr('withoutVariants')}</option></select></div>${(low?[...rows].reverse():rows).slice(0,4).map((p,i)=>`<div class="erp-rank"><span class="erp-rank-ico">${i+1}</span><div class="erp-rank-text"><b>${escapeHTML(p.name)}</b><small>${money(p.qty)} قطعة</small></div><b class="erp-rank-amount">${money(p.value)} EGP</b></div>`).join('')}`}
function locations(rows){if(!rows?.length)return empty();const max=Math.max(...rows.map(x=>x.value));return rows.map(x=>`<div class="erp-progress-row"><span>${escapeHTML(x.name)}</span><div class="erp-progress-track"><div class="erp-progress-bar" style="width:${Math.round(100*x.value/max)}%"></div></div><b>${money(x.value)}</b></div>`).join('');}
function dataTable(id,model){if(model.empty)return empty();const records=id==='topUsers'?['مدير القاهرة','فريق الإسكندرية','مشرف المبيعات'].map((name,i)=>[name,Math.round(model.money*[.24,.17,.10][i]),Math.round(model.money*[.02,.01,.005][i])]):['التغليف','التوصيل','خيارات إضافية'].map((name,i)=>[name,Math.round(model.invoices*[.3,.2,.1][i]),Math.round(model.money*[.12,.07,.05][i])]);const th=id==='topUsers'?['الاسم','المبيعات','المرتجع','الصافي']:['الإضافة','الفواتير','القيمة','الصافي'];return `<div style="overflow:auto"><table class="erp-mini-table"><thead><tr>${th.map(x=>`<th>${escapeHTML(x)}</th>`).join('')}</tr></thead><tbody>${records.map(row=>`<tr><td>${escapeHTML(row[0])}</td><td class="erp-number">${money(row[1])}</td><td class="erp-number">${money(row[2])}</td><td class="erp-number">${money(row[1]-row[2])}</td></tr>`).join('')}</tbody></table></div>`;}
function renderWidget(id,m){if(ids.slice(0,4).includes(id)){const n=m[id];return `<div class="erp-big-number">${textOrDash(n)}<small>${id==='invoiceTotal'?tr('currency'):m.empty&&id!=='products'?tr('pending'):''}</small></div>`;}
 if(m.empty)return empty();
 if(id==='branches')return donut(m.matrix.branches);
 if(id==='comparison')return barChart(m.series);
 if(id==='totalSales')return `<div class="erp-subheading"><div class="erp-big-number" style="font-size:20px">${money(m.money)} <small>${tr('currency')}</small></div></div>`+lineChart(m.series);
 if(id==='categories')return donut(m.matrix.categories);
 if(id==='topProducts')return ranking(m.productsData);
 if(id==='lowProducts')return ranking(m.productsData,true);
 if(id==='locations')return locations(m.matrix.locations);
 if(id==='orders')return donut(m.matrix.orders);
 if(id==='expenses')return donut(m.matrix.expenses);
 if(id==='invoiceYear')return lineChart(m.series,true);
 if(id==='methods')return barChart(m.series,true);
 if(['topUsers','addons'].includes(id))return dataTable(id,m);
 return empty();}
function setBanner(){const b=$('erp-data-banner');b.textContent=state.mock?tr('sampleNotice'):tr('emptyNotice');$('erp-mock-stamp').textContent=state.mock?tr('sample'):tr('operational');$('erp-data-toggle').textContent=state.mock?tr('demoOn'):tr('demoOff');}
function applyLanguage(){const en=state.language==='en';document.documentElement.lang=en?'en':'ar';document.documentElement.dir=en?'ltr':'rtl';document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.dataset.i18n;if(labels[state.language][k])el.textContent=tr(k)});document.querySelectorAll('[data-widget-heading]').forEach(el=>el.textContent=titles[el.dataset.widgetHeading]?.[en?1:0]||el.textContent);saveStorage(localeKey,state.language);setBanner();}
function applyLayout(){for(const item of state.layout){const el=cardMap.get(item.id);if(!el)continue;el.hidden=!item.visible;el.style.setProperty('--widget-span',item.span);grid.append(el);}saveStorage(layoutKey,{main_dashboard:{},widgets:state.layout});}
function renderEditor(){const node=$('erp-editor-list');node.textContent='';for(const item of state.layout){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=item.visible;check.setAttribute('aria-label',titles[item.id]?.[state.language==='en'?1:0]||item.id);check.addEventListener('change',()=>{item.visible=check.checked;applyLayout()});const title=document.createElement('span');title.textContent=titles[item.id]?.[state.language==='en'?1:0]||item.id;label.append(check,title);node.append(label)}}
function renderAll(){applyLanguage();const model=buildModel();cards.forEach(el=>{const id=el.dataset.widget;el.querySelector('[data-widget-content]').innerHTML=renderWidget(id,model)});$('erp-range-label').textContent=`${state.from} ← ${state.to}`;$('erp-scope-label').textContent=state.scopeData?.sites?.map(s=>s.name).join('، ')||'معاينة جميع المواقع';setBanner();}
function selectedBranchIds(){const select=$('erp-branches');const selected=[...select.selectedOptions].map(x=>x.value);return selected.includes('all')?[]:selected;}
function refreshBranchSelect(){const select=$('erp-branches');const sites=state.scopeData?.sites||[{id:'sample-0',name:'فرع القاهرة'},{id:'sample-1',name:'فرع الجيزة'},{id:'sample-2',name:'فرع الإسكندرية'}];select.replaceChildren();select.add(new Option(tr('all'),'all'));sites.forEach(s=>select.add(new Option(s.name,s.id)));select.value='all';const products=$('erp-product-options');products.replaceChildren();const names=state.scopeData?.products?.map(p=>p.name)||['هودي قطن بريميوم','تيشيرت أساسي','بنطلون رياضي','قميص كتان'];names.forEach(n=>products.append(new Option(n)))}
async function loadRealContext(){if(demo){state.scopeData={scope:'demo',scopeId:'demo',sites:[{id:'sample-0',name:'فرع القاهرة'},{id:'sample-1',name:'فرع الجيزة'},{id:'sample-2',name:'فرع الإسكندرية'}],productsCount:0,products:[]};return;}
 const params=new URLSearchParams({scope:scope==='owner'?'owner':'tenant'});
 if(scope!=='owner')params.set('site',siteSlug);
 params.set('from',state.from);params.set('to',state.to);
 state.selectedSites.forEach(id=>params.append('branch_id[]',id));
 const response=await fetch('/api/erp/context?'+params.toString(),{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
 if(response.status===401){location.assign('/login');throw Error('Sign in required')}
 if(!response.ok)throw Error('Not authorized to view this analytics scope');
 state.scopeData=await response.json();}
async function saveDates(){if($('erp-from').value&&$('erp-to').value&&$('erp-from').value<=$('erp-to').value){state.from=$('erp-from').value;state.to=$('erp-to').value;saveStorage(dateKey,{dateRange:[state.from,state.to]});if(!demo){try{await loadRealContext()}catch{ /* keep last state and show scoped empty values */ }}renderAll();}}
function moveWidget(id,direction){const at=state.layout.findIndex(x=>x.id===id);const to=at+direction;if(at<0||to<0||to>=state.layout.length)return;const [item]=state.layout.splice(at,1);state.layout.splice(to,0,item);applyLayout();renderEditor();}
$('erp-from').value=state.from;$('erp-to').value=state.to;
$('erp-from').addEventListener('change',saveDates);$('erp-to').addEventListener('change',saveDates);
$('erp-branches').addEventListener('change',async()=>{state.selectedSites=selectedBranchIds();if(!demo){try{await loadRealContext()}catch{state.scopeData=null}}renderAll()});
$('erp-products').addEventListener('input',event=>{state.search=event.target.value;renderAll()});
$('erp-language').addEventListener('click',()=>{state.language=state.language==='ar'?'en':'ar';renderAll();renderEditor();refreshBranchSelect()});
$('erp-data-toggle').addEventListener('click',()=>{state.mock=!state.mock;renderAll()});
$('erp-edit').addEventListener('click',()=>{state.edit=!state.edit;root.classList.toggle('erp-editing',state.edit);$('erp-editor').hidden=!state.edit;$('erp-edit').classList.toggle('active',state.edit);$('erp-edit').lastElementChild.textContent=state.edit?tr('editDone'):tr('widgets');cards.forEach(c=>c.draggable=state.edit);renderEditor()});
$('erp-reset').addEventListener('click',()=>{state.layout=originalLayout();applyLayout();renderEditor();renderAll()});
grid.addEventListener('click',event=>{const up=event.target.closest('[data-move-up]');const down=event.target.closest('[data-move-down]');const size=event.target.closest('[data-span-toggle]');if(up)moveWidget(up.dataset.moveUp,-1);if(down)moveWidget(down.dataset.moveDown,1);if(size){const item=state.layout.find(x=>x.id===size.dataset.spanToggle);if(item){item.span=item.span===12?6:item.span===6?12:6;applyLayout();}}});
let dragged=null;
grid.addEventListener('dragstart',event=>{const c=event.target.closest('[data-widget]');if(!state.edit||!c){event.preventDefault();return;}dragged=c.dataset.widget;c.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged)});
grid.addEventListener('dragover',event=>{const c=event.target.closest('[data-widget]');if(c&&state.edit){event.preventDefault();event.dataTransfer.dropEffect='move';c.classList.add('drop-target')}});
grid.addEventListener('dragleave',event=>{event.target.closest('[data-widget]')?.classList.remove('drop-target')});
grid.addEventListener('drop',event=>{const c=event.target.closest('[data-widget]');if(!state.edit||!c||!dragged)return;event.preventDefault();const from=state.layout.findIndex(w=>w.id===dragged);const to=state.layout.findIndex(w=>w.id===c.dataset.widget);if(from>=0&&to>=0){const [m]=state.layout.splice(from,1);state.layout.splice(to,0,m);applyLayout();renderEditor();}dragged=null;cards.forEach(n=>n.classList.remove('drop-target','dragging'));});
grid.addEventListener('dragend',()=>{dragged=null;cards.forEach(n=>n.classList.remove('drop-target','dragging'))});
$('erp-menu').addEventListener('click',()=>{$('erp-side').classList.add('open');$('erp-overlay').hidden=false});
$('erp-overlay').addEventListener('click',()=>{$('erp-side').classList.remove('open');$('erp-overlay').hidden=true});
$('erp-notifications').addEventListener('click',()=>{const b=$('erp-data-banner');b.textContent=state.language==='ar'?'لا توجد تنبيهات جديدة.':'No new notifications.'});
(async()=>{try{applyLayout();await loadRealContext();refreshBranchSelect();renderAll();}catch(err){cards.forEach(c=>c.querySelector('[data-widget-content]').innerHTML=empty());$('erp-data-banner').textContent='تعذر تحميل البيانات أو ليس لديك صلاحية للوحة. يرجى تسجيل الدخول.';console.warn('ERP data unavailable:',err.message);}})();
