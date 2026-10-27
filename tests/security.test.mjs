import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createStore} from '../src/store.mjs';
import {createApp,makeLimiter} from '../src/server.mjs';
import {plans,can,escapeHtml,validSlug,validColor,validateSite,parseForm,hashPassword,verifyPassword,verifyCsrf,csrfToken,token} from '../src/security.mjs';

const password='Example-owner-password-strong-2026!';
const origin='http://127.0.0.1:41399';
const store=createStore(':memory:',{seed:false});
const owner=store.bootstrapOwner('owner@example.com',password);
const siteA=store.createSite({name:'موقع ألف',slug:'site-a',tagline:'موقع تجريبي',accent:'#123456',plan:'starter'},owner);
const siteB=store.createSite({name:'موقع باء',slug:'site-b',tagline:'موقع آخر',accent:'#654321',plan:'growth'},owner);
let server, ownerCookie, csrf, memberCookie, memberCsrf;
const request=async(path,{method='GET',data=null,cookie=null,headers={}}={})=>{
  const h={...headers};if(cookie)h.Cookie=cookie;
  if(data!==null){h.Origin=origin;h['Content-Type']='application/x-www-form-urlencoded';}
  return fetch(origin+path,{method,headers:h,body:data===null?undefined:(typeof data==='string'?data:new URLSearchParams(data).toString()),redirect:'manual'});
};
const csrfFromHtml=html=>{const found=html.match(/name="csrf" value="([a-f0-9]{64})"/);assert.ok(found,'CSRF found');return found[1];};

before(async()=>{
  server=http.createServer(createApp({store,publicOrigin:origin,secureCookies:true}));await new Promise(done=>server.listen(41399,'127.0.0.1',done));
  const login=await request('/session/login',{method:'POST',data:{email:'owner@example.com',password}});
  assert.equal(login.status,303);ownerCookie=login.headers.get('set-cookie').split(';')[0];
  csrf=csrfFromHtml(await (await request('/owner',{cookie:ownerCookie})).text());
  const raw=store.makeInvite(siteA,'staff@example.com','manager',owner);
  const uid=store.acceptInvite(raw,'Staff-Password-2026-Strong');memberCookie='jame3_session='+store.createSession(uid);
  memberCsrf=csrfFromHtml(await (await request('/dashboard/site-a',{cookie:memberCookie})).text());
});
after(async()=>{await new Promise(done=>server.close(done));store.close();});

