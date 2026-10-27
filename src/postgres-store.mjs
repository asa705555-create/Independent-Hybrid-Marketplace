import { randomUUID, scryptSync } from 'node:crypto';
import { hashPassword, verifyPassword, sha256, token, plans } from './security.mjs';

/**
 * Dedicated PostgreSQL adapter. All SQL parameters are bound, not interpolated.
 * Node's pg client is dynamically imported only for production use so the
 * SQLite-only offline test suite can run without network dependencies.
 *
 * The adapter uses the same contract as the legacy SQLite preview store, but
 * methods are async to support server-side PostgreSQL transactions.
 */
export async function createPostgresStore({ connectionString, pool: existingPool, ssl } = {}) {
  if (!existingPool && (!connectionString || typeof connectionString !== 'string')) throw new Error('DATABASE_URL is required');
  const pool = existingPool || await (async () => {
    const { default: pg } = await import('pg');
    return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000, ssl });
  })();
  const table = name => `jame3_private.${name}`; // Identifiers are hardcoded below.
  const ask = async (sql, args = [], client = pool) => (await client.query(sql, args)).rows;
  const one = async (sql, args = [], client = pool) => (await ask(sql, args, client))[0] || null;
  const n = value => Number(value || 0); // pg parses COUNT() and bigint as strings.
  const audit = (client, actor, site, event, meta = {}) => client.query(
    `INSERT INTO ${table('audit_events')}(id,actor_id,site_id,event,meta) VALUES($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), actor || null, site || null, event, JSON.stringify(meta)]);
  const transaction = async fn => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally { client.release(); }
  };
  const dummySalt = 'abcdef0123456789abcdef0123456789';
  const dummyHash = scryptSync('unused-demo-account', dummySalt, 64).toString('hex');
  const siteBySlug = (slug, client = pool, lock = false) => one(
    `SELECT * FROM ${table('sites')} WHERE slug=$1${lock ? ' FOR UPDATE' : ''}`, [slug], client);
  const siteFeature = async (site, feature, client = pool) => {
    if (!site || site.status !== 'active' || !plans[site.plan]?.features.includes(feature)) return false;
    const row = await one(`SELECT enabled FROM ${table('site_feature_overrides')} WHERE site_id=$1 AND feature=$2`, [site.id, feature], client);
    return row ? row.enabled === true : true;
  };
  const getInvite = (raw, now = Date.now(), client = pool, lock = false) => {
    if (!raw || typeof raw !== 'string' || raw.length > 200) return Promise.resolve(null);
    return one(`SELECT * FROM ${table('invitations')} WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2${lock ? ' FOR UPDATE' : ''}`,
      [sha256(raw), now], client);
  };

  const store = {
    async initialize() {
      // Bootstrap is explicitly separate from each HTTP request.
      await pool.query(`SELECT 1 FROM ${table('sites')} LIMIT 0`);
      return true;
    },
    async health() { await pool.query('SELECT 1'); return true; },
    async close() { if (!existingPool) await pool.end(); },
    async bootstrapOwner(email, password) {
      // Create owner once. Deploys must never silently replace saved passwords.
      return transaction(async client => {
        await client.query('SELECT pg_advisory_xact_lock(77301097)');
        const existing = await one(`SELECT id FROM ${table('users')} WHERE email=$1`, [email], client);
        if (existing) {
          const user = await one(`SELECT id,role FROM ${table('users')} WHERE id=$1`, [existing.id], client);
          if (user.role !== 'owner') throw new Error('Configured owner email belongs to a non-owner account');
          return user.id;
        }
        const otherOwner = await one(`SELECT id FROM ${table('users')} WHERE role='owner' LIMIT 1`, [], client);
        if (otherOwner) throw new Error('An owner already exists; configure the current account rather than creating another');
        const pass = hashPassword(password);
        const id = randomUUID();
        await client.query(`INSERT INTO ${table('users')}(id,email,salt,password_hash,role) VALUES($1,$2,$3,$4,'owner')`,
          [id, email.toLowerCase(), pass.salt, pass.hash]);
        return id;
      });
    },
    getUserByEmail: email => one(`SELECT * FROM ${table('users')} WHERE email=$1`, [email.toLowerCase()]),
    getUser: id => one(`SELECT id,email,role FROM ${table('users')} WHERE id=$1`, [id]),
    async verifyLogin(email, password) {
      const user = await store.getUserByEmail(email);
      const match = verifyPassword(password, user?.salt || dummySalt, user?.password_hash || dummyHash);
      return user && match ? { id: user.id, email: user.email, role: user.role } : null;
    },
    async createSession(userId, now = Date.now()) {
      const raw = token();
      await transaction(async client => {
        await client.query(`DELETE FROM ${table('sessions')} WHERE expires_at<=$1`, [now]);
        await client.query(`INSERT INTO ${table('sessions')}(token_hash,user_id,csrf_secret,expires_at) VALUES($1,$2,$3,$4)`,
          [sha256(raw), userId, token(), now + 12 * 60 * 60 * 1000]);
      });
      return raw;
    },
    async consumeOwnerOtp(userId, step) {
      if (!Number.isSafeInteger(step) || step < 0) return false;
      // Atomic conditional upsert prevents OTP replay under concurrent requests.
      const result = await pool.query(`INSERT INTO ${table('owner_mfa_replay')}(user_id,last_step) VALUES($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET last_step=EXCLUDED.last_step
        WHERE ${table('owner_mfa_replay')}.last_step < EXCLUDED.last_step
        RETURNING last_step`, [userId, step]);
      return result.rowCount === 1;
    },
    async session(raw, now = Date.now()) {
      if (!raw || raw.length > 200) return null;
      return one(`SELECT s.token_hash,s.user_id,s.csrf_secret,s.expires_at,u.email,u.role
        FROM ${table('sessions')} s JOIN ${table('users')} u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>$2`, [sha256(raw), now]);
    },
    revokeSession: raw => pool.query(`DELETE FROM ${table('sessions')} WHERE token_hash=$1`, [sha256(raw)]),
    async revokeAllSessions(userId) {
      return transaction(async client => {
        const removed = await client.query(`DELETE FROM ${table('sessions')} WHERE user_id=$1`, [userId]);
        await audit(client, userId, null, 'session.revoked_all', { sessions: removed.rowCount });
        return removed.rowCount;
      });
    },
    listSites: () => ask(`SELECT * FROM ${table('sites')} ORDER BY created_at DESC,slug`),
    getSite: slug => siteBySlug(slug),
    async createSite(input, actorId) {
      return transaction(async client => {
        const id = randomUUID();
        await client.query(`INSERT INTO ${table('sites')}(id,slug,name,tagline,accent,plan) VALUES($1,$2,$3,$4,$5,$6)`,
          [id,input.slug,input.name,input.tagline,input.accent,input.plan]);
        await audit(client, actorId, id, 'site.created', { slug: input.slug, plan: input.plan });
        return siteBySlug(input.slug,client);
      });
    },
    async updateSite(slug, input, actorId) {
      return transaction(async client => {
        const site = await siteBySlug(slug,client,true); if (!site) return false;
        await client.query(`UPDATE ${table('sites')} SET name=$1,tagline=$2,accent=$3 WHERE id=$4`,
          [input.name,input.tagline,input.accent,site.id]);
        await audit(client,actorId,site.id,'site.updated');return true;
      });
    },
    hasFeature: (site, feature) => siteFeature(site, feature),
    async setFeature(slug, feature, enabled, actorId) {
      if (typeof enabled !== 'boolean') throw new Error('Invalid enabled');
      return transaction(async client => {
        const site = await siteBySlug(slug,client,true); if (!site) return false;
        if (!plans[site.plan]?.features.includes(feature)) throw new Error('Feature unavailable in current plan');
        await client.query(`INSERT INTO ${table('site_feature_overrides')}(site_id,feature,enabled) VALUES($1,$2,$3)
          ON CONFLICT(site_id,feature) DO UPDATE SET enabled=EXCLUDED.enabled`, [site.id,feature,enabled]);
        await audit(client,actorId,site.id,'feature.updated',{feature,enabled});return true;
      });
    },
    async updatePlan(slug, plan, actorId) {
      if (!Object.hasOwn(plans,plan)) throw new Error('Invalid plan');
      return transaction(async client => {
        const site = await siteBySlug(slug,client,true); if (!site) return false;
        await client.query(`UPDATE ${table('sites')} SET plan=$1 WHERE id=$2`, [plan,site.id]);
        await audit(client,actorId,site.id,'plan.changed',{from:site.plan,to:plan});return true;
      });
    },
    async setStatus(slug, status, actorId) {
      if (!['active','suspended'].includes(status)) throw new Error('Invalid status');
      return transaction(async client => {
        const site = await siteBySlug(slug,client,true); if (!site) return false;
        await client.query(`UPDATE ${table('sites')} SET status=$1 WHERE id=$2`, [status,site.id]);
        await audit(client,actorId,site.id,'site.status',{status});return true;
      });
    },
    async membership(userId,siteId) {
      const row = await one(`SELECT role FROM ${table('memberships')} WHERE user_id=$1 AND site_id=$2`, [userId,siteId]);
      return row?.role || null;
    },
    listMembershipSites: userId => ask(`SELECT s.*,m.role AS member_role FROM ${table('sites')} s JOIN ${table('memberships')} m ON m.site_id=s.id WHERE m.user_id=$1`, [userId]),
    async countStaff(siteId) {const row=await one(`SELECT count(*) AS n FROM ${table('memberships')} WHERE site_id=$1`,[siteId]);return n(row.n);},
    listProducts: siteId => ask(`SELECT id,site_id,name,price_piasters,stock,created_at FROM ${table('products')} WHERE site_id=$1 ORDER BY created_at DESC,id`,[siteId]),
    async countProducts(siteId) {const row=await one(`SELECT count(*) AS n FROM ${table('products')} WHERE site_id=$1`,[siteId]);return n(row.n);},
    async addProduct(site, name, price, stock, actor) {
      return transaction(async client => {
        // Per-site row lock serializes product quota checks and inserts.
        const current = await siteBySlug(site.slug,client,true);
        if (!await siteFeature(current,'catalog',client)) throw new Error('Feature unavailable');
        const count = await one(`SELECT count(*) AS n FROM ${table('products')} WHERE site_id=$1`,[current.id],client);
        if(n(count.n)>=plans[current.plan].maxProducts)throw new Error('Product plan limit');
        const id=randomUUID();
        await client.query(`INSERT INTO ${table('products')}(id,site_id,name,price_piasters,stock) VALUES($1,$2,$3,$4,$5)`,
          [id,current.id,name,price,stock]);
        await audit(client,actor,current.id,'product.created',{id});return id;
      });
    },
    async makeInvite(site,email,role,actor,now=Date.now()) {
      return transaction(async client => {
        const current=await siteBySlug(site.slug,client,true);
        if (!current || current.status!=='active') throw new Error('Site unavailable');
        const staff=await one(`SELECT count(*) AS n FROM ${table('memberships')} WHERE site_id=$1`,[current.id],client);
        const pending=await one(`SELECT count(*) AS n FROM ${table('invitations')} WHERE site_id=$1 AND used_at IS NULL AND expires_at>$2`,[current.id,now],client);
        if(n(staff.n)+n(pending.n)>=plans[current.plan].maxStaff) throw new Error('Staff plan limit');
        const raw=token();
        await client.query(`INSERT INTO ${table('invitations')}(token_hash,site_id,email,role,expires_at,created_by)
          VALUES($1,$2,$3,$4,$5,$6)`,[sha256(raw),current.id,email.toLowerCase(),role,now+86400000,actor]);
        await audit(client,actor,current.id,'invite.created',{role});return raw;
      });
    },
    invitation: (raw,now=Date.now()) => getInvite(raw,now),
    async acceptInvite(raw,password,now=Date.now()) {
      return transaction(async client => {
        const inv=await getInvite(raw,now,client,true);
        if(!inv)throw new Error('Invalid or expired invite');
        const existing=await one(`SELECT id FROM ${table('users')} WHERE email=$1`,[inv.email],client);
        if(existing)throw new Error('Existing account: sign in and request membership assignment');
        const pass=hashPassword(password),id=randomUUID();
        await client.query(`INSERT INTO ${table('users')}(id,email,salt,password_hash,role) VALUES($1,$2,$3,$4,'member')`,
          [id,inv.email,pass.salt,pass.hash]);
        await client.query(`INSERT INTO ${table('memberships')}(site_id,user_id,role) VALUES($1,$2,$3)`,[inv.site_id,id,inv.role]);
        await client.query(`UPDATE ${table('invitations')} SET used_at=$1 WHERE token_hash=$2`,[now,inv.token_hash]);
        await audit(client,id,inv.site_id,'invite.accepted',{role:inv.role});return id;
      });
    },
    async ownerSnapshot(now=Date.now()) {
      const [products,members,invites,sites]=await Promise.all([
        one(`SELECT count(*) AS n FROM ${table('products')}`),
        one(`SELECT count(*) AS n FROM ${table('memberships')}`),
        one(`SELECT count(*) AS n FROM ${table('invitations')} WHERE used_at IS NULL AND expires_at>$1`,[now]),
        ask(`SELECT s.id,count(DISTINCT p.id) AS products,count(DISTINCT m.user_id) AS staff FROM ${table('sites')} s
             LEFT JOIN ${table('products')} p ON p.site_id=s.id LEFT JOIN ${table('memberships')} m ON m.site_id=s.id GROUP BY s.id`)
      ]);
      return {products:n(products.n),members:n(members.n),invites:n(invites.n),bySite:Object.fromEntries(sites.map(x=>[x.id,{products:n(x.products),staff:n(x.staff)}]))};
    },
    listAudit: () => ask(`SELECT event,site_id,created_at FROM ${table('audit_events')} ORDER BY created_at DESC LIMIT 30`),
    async seedForPreview(ownerId, enabled=false) {
      if(!enabled || (await this.listSites()).length) return;
      for(const data of [
        {slug:'atelier-demo',name:'Atelier',tagline:'قطع مختارة وتصميم بسيط للأناقة اليومية',accent:'#294d48',plan:'growth'},
        {slug:'nova-demo',name:'Nova Studio',tagline:'تجربة مستقلة لمنتجات وإكسسوارات عصرية',accent:'#674b87',plan:'starter'}
      ]) {
        const site=await this.createSite(data,ownerId);
        await this.addProduct(site,'منتج تجريبي',149900,10,ownerId);
      }
    }
  };
  return store;
}
