import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createStore} from '../src/store.mjs';
import {createApp,makeLimiter} from '../src/server.mjs';
import {decodeTotpSecret,verifyTotp,csrfToken} from '../src/security.mjs';

const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // Public RFC6238 fixture, never use for real accounts
const pass='A-secure-only-for-unit-tests-2026';
const codeAt=now=>{
  const count=Buffer.alloc(8);count.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
  const digest=createHmac('sha1',decodeTotpSecret(secret)).update(count).digest();
  const pos=digest.at(-1)&15;
  return String(((((digest[pos]&127)<<24)|(digest[pos+1]<<16)|(digest[pos+2]<<8)|digest[pos+3])%1000000)).padStart(6,'0');
};
test('RFC6238 vector, strict OTP format and window handling',()=>{
  const key=decodeTotpSecret(secret);
  assert.equal(key.toString(),'12345678901234567890');
  assert.equal(codeAt(59000),'287082');
  assert.equal(verifyTotp(key,'287082',59000),1);
  assert.equal(verifyTotp(key,'287082',89000),1);
  assert.equal(verifyTotp(key,'287082',90001),null);
  for(const v of ['',null,' 287082','287082 ',287082,'0287082','abcdef'])assert.equal(verifyTotp(key,v,59000),null);
});
test('Malformed Base32 fails closed',()=>{
  for(const v of ['',123,'ABC','AAAAAAAAAAAAAAAA','BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBZ','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA===J'])assert.throws(()=>decodeTotpSecret(v));
});
test('Owner TOTP replay steps cannot be used again',()=>{
  const store=createStore();
  try{
    const uid=store.bootstrapOwner('owner@example.com',pass);
    assert.equal(store.consumeOwnerOtp(uid,1),true);
    assert.equal(store.consumeOwnerOtp(uid,1),false);
    assert.equal(store.consumeOwnerOtp(uid,0),false);
    assert.equal(store.consumeOwnerOtp(uid,2),true);
  }finally{store.close()}
});
test('Account/address throttling has independently applied limits',()=>{
  const limiter=makeLimiter(()=>1000);
  for(let i=0;i<6;i++){limiter.failure('ip:198.51.100.7');limiter.failure('email:target@example.com')}
  assert.equal(limiter.check('ip:198.51.100.7'),false);
  assert.equal(limiter.check('email:target@example.com'),false);
  limiter.success('email:target@example.com');
  assert.equal(limiter.check('email:target@example.com'),true);
  assert.equal(limiter.check('ip:198.51.100.7'),false);
});
test('MFA owner login enforces code and blocks replay; staff can still sign in',async()=>{
  const db=createStore(), uid=db.bootstrapOwner('owner@example.com',pass);
  const site=db.createSite({name:'Example',slug:'example',tagline:'-',accent:'#223344',plan:'growth'},uid);
  const invite=db.makeInvite(site,'staff@example.com','viewer',uid);
  db.acceptInvite(invite,'A-test-only-staff-password-2026!');
  let clock=59000,origin='',handler;
  const server=http.createServer((req,res)=>handler(req,res));
  try{
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    origin='http://127.0.0.1:'+server.address().port;
    handler=createApp({store:db,publicOrigin:origin,ownerTotpSecret:secret,now:()=>clock,loginLimiter:makeLimiter(()=>clock)});
    const page=await fetch(origin+'/login');assert.match(await page.text(),/رمز المصادقة/);
    const login=(email,password,otp)=>fetch(origin+'/session/login',{method:'POST',redirect:'manual',headers:{Origin:origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password,...(otp===undefined?{}:{otp})})});
    assert.equal((await login('owner@example.com',pass)).status,401);
    assert.equal((await login('owner@example.com',pass,'000000')).status,401);
    const ok=await login('owner@example.com',pass,'287082');assert.equal(ok.status,303);
    const cookie=ok.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(origin+'/owner',{headers:{Cookie:cookie},redirect:'manual'})).status,200);
    assert.equal((await login('owner@example.com',pass,'287082')).status,401);
    assert.equal((await login('staff@example.com','A-test-only-staff-password-2026!')).status,303);
    clock=91000;
    assert.equal((await login('owner@example.com',pass,codeAt(clock))).status,303);
  }finally{await new Promise(ok=>server.close(ok));db.close()}
});
test('Owner can revoke every session with a protected operation',async()=>{
  const db=createStore(),uid=db.bootstrapOwner('owner@example.com',pass);
  const s1=db.createSession(uid),s2=db.createSession(uid);
  let origin,handler;const server=http.createServer((req,res)=>handler(req,res));
  try{
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    origin='http://127.0.0.1:'+server.address().port;
    handler=createApp({store:db,publicOrigin:origin});
    const result=await fetch(origin+'/owner/sessions/revoke-all',{method:'POST',redirect:'manual',headers:{Origin:origin,Cookie:'jame3_session='+s1,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:csrfToken(db.session(s1))})});
    assert.equal(result.status,303);
    assert.equal(db.session(s1),null);
    assert.equal(db.session(s2),null);
    assert.ok(db.listAudit().find(a=>a.event==='session.revoked_all'));
  }finally{await new Promise(ok=>server.close(ok));db.close()}
});
