import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCart,changeQuantity,getCartSummary,money} from '../public/core.mjs';
import {products} from '../public/catalog.mjs';
test('one cart splits into orders per legal seller and preserves total',()=>{
 const x=getCartSummary([{id:'a01',quantity:1},{id:'s01',quantity:2},{id:'a02',quantity:1}],products);
 assert.equal(x.sellers.length,2);assert.equal(x.itemCount,4);
 assert.equal(x.subtotal,129900+2*189900+59900);
 assert.equal(x.sellers.reduce((s,g)=>s+g.subtotal,0),x.subtotal);
});
test('quantity never exceeds stock or local demo maximum',()=>{
 const x=normalizeCart([{id:'s02',quantity:999}],products);assert.deepEqual(x,[{id:'s02',quantity:6}]);
});
test('unknown and invalid cart items discarded',()=>{
 assert.deepEqual(normalizeCart([{id:'missing',quantity:1},{id:'a01',quantity:-4},{id:'a02',quantity:1.5}],products),[]);
});
test('add and remove item',()=>{
 const add=changeQuantity([], 'a01',1,products);
 assert.deepEqual(add,[{id:'a01',quantity:1}]);
 assert.deepEqual(changeQuantity(add,'a01',-1,products),[]);
});
test('money requires integer minor currency units',()=>{
 assert.match(money(9900),/٩٩/);assert.throws(()=>money(1.1));
});
test('all brands in demo belong to unrelated external sellers',()=>{
 assert.equal(new Set(products.map(p=>p.sellerId)).size,5);
 assert.ok(products.every(p=>!/(tone|protos)/i.test(p.sellerId+' '+p.brandId)));
});
