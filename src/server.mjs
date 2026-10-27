import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { createPostgresStore } from './postgres-store.mjs';
import { plans, escapeHtml, validEmail, validColor, validSlug, validateSite, can, entitlement, parseCookie, parseForm, verifyCsrf, decodeTotpSecret, verifyTotp } from './security.mjs';
import { layout, hub, signin, workspaceIndex, siteDashboard, sitePublic, invitePage, pageError } from './templates.mjs';
import { ownerCommandCenter } from './owner-console.mjs';
import { sitesCsv } from './reports.mjs';

const projectRoot = path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const publicRoot = path.join(projectRoot,'public');
const sessionCookie = 'jame3_session';
const staticPaths = new Map([
  ['/assets/platform.css',['platform.css','text/css; charset=utf-8']],
  ['/assets/premium.css',['premium.css','text/css; charset=utf-8']],
  ['/assets/owner-console.css',['owner-console.css','text/css; charset=utf-8']],
  ['/assets/owner-console.mjs',['owner-console.mjs','text/javascript; charset=utf-8']],
  ...['index.html','styles.css','app.mjs','core.mjs','catalog.mjs'].map(name=>['/marketplace/'+name,[name,name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8']])
]);

/** Rate-limit verification attempts; protects demo sign-in but production needs distributed throttling. */
export function makeLimiter(now=()=>Date.now()) {
  const states=new Map();
  return {
    check(key) { const t=now(); const s=states.get(key); if(!s || t>s.until)return true; return s.n<6; },
    failure(key) { const t=now(); const s=states.get(key);if(!s||t>s.until)states.set(key,{n:1,until:t+15*60*1000});else s.n+=1;
      // Bound in-memory growth from unauthenticated requests.
      if(states.size>20000)states.clear();
    },
    success(key){states.delete(key)}
  };
}
function response(res,status,body,headers={}) {
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...headers});
  res.end(body);
}
function redirect(res,to,headers={}){response(res,303,'',{'Location':to,...headers});}
function requireOrigin(req,origin){return req.headers.origin===origin;}
function cleanPath(url){try{return new URL(url,'http://localhost').pathname;}catch{return '';}}
function numberField(x,max) {if(typeof x!=='string'||!/^\d{1,12}$/.test(x))return null;const n=Number(x);return Number.isSafeInteger(n)&&n<=max?n:null;}
function normalizeOrigin(raw){try{const url=new URL(raw);return url.origin;}catch{return null;}}

export function createApp({store, publicOrigin='http://localhost:3000', secureCookies=false, ownerTotpSecret=null, now=()=>Date.now(), loginLimiter=makeLimiter(now)}={}) {
  if(!store)throw Error('Explicit isolated store required');
  const allowedOrigin=normalizeOrigin(publicOrigin);
  if(!allowedOrigin)throw Error('PUBLIC_ORIGIN must be set correctly');
  const totpKey = ownerTotpSecret ? decodeTotpSecret(ownerTotpSecret) : null;
  const secureSuffix=secureCookies?'; Secure':'';
  const cookieValue=raw=>`${sessionCookie}=${raw}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${secureSuffix}`;
  const deleteCookie=`${sessionCookie}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureSuffix}`;
  function headers(res){
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'");
    if(secureCookies)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  }
  return async function handle(req,res) {
    headers(res);
    const pathname=cleanPath(req.url||'/');
    const method=req.method||'GET';
    const cookie=parseCookie(req.headers.cookie)[sessionCookie];
    const session=await store.session(cookie,now());
    const currentUser=session ? await store.getUser(session.user_id) : null;
    const isOwner=currentUser?.role==='owner';
    const error=(status,title,description)=>response(res,status,pageError(status,title,description,currentUser));
    const authorized=()=>{if(!session){redirect(res,'/login');return false;}return true;};
    const ownerOnly=()=>{if(!authorized())return false;if(!isOwner){error(403,'صلاحيات غير كافية','هذه العملية متاحة لمالك المنصة فقط.');return false;}return true;};
    const body=async()=>{
      const ct=(req.headers['content-type']||'').split(';')[0].trim();if(ct!=='application/x-www-form-urlencoded')throw Object.assign(new Error('Form encoding required'),{code:415});
      let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>10_000)throw Object.assign(new Error('Form too large'),{code:413});}return parseForm(text);
    };
    const csrf = form=>session && verifyCsrf(session,form.csrf);
    if(method==='POST' && !requireOrigin(req,allowedOrigin)){return error(403,'طلب غير مسموح','الطلب من مصدر غير موثوق.');}
    if(method==='GET' && staticPaths.has(pathname)) {
      const [name,type]=staticPaths.get(pathname);const file=path.join(publicRoot,name);
      return response(res,200,fs.readFileSync(file),{'Content-Type':type,'Cache-Control':type.includes('html')?'no-store':'public, max-age=3600'});
    }
    if(method==='GET' && (pathname==='/marketplace'||pathname==='/marketplace/'))return redirect(res,'/marketplace/index.html');
    if(method==='GET' && pathname==='/health')return response(res,200,'OK',{'Content-Type':'text/plain; charset=utf-8'});
    if(method==='GET' && pathname==='/ready') {
      try { await store.health?.(); return response(res,200,'READY',{'Content-Type':'text/plain; charset=utf-8'}); }
      catch { return response(res,503,'UNAVAILABLE',{'Content-Type':'text/plain; charset=utf-8'}); }
    }
    if(method==='GET' && pathname==='/')return response(res,200,hub(await store.listSites(),currentUser));
    if(method==='GET' && pathname==='/login')return session?redirect(res,isOwner?'/owner':'/workspaces'):response(res,200,signin({mfaEnabled:Boolean(totpKey)}));
    if(method==='GET' && pathname==='/owner') {
      if(!ownerOnly())return;
      return response(res,200,ownerCommandCenter(await store.listSites(),await store.listAudit(),session,{statistics:await store.ownerSnapshot(now()),security:{mfaEnabled:Boolean(totpKey)}}));
    }
    // Owner-only CSV export: available exclusively after server-side owner check.
    // The serializer neutralizes spreadsheet formulas to prevent CSV injection.
    if(method==='GET' && pathname==='/owner/reports/sites.csv') {
      if(!ownerOnly())return;
      const csv=sitesCsv(await store.listSites(),await store.ownerSnapshot(now()));
      return response(res,200,csv,{'Content-Type':'text/csv; charset=utf-8',
        'Content-Disposition':'attachment; filename="jame3-sites-report.csv"'});
    }
    if(method==='GET' && pathname==='/workspaces') {
      if(!authorized())return;
      return response(res,200,workspaceIndex(isOwner?await store.listSites():await store.listMembershipSites(session.user_id),currentUser));
    }
    if(method==='GET' && /^\/s\/[a-z0-9-]{2,40}$/.test(pathname)) {
      const site=await store.getSite(pathname.slice(3));
      if(!site || site.status!=='active')return error(404,'الموقع غير متاح','الرابط غير موجود أو الموقع موقوف.');
      return response(res,200,sitePublic(site,await store.listProducts(site.id)));
    }
    if(method==='GET' && /^\/dashboard\/[a-z0-9-]{2,40}$/.test(pathname)) {
      if(!authorized())return;
      const site=await store.getSite(pathname.slice('/dashboard/'.length));
      if(!site)return error(404,'موقع غير موجود','تحقق من الرابط.');
      const role=isOwner?'owner':await store.membership(session.user_id,site.id);
      if(!can(role,'view_site'))return error(403,'صلاحيات غير كافية','ليس لديك إذن لدخول لوحة هذا الموقع.');
      return response(res,200,siteDashboard(site,await store.listProducts(site.id),session,role,await store.countStaff(site.id),{featureStates:Object.fromEntries(await Promise.all(plans[site.plan].features.map(async f=>[f,await store.hasFeature(site,f)])))}));
    }
    if(method==='GET' && pathname==='/invite') {
      const u=new URL(req.url,allowedOrigin);const raw=u.searchParams.get('token')||'';
      const inv=raw.length<200?await store.invitation(raw,now()):null;
      if(!inv)return error(400,'دعوة غير صالحة','انتهت صلاحية الدعوة أو تم استخدامها.');
      return response(res,200,invitePage({...inv,rawToken:raw},(await store.listSites()).find(s=>s.id===inv.site_id)));
    }
    if(method==='POST') {
      let form;
      try{form=await body();}catch(err){return error(err.code||400,'بيانات غير صحيحة','تنسيق الطلب غير صالح.');}
      if(pathname==='/session/login') {
        const email=typeof form.email==='string'?form.email.trim().toLowerCase():'';
        const password=form.password||'';
        // Throttle per-account AND per-address to resist distributed account guessing
        // and a single source spraying many account names. Use a shared limiter in production.
        const ip=req.socket.remoteAddress||'unknown';
        const keys=[`ip:${ip}`,`email:${email.slice(0,254)}`,`pair:${ip}:${email.slice(0,254)}`];
        if(keys.some(key=>!loginLimiter.check(key)))return error(429,'محاولات كثيرة','حاول لاحقًا.');
        let user=validEmail(email)?await store.verifyLogin(email,password):null;
        if(user?.role==='owner' && totpKey) {
          const step=verifyTotp(totpKey,form.otp,now());
          if(step===null || !await store.consumeOwnerOtp(user.id,step)) user=null;
        }
        if(!user){for(const key of keys)loginLimiter.failure(key);return response(res,401,signin({error:'بيانات الدخول غير صحيحة.',mfaEnabled:Boolean(totpKey)}));}
        // A successful login clears account/pair strikes; IP strikes expire by time.
        loginLimiter.success(keys[1]);loginLimiter.success(keys[2]);const raw=await store.createSession(user.id,now());
        return redirect(res,user.role==='owner'?'/owner':'/workspaces',{'Set-Cookie':cookieValue(raw)});
      }
      if(pathname==='/invite/accept') {
        const raw=form.token||'';
        if(!await store.invitation(raw,now()))return error(400,'دعوة غير صالحة','الرابط غير صحيح أو انتهت صلاحيته.');
        if(typeof form.password!=='string'||form.password.length<12||form.password.length>200)return error(400,'كلمة مرور غير مناسبة','استخدم كلمة مرور لا تقل عن 12 حرفًا.');
        try{
          const uid=await store.acceptInvite(raw,form.password,now());const sessionRaw=await store.createSession(uid,now());return redirect(res,'/workspaces',{'Set-Cookie':cookieValue(sessionRaw)});
        }catch{ return error(400,'تعذر تفعيل الدعوة','هذه الدعوة قد تكون استخدمت بالفعل أو الحساب موجود.'); }
      }
      if(!authorized())return;
      if(!csrf(form))return error(403,'حماية الطلب','رمز الحماية غير صحيح أو منتهي.');
      if(pathname==='/session/logout'){
        await store.revokeSession(cookie);return redirect(res,'/',{'Set-Cookie':deleteCookie});
      }
      if(pathname==='/owner/sessions/revoke-all'){
        if(!ownerOnly())return;
        await store.revokeAllSessions(session.user_id);
        return redirect(res,'/login',{'Set-Cookie':deleteCookie});
      }
      if(pathname==='/owner/sites'){
        if(!ownerOnly())return;
        try {
          const data=validateSite(form);
          if(await store.getSite(data.slug))return error(409,'الرابط مستخدم','اختر رابط موقع مختلف.');
          await store.createSite(data,session.user_id);return redirect(res,'/dashboard/'+data.slug);
        }catch(err){return error(400,'تعذر إنشاء الموقع',err.message);}
      }
      const ownerPlan=pathname.match(/^\/owner\/sites\/([a-z0-9-]{2,40})\/plan$/);
      if(ownerPlan){
        if(!ownerOnly())return;
        const slug=ownerPlan[1];
        if(!Object.hasOwn(plans,form.plan))return error(400,'باقة غير معروفة','اختر باقة متاحة.');
        if(!await store.updatePlan(slug,form.plan,session.user_id))return error(404,'غير موجود','الموقع غير موجود.');
        return redirect(res,'/dashboard/'+slug);
      }
      const ownerFeature=pathname.match(/^\/owner\/sites\/([a-z0-9-]{2,40})\/feature$/);
      if(ownerFeature){
        if(!ownerOnly())return;
        if(typeof form.feature!=='string'||!['true','false'].includes(form.enabled))return error(400,'بيانات غير صحيحة','تحقق من الميزة المطلوبة.');
        try{if(!await store.setFeature(ownerFeature[1],form.feature,form.enabled==='true',session.user_id))return error(404,'موقع غير موجود','الرابط غير صحيح.');return redirect(res,'/dashboard/'+ownerFeature[1]);}
        catch(err){return error(400,'تعذر تعديل الميزة',err.message);}
      }
      const ownerStatus=pathname.match(/^\/owner\/sites\/([a-z0-9-]{2,40})\/status$/);
      if(ownerStatus){
        if(!ownerOnly())return;
        try{if(!await store.setStatus(ownerStatus[1],form.status,session.user_id))return error(404,'موقع غير موجود','الرابط غير صحيح.');return redirect(res,'/dashboard/'+ownerStatus[1]);}
        catch(err){return error(400,'تعذر تغيير الحالة',err.message);}
      }
      const ownerInvite=pathname.match(/^\/owner\/sites\/([a-z0-9-]{2,40})\/invite$/);
      if(ownerInvite){
        if(!ownerOnly())return;
        const site=await store.getSite(ownerInvite[1]);if(!site)return error(404,'غير موجود','الموقع غير موجود.');
        if(!validEmail(form.email)||!['manager','catalog','viewer'].includes(form.role))return error(400,'بيانات الدعوة','راجع البريد والصلاحية.');
        try{
          const raw=await store.makeInvite(site,form.email,form.role,session.user_id,now());
          return response(res,200,siteDashboard(site,await store.listProducts(site.id),session,'owner',await store.countStaff(site.id),{message:'تم إنشاء دعوة خاصة صالحة لمدة 24 ساعة.',inviteLink:`${allowedOrigin}/invite?token=${raw}`,featureStates:Object.fromEntries(await Promise.all(plans[site.plan].features.map(async f=>[f,await store.hasFeature(site,f)])))}));
        }catch(err){return error(400,'تعذر الدعوة',err.message);}
      }
      const siteSettings=pathname.match(/^\/dashboard\/([a-z0-9-]{2,40})\/settings$/);
      if(siteSettings){
        const site=await store.getSite(siteSettings[1]);if(!site)return error(404,'غير موجود','الموقع غير موجود.');
        const role=isOwner?'owner':await store.membership(session.user_id,site.id);
        if(!can(role,'manage_site')||(!isOwner&&site.status!=='active'))return error(403,'غير مسموح','لا تمتلك صلاحية تعديل هوية هذا الموقع.');
        if(typeof form.name!=='string'||form.name.trim().length<2||form.name.trim().length>80||typeof form.tagline!=='string'||form.tagline.length>140||!validColor(form.accent))return error(400,'بيانات غير صحيحة','راجع الاسم والوصف واللون.');
        await store.updateSite(site.slug,{name:form.name.trim(),tagline:form.tagline.trim(),accent:form.accent.toLowerCase()},session.user_id);
        return redirect(res,'/dashboard/'+site.slug);
      }
      const addProduct=pathname.match(/^\/dashboard\/([a-z0-9-]{2,40})\/products$/);
      if(addProduct){
        const site=await store.getSite(addProduct[1]);if(!site)return error(404,'غير موجود','الموقع غير موجود.');
        const role=isOwner?'owner':await store.membership(session.user_id,site.id);
        if(!can(role,'manage_products')||!await store.hasFeature(site,'catalog'))return error(403,'غير مسموح','الصلاحية أو الباقة لا تسمح بإضافة منتجات.');
        const name=form.name?.trim(), price=numberField(form.price,100000000000),stock=numberField(form.stock,1000000);
        if(typeof name!=='string'||name.length<2||name.length>100||price===null||stock===null)return error(400,'بيانات غير صحيحة','راجع اسم المنتج والسعر والمخزون.');
        try{await store.addProduct(site,name,price,stock,session.user_id);return redirect(res,'/dashboard/'+site.slug);}catch(err){return error(400,'لا يمكن إضافة المنتج',err.message);}
      }
      return error(404,'المسار غير موجود','لم يتم العثور على العملية المطلوبة.');
    }
    if(method!=='GET')return error(405,'طريقة غير مسموحة','هذه العملية لا تدعم طريقة الطلب.');
    return error(404,'الصفحة غير موجودة','الرابط غير معروف.');
  };
}

