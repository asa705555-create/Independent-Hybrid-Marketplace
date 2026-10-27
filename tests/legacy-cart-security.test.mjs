import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCart, getCartSummary } from '../public/core.mjs';
const products=[{id:'a',sellerId:'seller-a',stock:20,price:15000},{id:'b',sellerId:'seller-b',stock:3,price:12000}];
test('negative duplicate cart lines cannot erase valid quantities',()=>{
  assert.deepEqual(normalizeCart([{id:'a',quantity:2},{id:'a',quantity:-10}],products),[{id:'a',quantity:2}]);
});
test('large unsafe quantities cannot enter cart',()=>{
  assert.deepEqual(normalizeCart([{id:'a',quantity:Number.MAX_SAFE_INTEGER+1}],products),[]);
});
test('duplicate entries clamp at stock and demo cap',()=>{
  assert.deepEqual(normalizeCart([{id:'b',quantity:2},{id:'b',quantity:2}],products),[{id:'b',quantity:3}]);
});
test('reject invalid price before rendering totals',()=>{
  assert.throws(()=>getCartSummary([{id:'a',quantity:1}],[{...products[0],price:-1}]),/Invalid product price/);
});
test('reject arithmetic overflow for malicious catalog data',()=>{
  assert.throws(()=>getCartSummary([{id:'a',quantity:10}],[{...products[0],price:Number.MAX_SAFE_INTEGER}]),/Invalid product price/);
});
test('seller groups preserve totals',()=>{
  const r=getCartSummary([{id:'a',quantity:2},{id:'b',quantity:1}],products);
  assert.equal(r.subtotal,42000);
  assert.equal(r.sellers.length,2);
  assert.equal(r.sellers.reduce((sum,s)=>sum+s.subtotal,0),r.subtotal);
});
