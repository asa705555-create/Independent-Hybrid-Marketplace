import { randomBytes, createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

/** Authentication and output-safety primitives. No secrets ever belong in client JS. */
export const token = () => randomBytes(32).toString('base64url');
export const sha256 = v => createHash('sha256').update(String(v)).digest('hex');
export const constantEqual = (a, b) => {
  const aa = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('weak password');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function verifyPassword(password, salt, expected) {
  if (typeof password !== 'string' || password.length > 200 || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  return constantEqual(scryptSync(password, salt, 64).toString('hex'), expected);
}
export const escapeHtml = input => String(input ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export const validSlug = input => typeof input === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(input) && !input.includes('--') && !input.endsWith('-');
export const validColor = input => typeof input === 'string' && /^#[0-9a-fA-F]{6}$/.test(input);
export const validEmail = input => typeof input === 'string' && input.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
export const csrfToken = session => createHmac('sha256', session.csrf_secret).update(`jame3:${session.token_hash}`).digest('hex');
export function verifyCsrf(session, candidate) { return typeof candidate === 'string' && constantEqual(csrfToken(session), candidate); }
export const plans = Object.freeze({
  starter: Object.freeze({label:'الانطلاق', price:299, maxSites:1, maxProducts:20, maxStaff:1, features:['catalog','basic_theme']}),
  growth: Object.freeze({label:'النمو', price:799, maxSites:3, maxProducts:200, maxStaff:5, features:['catalog','basic_theme','analytics','coupons']}),
  scale: Object.freeze({label:'التوسع', price:1999, maxSites:10, maxProducts:2000, maxStaff:30, features:['catalog','basic_theme','analytics','coupons','custom_domain','advanced_reports']})
});
/** Prices are illustrative plan proposals only. Billing is not enabled. */
export function entitlement(site, feature) {
  return site?.status === 'active' && Boolean(plans[site.plan]?.features.includes(feature));
}
export function can(role, action) {
  const acl = {
    owner: ['*'],
    manager: ['view_site','manage_site','view_products','manage_products','view_reports'],
    catalog: ['view_site','view_products','manage_products'],
    viewer: ['view_site','view_products']
  };
  const actions = acl[role] || [];
  return actions.includes('*') || actions.includes(action);
}
export function validateSite(input) {
  if (!validSlug(input.slug)) throw new Error('اسم الرابط لازم يكون حروف إنجليزية صغيرة وأرقام وشرطات، من 2 إلى 40 حرفًا.');
  if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 80) throw new Error('اسم الموقع من 2 إلى 80 حرفًا.');
  if (typeof input.tagline !== 'string' || input.tagline.length > 140) throw new Error('الوصف المختصر لا يتجاوز 140 حرفًا.');
  if (!validColor(input.accent)) throw new Error('اللون يجب أن يكون بصيغة HEX صحيحة.');
  if (!Object.hasOwn(plans,input.plan)) throw new Error('باقة غير معروفة.');
  return {slug:input.slug, name:input.name.trim(), tagline:input.tagline.trim(), accent:input.accent.toLowerCase(), plan:input.plan};
}
export function parseCookie(header = '') {
  const entries = String(header).split(';').map(x => x.trim().split('='));
  return Object.fromEntries(entries.filter(([k,v]) => k && v && k.length < 70 && v.length < 300));
}
/** Reject parameter pollution instead of choosing the first/last attacker-controlled duplicate. */
export function parseForm(text) {
  const entries = new URLSearchParams(text), out = Object.create(null);
  for (const [key,value] of entries) {
    if (!/^[a-z_]{1,40}$/.test(key) || ['__proto__','prototype','constructor'].includes(key) || Object.hasOwn(out,key)) throw new Error('Invalid form fields');
    out[key] = value;
  }
  return out;
}
