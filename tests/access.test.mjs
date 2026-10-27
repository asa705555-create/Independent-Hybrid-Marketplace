import test from 'node:test';
import assert from 'node:assert/strict';
import {parseForm,validSlug,plans,can,entitlement,validateSite,escapeHtml,hashPassword,verifyPassword,token} from '../src/security.mjs';
import {createStore} from '../src/store.mjs';
test('roles grant least privilege',()=>{
 for(const role of ['manager','catalog','viewer',null,'admin','anonymous'])assert.equal(can(role,'change_plan'),false);
 assert.equal(can('viewer','manage_site'),false);
 assert.equal(can('catalog','manage_products'),true);
 assert.equal(can('catalog','manage_site'),false);
 assert.equal(can('manager','manage_site'),true);
 assert.equal(can('owner','manage_site'),true);
});
test('subscription limits are monotonic and explicit',()=>{
 assert.ok(plans.starter.maxProducts<plans.growth.maxProducts&&plans.growth.maxProducts<plans.scale.maxProducts);
 assert.equal(entitlement({plan:'starter',status:'active'},'analytics'),false);
 assert.equal(entitlement({plan:'scale',status:'suspended'},'analytics'),false);
 assert.equal(entitlement({plan:'scale',status:'active'},'analytics'),true);
});
test('password hashes are salted and verify only matching password',()=>{
 const a=hashPassword('Test-Password-Secure-2026'),b=hashPassword('Test-Password-Secure-2026');assert.notEqual(a.salt,b.salt);
 assert.notEqual(a.hash,b.hash);assert.equal(verifyPassword('Test-Password-Secure-2026',a.salt,a.hash),true);
 assert.equal(verifyPassword('bad',a.salt,a.hash),false);
});
test('rejects prototype pollution and duplicate form keys',()=>{
 assert.throws(()=>parseForm('plan=starter&plan=scale'));
 assert.throws(()=>parseForm('__proto__=owner'));
 assert.throws(()=>parseForm('constructor=owner'));
 assert.equal(parseForm('slug=abc').slug,'abc');
});
test('store keeps tenant products separate',()=>{
 const db=createStore();const owner=db.bootstrapOwner('owner@example.com','Example-Strong-Password-2026!');
 const a=db.createSite({slug:'tenant-a',name:'ألف',tagline:'',accent:'#111111',plan:'growth'},owner);
 const b=db.createSite({slug:'tenant-b',name:'باء',tagline:'',accent:'#222222',plan:'growth'},owner);
 db.addProduct(a,'A private',900,2,owner);db.addProduct(b,'B private',100,2,owner);
 assert.equal(db.listProducts(a.id).length,1);assert.equal(db.listProducts(b.id).length,1);
 assert.equal(db.listProducts(a.id)[0].name,'A private');assert.equal(db.listProducts(b.id)[0].name,'B private');db.close();
});
test('untrusted strings are HTML-escaped',()=>assert.equal(escapeHtml(`<img src="x" onerror='x'>`),'&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;'));
test('site input strips whitespace but denies HTML/JS in slug/color',()=>{
 const d=validateSite({slug:'safe-website',name:' موقع ',tagline:'demo',accent:'#ABCDEF',plan:'starter'});
 assert.equal(d.name,'موقع');assert.equal(d.accent,'#abcdef');
 assert.throws(()=>validateSite({...d,slug:'<script>alert(1)</script>'}));
 assert.throws(()=>validateSite({...d,accent:'#abc;url(js)'}));
});
test('auth tokens are high entropy unique',()=>{const values=Array.from({length:50},token);assert.equal(new Set(values).size,50);assert.ok(values.every(v=>v.length>=40));});
test('owner feature switch is persisted per site, not globally',()=>{
 const db=createStore();const owner=db.bootstrapOwner('owner@example.com','Example-Strong-Password-2026!');
 const a=db.createSite({slug:'site-a',name:'ألف',tagline:'',accent:'#123456',plan:'growth'},owner);
 const b=db.createSite({slug:'site-b',name:'باء',tagline:'',accent:'#654321',plan:'growth'},owner);
 assert.equal(db.hasFeature(a,'analytics'),true);
 db.setFeature('site-a','analytics',false,owner);
 assert.equal(db.hasFeature(a,'analytics'),false);assert.equal(db.hasFeature(b,'analytics'),true);
 assert.throws(()=>db.setFeature('site-a','custom_domain',true,owner));db.close();
});
