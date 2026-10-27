import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync } from 'node:crypto';
import { sha256, hashPassword, verifyPassword, token, plans } from './security.mjs';

/**
 * Preview adapter. Every tenant query is scoped by site_id. NEVER treat this
 * local SQLite database as the durable production solution on a free Render pod.
 * The schema under docs/ describes the PostgreSQL migration path.
 */
export function createStore(path = ':memory:', opts = {}) {
  const db = new DatabaseSync(path);
  const dummySalt='abcdef0123456789abcdef0123456789';
  const dummyHash=scryptSync('unused-demo-account',dummySalt,64).toString('hex');
  db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','member')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS owner_mfa_replay(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,last_step INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf_secret TEXT NOT NULL,expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,tagline TEXT NOT NULL DEFAULT '',accent TEXT NOT NULL,plan TEXT NOT NULL CHECK(plan IN ('starter','growth','scale')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS memberships(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('manager','catalog','viewer')),PRIMARY KEY(site_id,user_id));
  CREATE TABLE IF NOT EXISTS site_feature_overrides(site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,feature TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),PRIMARY KEY(site_id,feature));
  CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,name TEXT NOT NULL,price_piasters INTEGER NOT NULL CHECK(price_piasters>=0 AND price_piasters<=100000000000),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0 AND stock<=1000000),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(site_id);
  CREATE TABLE IF NOT EXISTS invitations(token_hash TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('manager','catalog','viewer')),expires_at INTEGER NOT NULL,used_at INTEGER,created_by TEXT NOT NULL REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,actor_id TEXT,site_id TEXT,event TEXT NOT NULL,meta TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_audit_site ON audit_events(site_id,created_at);
  `);
  const q = (sql, ...params) => db.prepare(sql).all(...params);
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const audit = (actor,site,event,meta={}) => run('INSERT INTO audit_events (id,actor_id,site_id,event,meta) VALUES (?,?,?,?,?)', randomUUID(),actor||null,site||null,event,JSON.stringify(meta));
  return {
    db, close:()=>db.close(),
    bootstrapOwner(email,password) {
      const pass = hashPassword(password);
      const existing=one('SELECT id FROM users WHERE email=?',email);
      if(existing) {
        // Owner role/password are always controlled by private server configuration.
        run("UPDATE users SET password_hash=?,salt=?,role='owner' WHERE id=?",pass.hash,pass.salt,existing.id);
        run('DELETE FROM sessions WHERE user_id=?',existing.id);
        return existing.id;
      }
      const id=randomUUID();run("INSERT INTO users (id,email,salt,password_hash,role) VALUES (?,?,?,?,'owner')",id,email,pass.salt,pass.hash);return id;
    },
    getUserByEmail: email => one('SELECT * FROM users WHERE email=?',email.toLowerCase()),
    getUser: id => one('SELECT id,email,role FROM users WHERE id=?',id),
    verifyLogin(email,password) {
      const user=one('SELECT * FROM users WHERE email=?',email.toLowerCase());
      // Also run scrypt for unknown emails, limiting timing-based enumeration.
      const match=verifyPassword(password,user?.salt||dummySalt,user?.password_hash||dummyHash);
      return user && match ? {id:user.id,email:user.email,role:user.role} : null;
    },
    createSession(userId,now=Date.now()) {
      const raw=token(), tokenHash=sha256(raw), csrfSecret=token();
      run('DELETE FROM sessions WHERE expires_at<=?',now);
      run('INSERT INTO sessions VALUES (?,?,?,?)',tokenHash,userId,csrfSecret,now+12*60*60*1000);
      return raw;
    },
    /** One-time use enforcement across sessions, atomic even for concurrent requests. */
    consumeOwnerOtp(userId, step) {
      if (!Number.isSafeInteger(step) || step < 0) return false;
      return tx(() => {
        const previous = one('SELECT last_step FROM owner_mfa_replay WHERE user_id=?',userId);
        if (previous && step <= previous.last_step) return false;
        run('INSERT INTO owner_mfa_replay(user_id,last_step) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET last_step=excluded.last_step',userId,step);
        return true;
      });
    },
    session(raw,now=Date.now()) {
      if(!raw || raw.length>200)return null;
      const s=one('SELECT s.token_hash,s.user_id,s.csrf_secret,s.expires_at,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',sha256(raw));
      return s && s.expires_at>now ? s : null;
    },
    revokeSession:raw=>run('DELETE FROM sessions WHERE token_hash=?',sha256(raw)),
    revokeAllSessions(userId) {
      return tx(()=>{
        const removed=run('DELETE FROM sessions WHERE user_id=?',userId).changes;
        audit(userId,null,'session.revoked_all',{sessions:removed});
        return removed;
      });
    },
    listSites:()=>q('SELECT * FROM sites ORDER BY created_at DESC,slug'),
    getSite:slug=>one('SELECT * FROM sites WHERE slug=?',slug),
    createSite(input,actorId) {
      return tx(()=>{const id=randomUUID();run('INSERT INTO sites (id,slug,name,tagline,accent,plan) VALUES (?,?,?,?,?,?)',id,input.slug,input.name,input.tagline,input.accent,input.plan);audit(actorId,id,'site.created',{slug:input.slug,plan:input.plan});return this.getSite(input.slug);});
    },
    updateSite(slug,input,actorId) {
      const site=this.getSite(slug);if(!site) return false;
      return tx(()=>{run('UPDATE sites SET name=?,tagline=?,accent=? WHERE id=?',input.name,input.tagline,input.accent,site.id);audit(actorId,site.id,'site.updated',{});return true;});
    },
    hasFeature(site,feature) {
      if(!site || site.status!=='active' || !plans[site.plan]?.features.includes(feature))return false;
      const override=one('SELECT enabled FROM site_feature_overrides WHERE site_id=? AND feature=?',site.id,feature);
      return override ? override.enabled===1 : true;
    },
    setFeature(slug,feature,enabled,actorId) {
      const site=this.getSite(slug);
      if(!site) return false;
      if(!plans[site.plan]?.features.includes(feature)||typeof enabled!=='boolean')throw new Error('Feature unavailable in current plan');
      return tx(()=>{
        run('INSERT INTO site_feature_overrides(site_id,feature,enabled) VALUES (?,?,?) ON CONFLICT(site_id,feature) DO UPDATE SET enabled=excluded.enabled',site.id,feature,enabled?1:0);
        audit(actorId,site.id,'feature.updated',{feature,enabled});return true;
      });
    },
    updatePlan(slug,plan,actorId) {
      if(!Object.hasOwn(plans,plan))throw new Error('Invalid plan');
      const site=this.getSite(slug);if(!site)return false;
      return tx(()=>{run('UPDATE sites SET plan=? WHERE id=?',plan,site.id);audit(actorId,site.id,'plan.changed',{from:site.plan,to:plan});return true;});
    },
    setStatus(slug,status,actorId) {
      if(!['active','suspended'].includes(status))throw new Error('Invalid status');
      const site=this.getSite(slug);if(!site)return false;
      return tx(()=>{run('UPDATE sites SET status=? WHERE id=?',status,site.id);audit(actorId,site.id,'site.status',{status});return true;});
    },
    membership(userId,siteId) {return one('SELECT role FROM memberships WHERE user_id=? AND site_id=?',userId,siteId)?.role || null;},
    listMembershipSites(userId) {return q('SELECT s.*,m.role AS member_role FROM sites s JOIN memberships m ON m.site_id=s.id WHERE m.user_id=?',userId);},
    countStaff(siteId) {return one('SELECT count(*) AS n FROM memberships WHERE site_id=?',siteId).n;},
    listProducts(siteId) {return q('SELECT * FROM products WHERE site_id=? ORDER BY created_at DESC,id',siteId);},
    countProducts(siteId) {return one('SELECT count(*) AS n FROM products WHERE site_id=?',siteId).n;},
    addProduct(site, name, price, stock, actor) {
      return tx(()=>{
        // The limit check and insertion share an exclusive SQLite transaction.
        if(!this.hasFeature(this.getSite(site.slug),'catalog')) throw new Error('Feature unavailable');
        if(this.countProducts(site.id) >= plans[this.getSite(site.slug).plan].maxProducts)throw new Error('Product plan limit');
        const id=randomUUID();run('INSERT INTO products (id,site_id,name,price_piasters,stock) VALUES (?,?,?,?,?)',id,site.id,name,price,stock);
        audit(actor,site.id,'product.created',{id});return id;
      });
    },
    makeInvite(site, email,role,actor,now=Date.now()) {
      return tx(()=>{
        const used=this.countStaff(site.id)+one('SELECT count(*) AS n FROM invitations WHERE site_id=? AND used_at IS NULL AND expires_at>?',site.id,now).n;
        if(used>=plans[site.plan].maxStaff)throw new Error('Staff plan limit');
        const raw=token();run('INSERT INTO invitations VALUES (?,?,?,?,?,?,?)',sha256(raw),site.id,email.toLowerCase(),role,now+24*3600*1000,null,actor);audit(actor,site.id,'invite.created',{role});return raw;
      });
    },
    invitation(raw,now=Date.now()) {const i=one('SELECT * FROM invitations WHERE token_hash=?',sha256(raw));return i && i.used_at===null && i.expires_at>now ? i:null;},
    acceptInvite(raw,password,now=Date.now()) {
      return tx(()=>{
        const i=this.invitation(raw,now);if(!i)throw new Error('Invalid or expired invite');
        let user=one('SELECT id FROM users WHERE email=?',i.email);
        if(!user){const pass=hashPassword(password);const id=randomUUID();run("INSERT INTO users(id,email,salt,password_hash,role) VALUES (?,?,?,?,'member')",id,i.email,pass.salt,pass.hash);user={id};}
        else {
          // Never reset an existing user's password with an invitation link.
          throw new Error('Existing account: sign in and request membership assignment');
        }
        run('INSERT INTO memberships(site_id,user_id,role) VALUES (?,?,?)',i.site_id,user.id,i.role);
        run('UPDATE invitations SET used_at=? WHERE token_hash=?',now,i.token_hash);
        audit(user.id,i.site_id,'invite.accepted',{role:i.role});return user.id;
      });
    },
    // All metrics are aggregated on the server; no cross-tenant queries for staff.
    ownerSnapshot(now=Date.now()) {
      const totals={
        products:one('SELECT count(*) AS n FROM products').n,
        members:one('SELECT count(*) AS n FROM memberships').n,
        invites:one('SELECT count(*) AS n FROM invitations WHERE used_at IS NULL AND expires_at>?',now).n,
        bySite:{}
      };
      for (const row of q(`SELECT s.id, count(DISTINCT p.id) AS products,
          count(DISTINCT m.user_id) AS staff
        FROM sites s LEFT JOIN products p ON p.site_id=s.id
        LEFT JOIN memberships m ON m.site_id=s.id GROUP BY s.id`)) {
        totals.bySite[row.id]={products:row.products,staff:row.staff};
      }
      return totals;
    },
    listAudit:()=>q('SELECT event,site_id,created_at FROM audit_events ORDER BY created_at DESC LIMIT 30'),
    seedForPreview(ownerId) {
      if(this.listSites().length || !opts.seed)return;
      for(const data of [
        {slug:'atelier-demo',name:'Atelier',tagline:'قطع مختارة وتصميم بسيط للأناقة اليومية',accent:'#294d48',plan:'growth'},
        {slug:'nova-demo',name:'Nova Studio',tagline:'تجربة مستقلة لمنتجات وإكسسوارات عصرية',accent:'#674b87',plan:'starter'}
      ]) {
        const site=this.createSite(data,ownerId);
        this.addProduct(site,'منتج تجريبي',149900,10,ownerId);
      }
    }
  };
}
