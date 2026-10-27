import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createStore} from '../src/store.mjs';
import {createApp} from '../src/server.mjs';
import {ERP_WIDGETS,erpContext,erpDashboardPage} from '../src/erp-dashboard.mjs';

const db=createStore(':memory:',{seed:false});
const owner=db.bootstrapOwner('owner-erp@example.invalid','this is a very strong owner test password !');
const a=db.createSite({slug:'alpha-erp',name:'Alpha Store',tagline:'Demo',accent:'#234b35',plan:'growth'},owner);
const b=db.createSite({slug:'beta-erp',name:'Beta Secret Store',tagline:'Demo',accent:'#335b45',plan:'growth'},owner);
const c=db.createSite({slug:'starter-erp',name:'Starter Store',tagline:'Demo',accent:'#445a55',plan:'starter'},owner);
db.addProduct(a,'Allowed Widget Product',10000,6,owner);
db.addProduct(b,'Sensitive Beta Product',12000,8,owner);
const invite=(site,email,role)=>{
 const raw=db.makeInvite(site,email,role,owner);
 return db.acceptInvite(raw,'very safe test password for tenant');
};
const manager=invite(a,'manager@example.invalid','manager');
const viewer=invite(a,'viewer@example.invalid','viewer');
const starterManager=invite(c,'starter@example.invalid','manager');
let app,server,origin;
const req=(pathname,cookie)=>fetch(origin+pathname,{redirect:'manual',headers:cookie?{cookie}:undefined});
const cookie=id=>'jame3_session='+db.createSession(id);
let cookieOwner,cookieManager,cookieViewer,cookieStarter;
before(async()=>{
 server=http.createServer((req,res)=>Promise.resolve(app(req,res)).catch(console.error));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
 app=createApp({store:db,publicOrigin:origin});
 cookieOwner=cookie(owner);cookieManager=cookie(manager);cookieViewer=cookie(viewer);cookieStarter=cookie(starterManager);
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});

test('all 17 unique dashboard widgets are registered',()=>{
 assert.equal(ERP_WIDGETS.length,17);
 assert.equal(new Set(ERP_WIDGETS.map(x=>x.id)).size,17);
});
test('preview HTML uses the original premium visual assets and 17 widget cards',()=>{
 const html=erpDashboardPage({scope:'demo'});
 assert.match(html,/owner-console\.css/);
 assert.match(html,/erp-dashboard\.css/);
 assert.match(html,/erp-dashboard\.mjs/);
 assert.match(html,/data-scope="demo"/);
 assert.equal((html.match(/class="erp-widget erp-widget-/g)||[]).length,17);
});
test('public demo is visible to anyone but does not contain private products',async()=>{
 const res=await req('/demo/erp');assert.equal(res.status,200);
 const html=await res.text();assert.match(html,/DEMO PREVIEW/);
 assert.doesNotMatch(html,/Sensitive Beta Product|Allowed Widget Product/);
});
test('owner analytics requires owner login',async()=>{
 assert.equal((await req('/owner/erp')).status,303);
 assert.equal((await req('/owner/erp',cookieManager)).status,403);
 assert.equal((await req('/owner/erp',cookieOwner)).status,200);
});
test('tenant reports require analytics entitlement AND view_reports role',async()=>{
 assert.equal((await req('/dashboard/alpha-erp/erp',cookieManager)).status,200);
 assert.equal((await req('/dashboard/alpha-erp/erp',cookieViewer)).status,403);
 assert.equal((await req('/dashboard/starter-erp/erp',cookieStarter)).status,403);
});
test('manager cannot read another brand dashboard even by guessing URL',async()=>{
 assert.equal((await req('/dashboard/beta-erp/erp',cookieManager)).status,403);
 const res=await req('/api/erp/context?scope=tenant&site=beta-erp',cookieManager);
 assert.equal(res.status,403);
 assert.doesNotMatch(await res.text(),/Sensitive Beta Product/);
});
test('manager cannot escalate API scope to owner or bypass with query params',async()=>{
 assert.equal((await req('/api/erp/context?scope=owner',cookieManager)).status,403);
 assert.equal((await req('/api/erp/context?scope=invalid',cookieManager)).status,400);
 assert.equal((await req('/api/erp/context?scope=tenant&site=alpha-erp&site=beta-erp',cookieManager)).status,400);
 const res=await req('/api/erp/context?scope=tenant&site=alpha-erp',cookieManager);
 assert.equal(res.status,200);
 const content=await res.json();
 assert.equal(content.productsCount,1);
 assert.equal(content.sites.length,1);
 assert.equal(content.sites[0].slug,'alpha-erp');
 assert.equal(content.products[0].name,'Allowed Widget Product');
 assert.equal((await req('/api/erp/context?scope=tenant&site=alpha-erp&branch_id%5B%5D='+encodeURIComponent(b.id),cookieManager)).status,403);
 assert.ok(!JSON.stringify(content).includes('Sensitive Beta Product'));
 assert.ok(!JSON.stringify(content).includes('password'));
});
test('owner-only aggregated API has all sites, the tenant API is scoped',async()=>{
 const res=await req('/api/erp/context?scope=owner',cookieOwner);
 assert.equal(res.status,200);
 const x=await res.json();assert.equal(x.productsCount,2);assert.equal(x.sites.length,3);
 const filtered=await req('/api/erp/context?scope=owner&branch_id%5B%5D='+encodeURIComponent(a.id),cookieOwner);
 const onlyAlpha=await filtered.json();assert.equal(onlyAlpha.productsCount,1);assert.equal(onlyAlpha.sites.length,1);
 const ownerTenant=await req('/api/erp/context?scope=tenant&site=beta-erp',cookieOwner);assert.equal(ownerTenant.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.match(res.headers.get('content-type'),/application\/json/);
});
test('private analytics have noindex, CSP, no-store headers',async()=>{
 const res=await req('/dashboard/alpha-erp/erp',cookieManager);
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(await res.text(),/noindex,nofollow/);
});
test('ERP module assets serve only known files',async()=>{
 for(const f of ['erp-dashboard.css','erp-dashboard.mjs']){
  const response=await req('/assets/'+f);assert.equal(response.status,200);
  assert.match(response.headers.get('x-content-type-options'),/nosniff/);
 }
 assert.equal((await req('/assets/../../src/store.mjs')).status,404);
});
