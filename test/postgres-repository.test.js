import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresRepository } from '../src/postgres-repository.js';

const timestamp = '2026-07-10T12:00:00.000Z';

test('PostgreSQL workspace adapter uses parameterized SQL and maps rows', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ id: values[0], name: values[1], version: values[2], created_at: values[3], updated_at: values[4] }] };
    }
  };
  const repository = new PostgresRepository(pool);
  const result = await repository.createWorkspace({ id: 'wsp_1', name: 'Atlas', version: 1, createdAt: timestamp, updatedAt: timestamp });
  assert.equal(result.name, 'Atlas');
  assert.match(calls[0].sql, /VALUES \(\$1,\$2,\$3,\$4,\$5\)/);
  assert.deepEqual(calls[0].values, ['wsp_1', 'Atlas', 1, timestamp, timestamp]);
});

test('PostgreSQL transactions commit and release dedicated clients', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rows: [] }; }, release() { calls.push('RELEASE'); } };
  const pool = { async connect() { return client; } };
  const repository = new PostgresRepository(pool);
  const value = await repository.transaction(async (transaction) => {
    assert.notEqual(transaction, repository);
    return 'committed';
  });
  assert.equal(value, 'committed');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'RELEASE']);
});

test('PostgreSQL transactions roll back and release on failure', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rows: [] }; }, release() { calls.push('RELEASE'); } };
  const pool = { async connect() { return client; } };
  const repository = new PostgresRepository(pool);
  await assert.rejects(() => repository.transaction(async () => { throw new Error('forced'); }), /forced/);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('PostgreSQL object reads enforce workspace and soft-delete boundaries', async () => {
  const calls = [];
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; } };
  const repository = new PostgresRepository(pool);
  await assert.rejects(() => repository.getObject('wsp_1', 'obj_1'), (error) => error.code === 'OBJECT_NOT_FOUND');
  assert.match(calls[0].sql, /workspace_id = \$1 AND id = \$2 AND deleted_at IS NULL/);
  assert.deepEqual(calls[0].values, ['wsp_1', 'obj_1']);
});