/** Start only with explicitly supplied PRIVATE bootstrap credentials. Fail closed. */
export async function startFromEnvironment(env=process.env) {
  const demo=env.DEMO_EPHEMERAL==='1';
  const usingPg=Boolean(env.DATABASE_URL);
  if(!usingPg && !demo)throw Error('No persistent database configured. Set DATABASE_URL, or DEMO_EPHEMERAL=1 for non-production preview only.');
  const email=String(env.OWNER_EMAIL||'').toLowerCase().trim();
  const password=env.OWNER_PASSWORD||'';
  if(!validEmail(email)||password.length<20)throw Error('OWNER_EMAIL and OWNER_PASSWORD (>=20 chars) required in private environment.');
  const publicOrigin=env.PUBLIC_ORIGIN||'http://localhost:3000';
  if(env.NODE_ENV==='production'&&!publicOrigin.startsWith('https://'))throw Error('Production must use HTTPS public origin.');
  if(usingPg && env.NODE_ENV==='production' && !env.OWNER_TOTP_SECRET)throw Error('OWNER_TOTP_SECRET is mandatory with production PostgreSQL.');
  if(env.OWNER_TOTP_SECRET)decodeTotpSecret(env.OWNER_TOTP_SECRET);
  if(!usingPg && env.DB_FILE && env.DB_FILE!==':memory:')fs.mkdirSync(path.dirname(path.resolve(env.DB_FILE)),{recursive:true});
  const store=usingPg ? await createPostgresStore({connectionString:env.DATABASE_URL})
    : createStore(env.DB_FILE||':memory:',{seed:env.DEMO_SEED==='1'});
  await store.initialize?.(); // Fail startup if PostgreSQL is unreachable or schema is absent.
  const ownerId=await store.bootstrapOwner(email,password);
  if(usingPg)await store.seedForPreview(ownerId,env.DEMO_SEED==='1');
  else await store.seedForPreview(ownerId);
  const createAppHandler=createApp({store,publicOrigin,secureCookies:env.NODE_ENV==='production',ownerTotpSecret:env.OWNER_TOTP_SECRET||null});
  const server=http.createServer((req,res)=>{
    Promise.resolve(createAppHandler(req,res)).catch(err=>{
      console.error('Unhandled request error:',err?.message||'unknown');
      if(!res.headersSent)response(res,500,pageError(500,'حدث خطأ','حاول مرة أخرى لاحقًا.'));
      else res.end();
    });
  });
  const port=Number(env.PORT||3000);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
  console.log(`Jame3 independent platform listening on ${port}, persistence=${usingPg?'postgres':'ephemeral-preview'}`);
  return {server,store};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  startFromEnvironment().catch(error=>{console.error('Startup failed:',error?.message||'unknown');process.exitCode=1;});
}
