import {brands, products} from './catalog.mjs';
import {normalizeCart, changeQuantity, getCartSummary, money} from './core.mjs';
const el = id => document.getElementById(id);
const brandById = new Map(brands.map(b=>[b.id,b]));
const state = { category:'الكل', brandId:null, query:'', sort:'featured', cart:[] };
try { state.cart = normalizeCart(JSON.parse(localStorage.getItem('jame3-demo-cart')||'[]'),products); } catch { state.cart=[]; }
const safe = text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const shapes={
 hoodie:'<path d="M115 82 Q150 55 185 82 L210 78 Q235 90 243 135 L267 206 L230 220 L212 175 L212 280 L88 280 L88 175 L70 220 L33 206 L57 135 Q65 90 90 78Z"/><path d="M112 82 Q126 118 150 120 Q174 118 188 82 Q177 41 150 45 Q123 41 112 82Z" fill="none" stroke="#ffffff88" stroke-width="8"/><path d="M109 205 L192 205 L198 253 L103 253Z" fill="#00000012"/><path d="M88 268 L212 268 M40 202 L70 212 M230 212 L260 202" fill="none" stroke="#00000024" stroke-width="9"/>',
 tee:'<path d="M97 78 L126 65 Q150 91 174 65 L203 78 L254 108 L222 155 L205 145 L205 274 L95 274 L95 145 L78 155 L46 108Z"/><path d="M126 65 Q150 91 174 65" fill="none" stroke="#00000030" stroke-width="7"/><path d="M96 269 L205 269" stroke="#ffffff77" stroke-width="4" fill="none"/>',
 pants:'<path d="M90 53 L210 53 L212 119 L191 287 L157 287 L150 151 L143 287 L105 287 L87 117Z"/><path d="M92 73 L211 73 M150 76 L150 150 M107 280 L142 280 M160 280 L190 280" stroke="#ffffff55" stroke-width="5" fill="none"/>',
 shoe:'<path d="M45 185 Q84 176 102 121 L146 137 Q162 165 188 178 Q207 187 260 200 L271 233 Q255 246 211 247 L49 242 Q24 229 45 185Z"/><path d="M47 218 Q145 229 266 222 L265 235 Q156 251 51 239Z" fill="#f7f7f1"/><path d="M111 146 L161 177 M120 134 L176 169 M129 126 L185 162" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M46 194 Q83 207 109 203" stroke="#ffffff77" stroke-width="4" fill="none"/>',
 jacket:'<path d="M110 58 L150 84 L190 58 L220 88 L250 211 L217 226 L202 168 L202 280 L98 280 L98 168 L83 226 L50 211 L80 88Z"/><path d="M110 58 L150 84 L190 58 L167 155 L133 155Z" fill="#ffffff30"/><path d="M150 85 L150 280" fill="none" stroke="#ffffff99" stroke-width="6"/><path d="M166 209 L191 209 M108 209 L133 209" stroke="#00000033" stroke-width="5"/>',
 bag:'<rect x="64" y="120" width="172" height="135" rx="21"/><path d="M104 128 L104 101 Q104 55 150 55 Q196 55 196 101 L196 128" stroke="#624c3d" stroke-width="16" fill="none"/><path d="M70 158 Q150 190 230 158" stroke="#ffffff47" stroke-width="5" fill="none"/><rect x="143" y="158" width="15" height="22" rx="5" fill="#e5cba3"/>',
 bottle:'<rect x="117" y="58" width="65" height="46" rx="4" fill="#343d39"/><rect x="127" y="39" width="45" height="22" rx="3" fill="#d9c3a0"/><rect x="89" y="98" width="123" height="163" rx="25"/><rect x="104" y="143" width="93" height="73" rx="3" fill="#f5e8dd"/><text x="150" y="174" font-size="15" fill="#77675c" text-anchor="middle" font-family="Arial">EAU DE</text><text x="150" y="193" font-size="16" fill="#77675c" text-anchor="middle" font-family="Arial">PARFUM</text>',
 care:'<rect x="89" y="88" width="76" height="171" rx="15"/><rect x="101" y="68" width="51" height="22" rx="5" fill="#d3b9a7"/><rect x="173" y="117" width="60" height="145" rx="12" opacity=".7"/><rect x="182" y="91" width="42" height="27" rx="4" fill="#d3b9a7"/><rect x="96" y="174" width="62" height="47" rx="2" fill="#ffffff88"/><rect x="179" y="181" width="48" height="39" rx="2" fill="#ffffff88"/>'
};
function art(shape,tone){return `<svg viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم توضيحي للمنتج"><g fill="${tone}" stroke="#00000016" stroke-width="2">${shapes[shape]||shapes.tee}</g></svg>`;}
function setArt(){document.querySelectorAll('.art[data-shape]').forEach(node=>{node.innerHTML=art(node.dataset.shape,node.dataset.tone||'#aab')});}
function renderBrands(){el('brandsGrid').innerHTML=brands.map(b=>`<button class="brand-tile" style="--color:${b.color}" data-brand="${safe(b.id)}"><span class="brand-en">${safe(b.en)}</span><small>${safe(b.type)}</small></button>`).join('');}
const categories=['الكل','ملابس','أحذية','شنط','جمال'];
function renderCategories(){el('categories').innerHTML=categories.map(c=>`<button class="chip ${c===state.category?'active':''}" data-category="${safe(c)}">${safe(c)}</button>`).join('');}
function visibleProducts(){let found=products.filter(p=>{
 const brand=brandById.get(p.brandId);
 return (state.category==='الكل'||p.category===state.category) && (!state.brandId||p.brandId===state.brandId) && (`${p.name} ${brand.name} ${brand.en} ${p.category}`.toLowerCase().includes(state.query.toLowerCase()));
});if(state.sort!=='featured')found=[...found].sort((a,b)=>state.sort==='low'?a.price-b.price:b.price-a.price);return found;}
function renderProducts(){const brandLanding=el('brandLanding');const activeBrand=brandById.get(state.brandId);brandLanding.hidden=!activeBrand;if(activeBrand){brandLanding.style.setProperty('--brand-bg',activeBrand.color);brandLanding.innerHTML=`<div><small>BRAND / ${safe(activeBrand.type)}</small><h2>${safe(activeBrand.en)}</h2><p>${safe(activeBrand.description)}</p></div><button data-reset-brand>تصفح كل المنتجات ←</button>`;}const selected=visibleProducts();el('resultsCount').textContent=`${selected.length} منتجات`;el('noResults').hidden=selected.length!==0;
 el('productsGrid').innerHTML=selected.map(p=>{const b=brandById.get(p.brandId);return `<article class="product-card"><div class="product-art" style="background:${b.color}66"><div class="art">${art(p.shape,p.tone)}</div>${p.tag?`<span class="tag">${safe(p.tag)}</span>`:''}<button data-add="${safe(p.id)}">+ أضف للسلة</button></div><div class="product-info"><span class="product-brand">${safe(b.en)}</span><h3>${safe(p.name)}</h3><span class="product-price">${money(p.price)}</span></div></article>`;}).join('');
 const active=el('activeFilter');active.hidden=!state.brandId;
 if(state.brandId)active.innerHTML=`بتشوف منتجات براند <b>${safe(brandById.get(state.brandId)?.name||'')}</b> <button id="clearBrand">عرض كل البراندات ×</button>`;
}
function persistCart(){try{localStorage.setItem('jame3-demo-cart',JSON.stringify(state.cart));}catch{ /* private or sandboxed browser: cart still works for current visit */ }}
function addToCart(id){state.cart=changeQuantity(state.cart,id,1,products);persistCart();renderCart();toast('اتضاف المنتج للسلة');}
function renderCart(){const summary=getCartSummary(state.cart,products);el('cartCount').textContent=summary.itemCount;el('drawerCount').textContent=`(${summary.itemCount})`;
 el('cartTotal').textContent=money(summary.subtotal);el('sellerCount').textContent=summary.sellers.length?`طلب واحد للعميل، داخله ${summary.sellers.length} طلب فرعي للبائعين. الشحن غير محسوب.`:'ستظهر الطلبات الفرعية لكل بائع هنا.';
 el('checkout').disabled=summary.itemCount===0;el('checkout').style.opacity=summary.itemCount?1:.4;
 if(!summary.items.length){el('cartItems').innerHTML='<div class="empty-cart"><span>◯</span><h3>لسه السلة فاضية</h3><p>ابدأ باختيار منتجات من البراندات المختلفة.</p></div>';return;}
 el('cartItems').innerHTML=summary.items.map(i=>{const p=i.product,b=brandById.get(p.brandId);return `<div class="cart-line"><div class="art">${art(p.shape,p.tone)}</div><div><small>${safe(b.en)}</small><b>${safe(p.name)}</b><div class="line-bottom"><strong>${money(i.lineTotal)}</strong><div class="stepper"><button data-change="${safe(i.id)}" data-delta="1" aria-label="زيادة الكمية">+</button><span>${i.quantity}</span><button data-change="${safe(i.id)}" data-delta="-1" aria-label="تقليل الكمية">−</button></div></div></div></div>`;}).join('');}
