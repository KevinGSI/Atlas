import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AtlasError } from './errors.js';

export async function loadMigrations(directory) {
  const names = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(directory, name), 'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

export async function runMigrations(pool, directory) {
  await pool.query(`CREATE TABLE IF NOT EXISTS atlas_schema_migration (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = await pool.query('SELECT name, checksum FROM atlas_schema_migration ORDER BY name');
  const known = new Map(applied.rows.map((row) => [row.name, row.checksum]));
  const executed = [];
  for (const migration of await loadMigrations(directory)) {
    if (known.has(migration.name)) {
      if (known.get(migration.name) !== migration.checksum) {
        throw new AtlasError('MIGRATION_CHECKSUM_MISMATCH', `Migration changed after application: ${migration.name}`, 500);
      }
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO atlas_schema_migration (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
      await client.query('COMMIT');
      executed.push(migration.name);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  return executed;
}
