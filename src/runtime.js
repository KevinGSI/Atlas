import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresRepository } from './postgres-repository.js';
import { runMigrations } from './migrations.js';

export async function createRuntimeRepository(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL runtime');
  let pg;
  try { pg = await import('pg'); }
  catch { throw new Error('PostgreSQL runtime requires the pg package; run npm install'); }
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: Number(env.DATABASE_POOL_SIZE ?? 10) });
  await pool.query('SELECT 1');
  const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  await runMigrations(pool, migrations);
  return new PostgresRepository(pool);
}
