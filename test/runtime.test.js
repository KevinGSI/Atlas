import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRuntime } from '../src/runtime.js';
import { createApplicationReadiness } from '../src/application.js';

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

test('application readiness requires both PostgreSQL and file security to be live',async()=>{
  const calls=[];
  const ready=createApplicationReadiness({async ready(){calls.push('database');return true;}},{async ready(){calls.push('scanner');return true;}});
  assert.equal(await ready(),true);
  assert.deepEqual(calls,['database','scanner']);
  const scannerDown=createApplicationReadiness({async ready(){return true;}},{async ready(){throw new Error('scanner down');}});
  await assert.rejects(()=>scannerDown(),/scanner down/);
  let scannerCalled=false;
  const databaseDown=createApplicationReadiness({async ready(){throw new Error('database down');}},{async ready(){scannerCalled=true;}});
  await assert.rejects(()=>databaseDown(),/database down/);
  assert.equal(scannerCalled,false);
});