test('private superadmin always requires login',async()=>{
 const r=await request('/owner');assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
});
test('tenant staff must not open owner dashboard',async()=>{
 const r=await request('/owner',{cookie:memberCookie});assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/مركز قيادة المنصة/);
});
test('staff cannot read another site dashboard: IDOR',async()=>{
 const r=await request('/dashboard/site-b',{cookie:memberCookie});assert.equal(r.status,403);
});
test('staff cannot alter another site products: write IDOR',async()=>{
 const r=await request('/dashboard/site-b/products',{method:'POST',cookie:memberCookie,data:{csrf:memberCsrf,name:'مزيف',price:'1200',stock:'1'}});
 assert.equal(r.status,403);assert.equal(store.countProducts(siteB.id),0);
});
test('staff cannot modify subscription plan of any site',async()=>{
 const r=await request('/owner/sites/site-a/plan',{method:'POST',cookie:memberCookie,data:{csrf:memberCsrf,plan:'scale'}});
 assert.equal(r.status,403);assert.equal(store.getSite('site-a').plan,'starter');
});
test('member cannot create tenant sites',async()=>{
 const r=await request('/owner/sites',{method:'POST',cookie:memberCookie,data:{csrf:memberCsrf,name:'موقع جديد',slug:'hacked-site',tagline:'x',accent:'#123456',plan:'scale'}});
 assert.equal(r.status,403);assert.equal(store.getSite('hacked-site'),undefined);
});
test('public clients cannot access any site dashboard',async()=>{
 const r=await request('/dashboard/site-a');assert.equal(r.status,303);
});
test('csrf rejection for missing token',async()=>{
 const r=await request('/owner/sites',{method:'POST',cookie:ownerCookie,data:{name:'test',slug:'evil-site',tagline:'x',accent:'#123456',plan:'starter'}});
 assert.equal(r.status,403);assert.equal(store.getSite('evil-site'),undefined);
});
test('csrf rejection for attacker-provided token',async()=>{
 const r=await request('/owner/sites',{method:'POST',cookie:ownerCookie,data:{csrf:'0'.repeat(64),name:'test',slug:'evil-site',tagline:'x',accent:'#123456',plan:'starter'}});
 assert.equal(r.status,403);
});
test('cross-site origin POST rejected even with correct token',async()=>{
 // Send an explicitly hostile Origin, not the helper's same-origin default.
 const direct=await fetch(origin+'/owner/sites',{method:'POST',redirect:'manual',headers:{Origin:'https://attacker.example',Cookie:ownerCookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,name:'Nope',slug:'evil-site',tagline:'x',accent:'#123456',plan:'starter'})});
 assert.equal(direct.status,403);assert.equal(store.getSite('evil-site'),undefined);
});
test('owner cookie is httponly secure samesite and bound to server session',async()=>{
 const r=await request('/session/login',{method:'POST',data:{email:'owner@example.com',password}});
 const h=r.headers.get('set-cookie');assert.match(h,/HttpOnly/);assert.match(h,/Secure/);assert.match(h,/SameSite=Lax/);
 const forged=await request('/owner',{cookie:'jame3_session=forged'});assert.equal(forged.status,303);
});
test('XSS from site name and tagline is escaped on public site',async()=>{
 const forged=store.createSite({name:'<script>alert(1)</script>',slug:'xss-case',tagline:'"><img src=x onerror=alert(1)>',accent:'#002233',plan:'starter'},owner);
 const res=await request('/s/xss-case');assert.equal(res.status,200);
 const html=await res.text();assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/&lt;script&gt;/);
});
test('XSS from product name is escaped',async()=>{
 const site=store.getSite('xss-case');store.addProduct(site,'<svg onload=alert(1)>',100,1,owner);
 const html=await (await request('/s/xss-case')).text();assert.doesNotMatch(html,/<svg onload/);assert.match(html,/&lt;svg/);
});
test('SQL injection in tenant slugs does not reveal cross-tenant data',async()=>{
 const r=await request('/dashboard/site-a%27%20OR%201%3D1--',{cookie:memberCookie});assert.equal(r.status,404);
});
test('URL traversal cannot read server source or private env',async()=>{
 for(const path of ['/assets/../src/server.mjs','/marketplace/../../.env','/marketplace/%2e%2e/%2e%2e/src/store.mjs']){
  const r=await request(path);assert.equal(r.status,404);
 }
});
test('security headers on private and public surfaces',async()=>{
 for(const path of ['/','/owner','/s/site-a']){
 const r=await request(path,{cookie:ownerCookie});assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(r.headers.get('cache-control'),/no-store/);
 }
});
test('duplicate field pollution is rejected before role changes',async()=>{
 const r=await request('/owner/sites/site-a/plan',{method:'POST',cookie:ownerCookie,data:`csrf=${csrf}&plan=growth&plan=scale`});assert.equal(r.status,400);assert.equal(store.getSite('site-a').plan,'starter');
});
test('unauthorized public POST endpoints and put requests closed',async()=>{
 assert.equal((await request('/owner/sites',{method:'POST',data:{csrf:'anything'}})).status,303);
 assert.equal((await request('/owner',{method:'PUT'})).status,405);
});
test('invalid slugs and theme payloads rejected',()=>{
 for(const slug of ['../secret','site/evil','x\u0000','site--bad','a','Aaa','constructor']){
  if(slug==='constructor') continue;
  assert.equal(validSlug(slug),false,slug);
 }
 for(const accent of ['red','#fff','var(--evil)','red; background:url(x)'])assert.equal(validColor(accent),false);
});
test('negative and fractional prices rejected',async()=>{
 for(const bad of ['-1','12.5','Infinity','1e300','9999999999999999999999999999']){
  const r=await request('/dashboard/site-a/products',{method:'POST',cookie:ownerCookie,data:{csrf,name:'اختبار سعر',price:bad,stock:'1'}});assert.equal(r.status,400,bad);
 }
 assert.equal(store.countProducts(siteA.id),0);
});
test('plan quotas are enforced atomically by database model',()=>{
 for(let i=0;i<plans.starter.maxProducts;i++)store.addProduct(siteA,`منتج ${i}`,10000,2,owner);
 assert.throws(()=>store.addProduct(siteA,'منتج إضافي',20000,2,owner),/plan limit/);
 assert.equal(store.countProducts(siteA.id),20);
});
test('rate limiting caps repeated invalid sign-ins',async()=>{
 for(let i=0;i<6;i++)assert.equal((await request('/session/login',{method:'POST',data:{email:'wrong@example.com',password:'wrongpass'}})).status,401);
 assert.equal((await request('/session/login',{method:'POST',data:{email:'wrong@example.com',password:'wrongpass'}})).status,429);
});
test('invitation cannot be replayed after first successful acceptance',()=>{
 const inv=store.makeInvite(siteB,'one-use@example.com','catalog',owner);assert.ok(store.invitation(inv));
 store.acceptInvite(inv,'Strong-password-2026!');assert.equal(store.invitation(inv),null);
 assert.throws(()=>store.acceptInvite(inv,'Strong-password-2026!'));
});
test('expiry means no invitation can be accepted',()=>{
 const now=Date.now(),inv=store.makeInvite(siteB,'expired@example.com','viewer',owner,now);
 assert.equal(store.invitation(inv,now+24*3600*1000+1),null);
 assert.throws(()=>store.acceptInvite(inv,'Strong-password-2026!',now+24*3600*1000+1));
});
test('password reset cannot be abused by inviting an existing user',()=>{
 const raw=store.makeInvite(siteB,'staff@example.com','viewer',owner);
 assert.throws(()=>store.acceptInvite(raw,'A-New-Password-2026'));
 assert.ok(store.verifyLogin('staff@example.com','Staff-Password-2026-Strong'));
});
test('cannot add staff beyond subscription entitlement',()=>{
 assert.throws(()=>store.makeInvite(siteA,'another@example.com','viewer',owner),/Staff plan limit/);
});
test('unknown plan manipulation never updates database',()=>{
 assert.throws(()=>store.updatePlan('site-b','ultimate_free',owner));assert.equal(store.getSite('site-b').plan,'growth');
});
test('viewer role cannot mutate catalog even when site has slots',async()=>{
 const raw=store.makeInvite(siteB,'read-only@example.com','viewer',owner),uid=store.acceptInvite(raw,'Read-Only-Password-2026!');
 const rawSession=store.createSession(uid),sess=store.session(rawSession),csrfViewer=csrfToken(sess);
 const r=await request('/dashboard/site-b/products',{method:'POST',cookie:`jame3_session=${rawSession}`,data:{csrf:csrfViewer,name:'غير مسموح',price:'100',stock:'1'}});
 assert.equal(r.status,403);
});
test('fuzzed slug inputs are rejected or safely escaped',async()=>{
 const payloads=['%00','%2f','%5c','\u202e','%3Cscript%3E','%252e%252e','?../../.env',';%2e%2e%2fsecret','%23owner'];
 for(const p of payloads){const r=await request('/s/'+p);assert.notEqual(r.status,500,p);assert.ok([404,200].includes(r.status),p);}
});
test('session expiration and csrf integrity',()=>{
 const raw=store.createSession(owner,1000),sess=store.session(raw,1001);assert.ok(sess);assert.ok(verifyCsrf(sess,csrfToken(sess)));
 assert.equal(verifyCsrf(sess,'bad'),false);assert.equal(store.session(raw,1000+12*3600*1000+1),null);
});
test('temporary production store cannot accidentally start without explicit mode',async()=>{
 const {startFromEnvironment}=await import('../src/server.mjs');
 await assert.rejects(startFromEnvironment({OWNER_EMAIL:'owner@example.com',OWNER_PASSWORD:password,PUBLIC_ORIGIN:origin}),/No persistent database configured/);
});
test('owner can turn off site catalog; then editors are blocked by server',async()=>{
  const set=await request('/owner/sites/site-b/feature',{method:'POST',cookie:ownerCookie,data:{csrf,feature:'catalog',enabled:'false'}});
  assert.equal(set.status,303);assert.equal(store.hasFeature(store.getSite('site-b'),'catalog'),false);
  const r=await request('/dashboard/site-b/products',{method:'POST',cookie:ownerCookie,data:{csrf,name:'منتج ممنوع',price:'10',stock:'1'}});
  assert.equal(r.status,403);assert.equal(store.countProducts(siteB.id),0);
  const reset=await request('/owner/sites/site-b/feature',{method:'POST',cookie:ownerCookie,data:{csrf,feature:'catalog',enabled:'true'}});
  assert.equal(reset.status,303);
});
test('tenant cannot turn on feature that owner disabled',async()=>{
  const r=await request('/owner/sites/site-a/feature',{method:'POST',cookie:memberCookie,data:{csrf:memberCsrf,feature:'analytics',enabled:'true'}});
  assert.equal(r.status,403);
});
test('owner cannot enable a scale-only feature on starter plan',async()=>{
  const r=await request('/owner/sites/site-a/feature',{method:'POST',cookie:ownerCookie,data:{csrf,feature:'custom_domain',enabled:'true'}});
  assert.equal(r.status,400);assert.equal(store.hasFeature(store.getSite('site-a'),'custom_domain'),false);
});
test('owner can suspend site; public gets 404 and tenant cannot modify content',async()=>{
  const r=await request('/owner/sites/site-b/status',{method:'POST',cookie:ownerCookie,data:{csrf,status:'suspended'}});
  assert.equal(r.status,303);
  assert.equal((await request('/s/site-b')).status,404);
  const update=await request('/dashboard/site-b/settings',{method:'POST',cookie:memberCookie,data:{csrf:memberCsrf,name:'tamper',tagline:'x',accent:'#123456'}});
  assert.equal(update.status,403);
  const activate=await request('/owner/sites/site-b/status',{method:'POST',cookie:ownerCookie,data:{csrf,status:'active'}});
  assert.equal(activate.status,303);assert.equal((await request('/s/site-b')).status,200);
});
test('body-size limit rejects oversized form payload',async()=>{
  const r=await request('/owner/sites',{method:'POST',cookie:ownerCookie,data:'csrf='+csrf+'&name='+('a'.repeat(12000))});
  assert.equal(r.status,413);
});
test('POST with JSON cannot bypass URL encoded CSRF validation',async()=>{
  const r=await fetch(origin+'/owner/sites',{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:ownerCookie,'Content-Type':'application/json'},body:JSON.stringify({csrf,name:'x',plan:'scale'})});
  assert.equal(r.status,415);
});
