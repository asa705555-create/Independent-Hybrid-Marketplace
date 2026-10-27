import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createStore} from '../src/store.mjs';
import {ownerCommandCenter} from '../src/owner-console.mjs';
import {safeCsvCell, sitesCsv} from '../src/reports.mjs';
import {createApp} from '../src/server.mjs';

const db=createStore(':memory:',{seed:false});
const owner=db.bootstrapOwner('owner@jame3.test','a strong test-only password 2026 !');
const x=db.createSite({slug:'alpha-demo',name:'Alpha demo',tagline:'a',accent:'#225533',plan:'growth'},owner);
const y=db.createSite({slug:'beta-demo',name:'Beta demo',tagline:'b',accent:'#992244',plan:'starter'},owner);
db.addProduct(x,'Demo Product',12000,7,owner);
db.addProduct(x,'Another product',1000,4,owner);
db.addProduct(y,'More',3000,2,owner);
const session=db.session(db.createSession(owner));
let server, handler, origin, ownerCookie, memberCookie;
const httpReq=(path,opts={})=>fetch(origin+path,{redirect:'manual',...opts});

before(async()=>{
  server=http.createServer((req,res)=>handler(req,res));
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  origin=`http://127.0.0.1:${server.address().port}`;
  handler=createApp({store:db,publicOrigin:origin});
  const login=await httpReq('/session/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'owner@jame3.test',password:'a strong test-only password 2026 !'})});
  assert.equal(login.status,303);
  ownerCookie=login.headers.get('set-cookie').split(';')[0];
  const raw=db.makeInvite(x,'viewer@jame3.test','viewer',owner);
  const viewer=db.acceptInvite(raw,'test-only-viewer-password-2026');
  memberCookie='jame3_session='+db.createSession(viewer);
});
after(async()=>{await new Promise(ok=>server.close(ok));db.close()});

test('owner snapshot uses actual database totals and correct per-site joins',()=>{
  const r=db.ownerSnapshot();
  assert.equal(r.products,3);
  assert.equal(r.members,1);
  assert.equal(r.bySite[x.id].products,2);
  assert.equal(r.bySite[x.id].staff,1);
  assert.equal(r.bySite[y.id].products,1);
  assert.equal(r.bySite[y.id].staff,0);
});
test('dashboard prints real operational metrics and explicit no-billing notices',()=>{
 const html=ownerCommandCenter(db.listSites(),db.listAudit(),session,{statistics:db.ownerSnapshot()});
 for(const marker of ['مركز القيادة','المنتجات التجريبية','إدارة المواقع','إنشاء الموقع الآن','لا توجد بيانات إنتاجية','الدفع','<html','owner/reports/sites.csv'])assert.ok(html.includes(marker),marker);
 assert.match(html,/Alpha demo/);
 assert.match(html,/Beta demo/);
});
test('owner-only route redirects unauthenticated visitors',async()=>{
 const res=await httpReq('/owner');assert.equal(res.status,303);
 assert.equal(res.headers.get('location'),'/login');
});
test('owner-only CSV route rejects anonymous and regular tenant staff',async()=>{
 const publicRes=await httpReq('/owner/reports/sites.csv');assert.equal(publicRes.status,303);
 const staffRes=await httpReq('/owner/reports/sites.csv',{headers:{cookie:memberCookie}});assert.equal(staffRes.status,403);
 assert.doesNotMatch(await staffRes.text(),/Site slug/);
});
test('owner-only CSV includes real tenant counts',async()=>{
 const r=await httpReq('/owner/reports/sites.csv',{headers:{cookie:ownerCookie}});
 assert.equal(r.status,200);
 assert.match(r.headers.get('content-disposition'),/attachment/);
 const csv=await r.text();
 assert.match(csv,/alpha-demo/);assert.match(csv,/beta-demo/);
 assert.match(csv,/"2","1"/);
 assert.match(csv,/"1","0"/);
});
test('CSV formula injection is neutralized even after leading whitespace',()=>{
 for(const input of ['=1+1','+1-2','-SUM(1,2)','@SUM(A1)','  =cmd','\t@trigger']){
  const v=safeCsvCell(input);
  assert.match(v,/^"'/);
 }
 assert.equal(safeCsvCell('A"B'),'"A""B"');
 assert.equal(safeCsvCell('a\nb'),'"a b"');
});
test('owner dashboard escapes untrusted tenant strings',()=>{
 const z=db.createSite({slug:'escape-test',name:'<img src=x onerror=alert(1)>',tagline:'test',accent:'#123456',plan:'starter'},owner);
 const html=ownerCommandCenter(db.listSites(),db.listAudit(),session,{statistics:db.ownerSnapshot()});
 assert.doesNotMatch(html,/<img src=x onerror=/);
 assert.match(html,/&lt;img/);
 assert.ok(z.id);
});
test('new CSS and JS assets are served without internal data',async()=>{
 for(const file of ['owner-console.css','owner-console.mjs','premium.css']){
   const res=await httpReq('/assets/'+file);
   assert.equal(res.status,200);
   const content=await res.text();assert.ok(content.length>100);
   assert.match(res.headers.get('x-content-type-options'),/nosniff/);
 }
});
test('owner-only HTML has no-store, noindex and restrictive CSP',async()=>{
 const r=await httpReq('/owner',{headers:{cookie:ownerCookie}});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
 const h=await r.text();assert.match(h,/noindex,nofollow/);
 assert.match(h,/owner-console\.mjs/);
});
test('CSV does not leak owner email or password hashes',()=>{
 const csv=sitesCsv(db.listSites(),db.ownerSnapshot());
 assert.doesNotMatch(csv,/owner@jame3.test/);
 assert.doesNotMatch(csv,/password_hash/);
});
