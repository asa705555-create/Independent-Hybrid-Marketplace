import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {DEMO_SITES,DEMO_PRODUCTS,demoInvoices,buildDemoModel} from '../public/erp-demo-data.mjs';
import {createStore} from '../src/store.mjs';
import {createApp} from '../src/server.mjs';

const year=2026,range={from:'2026-10-01',to:'2026-10-31'};
const owner=()=>buildDemoModel({...range,view:'owner'});
const brand=()=>buildDemoModel({...range,view:'brand'});

test('fictional fixture is deterministic and contains only declared sample sites/products',()=>{
 const a=demoInvoices(year),b=demoInvoices(year);
 assert.deepEqual(a,b);
 assert.ok(a.length>200);
 assert.ok(a.every(x=>DEMO_SITES.some(s=>s.id===x.siteId)));
 assert.ok(a.every(x=>DEMO_PRODUCTS.some(p=>p.id===x.productId)));
 assert.ok(a.every(x=>x.profit===x.sales-x.cost-x.returns));
});
test('owner view includes three sample sites; brand preview includes only its own site',()=>{
 const o=owner(),b=brand();
 assert.equal(o.sites.length,3);
 assert.deepEqual(b.sites.map(s=>s.id),['sample-0']);
 assert.ok(o.invoices>b.invoices);
 assert.ok(o.invoiceTotal>b.invoiceTotal);
 assert.equal(o.products,DEMO_PRODUCTS.length*3);
 assert.equal(b.products,DEMO_PRODUCTS.length);
});
test('brand cannot expand scope by injecting another branch into demo filters',()=>{
 const base=brand();
 const extra=buildDemoModel({...range,view:'brand',branchIds:['sample-2']});
 assert.deepEqual(extra.sites,base.sites);
 assert.equal(extra.invoiceTotal,base.invoiceTotal);
});
test('sample owner branch filters change the actual invoice rows and sums',()=>{
 const all=owner();const selected=DEMO_SITES.map(s=>buildDemoModel({...range,view:'owner',branchIds:[s.id]}));
 assert.equal(selected.reduce((a,x)=>a+x.invoices,0),all.invoices);
 assert.equal(selected.reduce((a,x)=>a+x.invoiceTotal,0),all.invoiceTotal);
 assert.deepEqual(selected.map(x=>x.sites.length),[1,1,1]);
});
test('product search filters invoices, quantities and KPI without inventing multipliers',()=>{
 const all=owner();const hoodie=buildDemoModel({...range,search:'هودي',view:'owner'});
 assert.equal(hoodie.products,3);
 assert.ok(hoodie.invoices<all.invoices);
 assert.ok(hoodie.productsData.every(p=>p.name.includes('هودي')));
 assert.equal(hoodie.invoiceTotal,hoodie.series.reduce((s,x)=>s+x.sales-x.returns,0));
});
test('date filters use invoice dates; no transactions gives empty state and zero financial numbers',()=>{
 const first=buildDemoModel({view:'owner',from:'2026-10-01',to:'2026-10-08'});
 const late=buildDemoModel({view:'owner',from:'2026-10-18',to:'2026-10-31'});
 assert.ok(first.invoices>0&&late.invoices>0);
 assert.notEqual(first.invoiceTotal,late.invoiceTotal);
 const noData=buildDemoModel({view:'owner',from:'2026-10-29',to:'2026-10-31'});
 assert.equal(noData.empty,true);
 assert.equal(noData.invoiceTotal,0);
 assert.equal(noData.invoices,0);
 assert.deepEqual(noData.series,[]);
});
test('yearly invoice chart is derived from fixture rows, not a chart-only fabricated multiplier',()=>{
 const model=owner();
 assert.equal(model.yearlySeries.length,12);
 assert.equal(model.yearlySeries[9].sales,model.series.reduce((acc,w)=>acc+w.sales,0));
 assert.ok(model.yearlySeries[0].sales>0);
});
test('payment chart contains cash, card, wallet and transfer values that balance with net invoices',()=>{
 const model=owner();
 assert.equal(model.series.reduce((sum,r)=>sum+r.cash+r.card+r.wallet+r.bank,0),model.invoiceTotal);
 assert.ok(model.methodsSeries.length>0);
});
test('variant toggle consolidates rankings without changing total revenue',()=>{
 const yes=buildDemoModel({...range,withVariants:true}),no=buildDemoModel({...range,withVariants:false});
 assert.ok(yes.productsData.length>no.productsData.length);
 assert.equal(yes.invoiceTotal,no.invoiceTotal);
 assert.ok(no.productsData.every(p=>!p.name.includes(' — ')));
});
test('aggregate sample profit matches income less returns and costs',()=>{
 const model=owner();
 assert.equal(model.series.reduce((acc,r)=>acc+r.profit,0),model.series.reduce((acc,r)=>acc+r.sales-r.returns-r.cost,0));
});
test('bad date inputs do not result in malformed chart data',()=>{
 assert.throws(()=>buildDemoModel({view:'owner',from:'not a date',to:'2026-10-31'}),RangeError);
 assert.throws(()=>buildDemoModel({view:'owner',from:'2026-11-01',to:'2026-10-01'}),RangeError);
});

const db=createStore(':memory:',{seed:false});
const id=db.bootstrapOwner('owner-fixture@example.invalid','strong-demo-fixture-password-examples');
const siteA=db.createSite({slug:'fixture-a',name:'Fixture A',tagline:'A',accent:'#123456',plan:'growth'},id);
const siteB=db.createSite({slug:'fixture-b',name:'Fixture B',tagline:'B',accent:'#234567',plan:'growth'},id);
let app,server,url;
before(async()=>{
 app=createApp({store:db,publicOrigin:'http://localhost:3000',publicPreviewHome:true});
 server=http.createServer((req,res)=>app(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 url='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
test('opt-in public preview homepage renders dashboard with correct role and keeps private API gated',async()=>{
 const ownerPreview=await fetch(url+'/?view=owner');
 const brandPreview=await fetch(url+'/?view=brand');
 assert.equal(ownerPreview.status,200);
 assert.match(await ownerPreview.text(),/الإدارة الرئيسية/);
 assert.match(await brandPreview.text(),/البراند التجريبي/);
 assert.equal((await fetch(url+'/api/erp/context?scope=owner',{redirect:'manual'})).status,303);
 assert.equal((await fetch(url+'/owner/erp',{redirect:'manual'})).status,303);
});
test('public demo preview remains independent of privileged sites and products',async()=>{
 db.addProduct(siteA,'Secret Product X',10000,3,id);
 db.addProduct(siteB,'Secret Product Y',10000,3,id);
 const response=await fetch(url+'/demo/erp?view=owner');
 assert.equal(response.status,200);
 const body=await response.text();
 assert.doesNotMatch(body,/Secret Product X|Secret Product Y|Fixture A|Fixture B/);
});
test('new client-side fixture module is served from explicit public asset allowlist only',async()=>{
 const response=await fetch(url+'/assets/erp-demo-data.mjs');
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/javascript/);
 assert.match(await response.text(),/DEMO_SITES/);
 assert.equal((await fetch(url+'/assets/src/security.mjs')).status,404);
});
