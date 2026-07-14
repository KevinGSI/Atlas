import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrationTableNames, runMigrations } from '../src/migrations.js';

async function fixture(applied = []) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-migrations-'));
  await writeFile(join(directory, '0001_first.sql'), 'CREATE TABLE first_table(id text);');
  await writeFile(join(directory, '0002_second.sql'), 'CREATE TABLE second_table(id text);');
  const calls = [];
  const client = {
    async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  const pool = {
    async query(sql) {
      calls.push({ sql });
      if (sql.startsWith('SELECT name')) return { rows: applied };
      return { rows: [] };
    },
    async connect() { return client; }
  };
  return { directory, pool, calls, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('migration runner applies ordered migrations transactionally', async () => {
  const value = await fixture();
  try {
    assert.deepEqual(await runMigrations(value.pool, value.directory), ['0001_first.sql', '0002_second.sql']);
    assert.deepEqual(value.calls.filter((call) => call.sql === 'BEGIN').length, 2);
    assert.deepEqual(value.calls.filter((call) => call.sql === 'COMMIT').length, 2);
    const inserts = value.calls.filter((call) => call.sql.startsWith('INSERT INTO atlas_schema_migration'));
    assert.equal(inserts[0].values[0], '0001_first.sql');
    assert.equal(inserts[1].values[0], '0002_second.sql');
  } finally { await value.cleanup(); }
});

test('migration runner rejects modified applied migrations', async () => {
  const value = await fixture([{ name: '0001_first.sql', checksum: 'wrong' }]);
  try {
    await assert.rejects(() => runMigrations(value.pool, value.directory), (error) => error.code === 'MIGRATION_CHECKSUM_MISMATCH');
  } finally { await value.cleanup(); }
});

test('migration table contract is derived from SQL instead of a manual count', () => {
  assert.deepEqual(migrationTableNames([
    { sql: 'CREATE TABLE atlas_one(id text); CREATE TABLE IF NOT EXISTS atlas_two(id text);' },
    { sql: 'CREATE TABLE atlas_one(id text); ALTER TABLE atlas_two ADD COLUMN title text;' }
  ]), ['atlas_one', 'atlas_two']);
});
