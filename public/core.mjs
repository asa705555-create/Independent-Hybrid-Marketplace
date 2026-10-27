/** Pure cart logic, amounts in integer Egyptian piastres; no trust in browser values at checkout. */
export const byId = (products) => new Map(products.map(p => [p.id, p]));
export function normalizeCart(lines, products) {
  const map = byId(products), quantities = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    if (!line || typeof line.id !== 'string' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) continue;
    const p = map.get(line.id);
    if (!p || !Number.isSafeInteger(p.stock) || p.stock < 1) continue;
    quantities.set(p.id, Math.min(p.stock, 10, (quantities.get(p.id) || 0) + line.quantity));
  }
  return [...quantities].filter(([,quantity])=>quantity>0).map(([id,quantity])=>({id,quantity}));
}
export function changeQuantity(lines, productId, delta, products) {
  if (!Number.isInteger(delta) || Math.abs(delta)!==1) throw new Error('Invalid delta');
  const product = byId(products).get(productId);
  if (!product) throw new Error('Unknown product');
  const cart = normalizeCart(lines,products);
  const current = cart.find(l=>l.id===productId)?.quantity || 0;
  const quantity = Math.max(0,Math.min(product.stock,10,current+delta));
  return cart.filter(l=>l.id!==productId).concat(quantity ? [{id:productId,quantity}] : []);
}
export function getCartSummary(lines,products) {
  const items = normalizeCart(lines,products).map(line => {
    const product = byId(products).get(line.id);
    if (!Number.isSafeInteger(product.price) || product.price < 0 || !Number.isSafeInteger(line.quantity * product.price)) throw new Error('Invalid product price');
    return {...line, product, lineTotal:line.quantity*product.price};
  });
  const sellers = new Map();
  for (const item of items) {
    const id = item.product.sellerId;
    const existing = sellers.get(id) || {sellerId:id, subtotal:0, items:[]};
    existing.items.push(item);
    existing.subtotal += item.lineTotal;
    sellers.set(id,existing);
  }
  const subtotal = items.reduce((s,i)=>s+i.lineTotal,0);
  if (!Number.isSafeInteger(subtotal)) throw new Error('Cart total overflow');
  return {items, sellers:[...sellers.values()], itemCount:items.reduce((s,i)=>s+i.quantity,0), subtotal};
}
export function money(piasters) {
  if (!Number.isInteger(piasters)) throw new Error('Amount must be integer piastres');
  return `${new Intl.NumberFormat('ar-EG',{minimumFractionDigits:0,maximumFractionDigits:2}).format(piasters/100)} ج.م`;
}