function openCart(){el('cartDrawer').classList.add('open');el('cartDrawer').setAttribute('aria-hidden','false');el('scrim').hidden=false;document.body.style.overflow='hidden';el('closeCart').focus();}
function closeCart(){el('cartDrawer').classList.remove('open');el('cartDrawer').setAttribute('aria-hidden','true');el('scrim').hidden=true;document.body.style.overflow='';}
function openModal(inner){el('modalContent').innerHTML=inner;el('modal').hidden=false;document.body.style.overflow='hidden';el('closeModal').focus();}
function closeModal(){el('modal').hidden=true;document.body.style.overflow='';}
function showBreakdown(){const summary=getCartSummary(state.cart,products);closeCart();openModal(`<span class="kicker">UNIFIED CHECKOUT / DEMO</span><h2>تقسيم الطلب على البائعين</h2><p>دي محاكاة لتقسيم السلة حسب البائع القانوني. كل مجموعة هتبقى طلبًا فرعيًا مستقلًا، لكن العميل يتابعهم تحت رقم طلب واحد.</p>${summary.sellers.map(s=>`<div class="seller-breakdown"><span>${safe(brandById.get(s.items[0].product.brandId)?.name||'بائع')} — ${s.items.length} أصناف</span><strong>${money(s.subtotal)}</strong></div>`).join('')}<div class="seller-breakdown"><strong>إجمالي المنتجات</strong><strong>${money(summary.subtotal)}</strong></div><div class="warning"><b>الطلبات الحقيقية غير مفعلة.</b><br>لا يمكن الدفع أو حجز المخزون أو تأكيد شحن من النسخة الحالية. الربط الحقيقي يتطلب قاعدة بيانات منفصلة وآمنة ومزود دفع وشحن.</div>`);}
function showAdmin(){openModal(`<span class="kicker">ADMIN / DEMONSTRATION</span><h2>لوحة إدارة المول — معاينة</h2><p>هيكل الإدارة المستهدف للمنصة. الأرقام التالية توضيحية وليست سجلات فعلية.</p><div class="seller-breakdown"><span>البراندات النشطة في الكتالوج التجريبي</span><strong>5</strong></div><div class="seller-breakdown"><span>منتجات العرض</span><strong>${products.length}</strong></div><div class="seller-breakdown"><span>طلبات فعلية</span><strong>0</strong></div><div class="seller-breakdown"><span>مبالغ محصلة</span><strong>0 ج.م</strong></div><div class="warning">لن يتم توفير لوحة إدارية للتحكم في بيانات فعلية دون تسجيل دخول وصلاحيات على السيرفر وعزل بيانات كل بائع.</div>`);}
let toastTimer;function toast(msg){const t=el('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2000);}
window.addEventListener('click',event=>{
 const target=event.target.closest('button');if(!target)return;
 if(target.dataset.brand){location.hash='brand/'+target.dataset.brand;applyBrandHash();el('brandLanding').scrollIntoView({behavior:'smooth'});}
 if(target.id==='clearBrand'||target.hasAttribute('data-reset-brand')){location.hash='products';state.brandId=null;renderProducts();}
 if(target.dataset.category){state.category=target.dataset.category;renderCategories();renderProducts();}
 if(target.dataset.add) addToCart(target.dataset.add);
 if(target.dataset.change){state.cart=changeQuantity(state.cart,target.dataset.change,Number(target.dataset.delta),products);persistCart();renderCart();}
 if(target.classList.contains('cart-open')) openCart();
 if(target.id==='closeCart') closeCart();
 if(target.id==='checkout') showBreakdown();
 if(target.id==='demoAdmin') showAdmin();
 if(target.id==='closeModal')closeModal();
});
el('search').addEventListener('input',e=>{state.query=e.target.value.trim();renderProducts();});
el('sort').addEventListener('change',e=>{state.sort=e.target.value;renderProducts();});
el('scrim').addEventListener('click',closeCart);
el('modal').addEventListener('click',e=>{if(e.target===el('modal'))closeModal();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!el('modal').hidden)closeModal();else closeCart();}});
function applyBrandHash(){const match=location.hash.match(/^#brand\/([a-z-]+)$/);state.brandId=match&&brandById.has(match[1])?match[1]:null;state.category='الكل';state.query='';el('search').value='';renderCategories();renderProducts();}
window.addEventListener('hashchange',applyBrandHash);
renderBrands();applyBrandHash();renderCart();setArt();
