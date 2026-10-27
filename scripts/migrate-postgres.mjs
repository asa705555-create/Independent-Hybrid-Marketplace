import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Apply immutable SQL migrations once under a PostgreSQL advisory lock. */
export async function migrate(pool, migrations) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(77301097)');
    await client.query(`CREATE SCHEMA IF NOT EXISTS jame3_private`);
    await client.query(`CREATE TABLE IF NOT EXISTS jame3_private.schema_migrations (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const sha = createHash('sha256').update(migration.sql).digest('hex');
      const already = await client.query('SELECT sha256 FROM jame3_private.schema_migrations WHERE name=$1',[migration.name]);
      if (already.rows.length) {
        if (already.rows[0].sha256 !== sha) throw new Error('Previously applied migration changed: '+migration.name);
        continue;
      }
      await client.query(migration.sql);
      await client.query('INSERT INTO jame3_private.schema_migrations(name,sha256) VALUES($1,$2)',[migration.name,sha]);
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

export async function main(env=process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for migration');
  const {default: pg}=await import('pg');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max:2, connectionTimeoutMillis:10000 });
  try {
    const file = new URL('../db/001_postgres_control_plane.sql',import.meta.url);
    const sql = await readFile(file, 'utf8');
    await migrate(pool,[{name:'001_postgres_control_plane',sql}]);
    console.log('Jame3 isolated PostgreSQL migrations applied/verified');
  } finally { await pool.end(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error=>{console.error('Database migration failed:',error?.message||'unknown');process.exitCode=1;});
}
