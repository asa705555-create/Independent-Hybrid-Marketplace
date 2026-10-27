import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from '../scripts/migrate-postgres.mjs';
import { createPostgresStore } from '../src/postgres-store.mjs';
import { createStore } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
import http from 'node:http';

function fakePool(handle) {
 const logs=[];
 const client={ async query(sql,args=[]) {logs.push({sql,args}); return handle(sql,args,logs);},release() {logs.push({sql:'RELEASE',args:[]});} };
 return {logs,client,connect:async()=>client,query:(sql,args=[])=>client.query(sql,args)};
}

test('migration applies once under a lock and verifies immutable checksum', async()=>{
 const hashes=new Map();
 const pool=fakePool((sql,args)=>{
   if(sql.includes('SELECT sha256 FROM jame3_private.schema_migrations'))return {rows: hashes.has(args[0])?[{sha256:hashes.get(args[0])}]:[]};
   if(sql.includes('INSERT INTO jame3_private.schema_migrations')) hashes.set(args[0],args[1]);
   return {rows:[],rowCount:1};
 });
 const content='CREATE TABLE example(id integer);';
 await migrate(pool,[{name:'001_safe',sql:content}]);
 assert.ok(pool.logs.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(pool.logs.some(x=>x.sql==='COMMIT'));
 await migrate(pool,[{name:'001_safe',sql:content}]);
 assert.equal(pool.logs.filter(x=>x.sql===content).length,1,'never reapply migration');
 await assert.rejects(migrate(pool,[{name:'001_safe',sql:content+'-- tampered'}]),/Previously applied migration changed/);
 assert.ok(pool.logs.some(x=>x.sql==='ROLLBACK'));
});

test('dedicated migration uses private schema and restrictive FKs',()=>{
 const ddl=readFileSync(new URL('../db/001_postgres_control_plane.sql',import.meta.url),'utf8');
 for(const name of ['users','sites','memberships','products','invitations','sessions','owner_mfa_replay','audit_events']){
   assert.match(ddl,new RegExp(`CREATE TABLE IF NOT EXISTS jame3_private\\.${name} \\(`));
 }
 assert.match(ddl,/REVOKE ALL ON SCHEMA jame3_private FROM PUBLIC/);
 assert.match(ddl,/REFERENCES jame3_private\.sites\(id\)/);
 assert.doesNotMatch(ddl,/auth\.users|TONE-Store|PROTOS-Website/);
});

test('postgres adapter uses bound values and hashes opaque session tokens',async()=>{
 const pool=fakePool((sql,args)=>({rows:[],rowCount:1}));
 const store=await createPostgresStore({pool});
 const site=await store.getSite("x' OR 1=1 --");
 assert.equal(site,null);
 const select=pool.logs.find(x=>x.sql.includes('FROM jame3_private.sites WHERE slug='));
 assert.match(select.sql,/slug=\$1/);
 assert.deepEqual(select.args,["x' OR 1=1 --"]);
 await store.session('raw-session-not-on-server');
 const s=pool.logs.find(x=>x.sql.includes('s.token_hash=') && x.sql.includes('sessions'));
 assert.ok(s.args[0].match(/^[a-f0-9]{64}$/));
 assert.notEqual(s.args[0],'raw-session-not-on-server');
});

test('postgres owner OTP replay protection is a conditional one-write operation',async()=>{
 const pool=fakePool(()=>({rows:[],rowCount:1}));
 const store=await createPostgresStore({pool});
 assert.equal(await store.consumeOwnerOtp('00000000-0000-4000-8000-000000000001',120),true);
 const stmt=pool.logs.find(x=>x.sql.includes('owner_mfa_replay'));
 assert.match(stmt.sql,/WHERE jame3_private\.owner_mfa_replay\.last_step < EXCLUDED\.last_step/);
 assert.deepEqual(stmt.args,['00000000-0000-4000-8000-000000000001',120]);
 assert.equal(await store.consumeOwnerOtp('x',-1),false);
});

test('product quota check and insert are serialized in one transaction',async()=>{
 const site={id:'00000000-0000-4000-8000-000000000002',slug:'tenant-a',status:'active',plan:'starter'};
 const pool=fakePool((sql,args)=>{
   if(sql.includes('FROM jame3_private.sites WHERE slug='))return {rows:[site],rowCount:1};
   if(sql.includes('FROM jame3_private.site_feature_overrides'))return {rows:[],rowCount:0};
   if(sql.includes('count(*) AS n FROM jame3_private.products'))return {rows:[{n:'20'}],rowCount:1};
   return {rows:[],rowCount:1};
 });
 const store=await createPostgresStore({pool});
 await assert.rejects(store.addProduct(site,'Blocked',129900,3,'00000000-0000-4000-8000-000000000001'),/Product plan limit/);
 assert.ok(pool.logs.some(x=>x.sql.includes('FOR UPDATE')));
 assert.ok(pool.logs.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!pool.logs.some(x=>x.sql.startsWith('INSERT INTO jame3_private.products')));
});

test('async data-store contract works through owner and tenant HTTP routes',async()=>{
 const base=createStore(':memory:');
 const owner=base.bootstrapOwner('async-owner@example.test','a-really-long-strong-password-2026');
 const site=base.createSite({slug:'async-shop',name:'Async Shop',tagline:'Demo',accent:'#336655',plan:'growth'},owner);
 const wrapped=new Proxy(base,{get(target,key){const member=target[key];return typeof member==='function' ? (...args)=>Promise.resolve(member.apply(target,args)):member;}});
 let server;
 try{
   server=http.createServer(createApp({store:wrapped,publicOrigin:'http://127.0.0.1:49997'}));
   await new Promise(done=>server.listen(49997,'127.0.0.1',done));
   const guest=await fetch('http://127.0.0.1:49997/dashboard/async-shop',{redirect:'manual'});
   assert.equal(guest.status,303);
   const login=await fetch('http://127.0.0.1:49997/session/login',{method:'POST',redirect:'manual',headers:{Origin:'http://127.0.0.1:49997','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'async-owner@example.test',password:'a-really-long-strong-password-2026'})});
   assert.equal(login.status,303);
   const cookie=login.headers.get('set-cookie')?.split(';')[0];
   const dashboard=await fetch('http://127.0.0.1:49997/dashboard/async-shop',{headers:{Cookie:cookie}});
   assert.equal(dashboard.status,200);
   assert.match(await dashboard.text(),/Async Shop/);
   const publicPage=await fetch('http://127.0.0.1:49997/s/async-shop');
   assert.equal(publicPage.status,200);
   assert.match(await publicPage.text(),/Async Shop/);
 } finally {if(server?.listening)await new Promise(done=>server.close(done));base.close();}
});
