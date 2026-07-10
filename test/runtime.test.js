import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRuntime } from '../src/runtime.js';

test('PostgreSQL runtime validates connectivity, readiness, and pool shutdown', async () => {
  const calls = [];
  class Pool {
    constructor(options) { calls.push(['construct', options]); }
    async query(sql) { calls.push(['query', sql]); return { rows: [{ '?column?': 1 }] }; }
    async end() { calls.push(['end']); }
  }
  const runtime = await createPostgresRuntime(
    { DATABASE_URL: 'postgresql://example/atlas', DATABASE_POOL_SIZE: '7' },
    { pg: { Pool } }
  );
  assert.equal(await runtime.ready(), true);
  await runtime.close();
  assert.deepEqual(calls, [
    ['construct', { connectionString: 'postgresql://example/atlas', max: 7 }],
    ['query', 'SELECT 1'],
    ['query', 'SELECT 1'],
    ['end']
  ]);
});
