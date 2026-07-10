import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAiContent } from '../src/ai-content-migration.js';
import { AesGcmContentCipher } from '../src/content-security.js';

const cipher = new AesGcmContentCipher({ keys: { current: Buffer.alloc(32, 5).toString('base64') }, activeKeyId: 'current' });

function executorFixture({ failUpdate = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (failUpdate && sql.startsWith('UPDATE')) throw new Error('forced update failure');
      if (sql.includes('FROM atlas_ai_conversation')) return { rows: [{ id: 'aic_1', title: 'Legacy title' }] };
      if (sql.includes('FROM atlas_ai_message')) return { rows: [{ id: 'aim_1', content: 'Legacy message' }, { id: 'aim_2', content: cipher.encrypt('Already safe', 'message:aim_2:content') }] };
      if (sql.includes('FROM atlas_ai_run')) return { rows: [{ id: 'air_1', prompt: 'Legacy prompt', answer: 'Legacy answer' }, { id: 'air_2', prompt: cipher.encrypt('Safe', 'run:air_2:prompt'), answer: null }] };
      return { rows: [] };
    }
  };
}

test('AI content migration dry run counts only plaintext and rolls back without updates', async () => {
  const executor = executorFixture();
  const result = await migrateAiContent(executor, cipher);
  assert.deepEqual(result, { applied: false, counts: { conversations: 1, messages: 1, runPrompts: 1, runAnswers: 1 } });
  assert.equal(executor.calls.some((call) => call.sql.startsWith('UPDATE')), false);
  assert.equal(executor.calls.at(-1).sql, 'ROLLBACK');
});

test('AI content migration encrypts legacy fields in one locked transaction', async () => {
  const executor = executorFixture();
  const result = await migrateAiContent(executor, cipher, { apply: true });
  assert.equal(result.applied, true);
  const updates = executor.calls.filter((call) => call.sql.startsWith('UPDATE'));
  assert.equal(updates.length, 4);
  assert.ok(updates.every((call) => call.values[0].startsWith('atlas:v1:current:')));
  assert.equal(executor.calls.at(-1).sql, 'COMMIT');
  assert.ok(executor.calls.some((call) => call.sql.includes('ACCESS EXCLUSIVE')));
});

test('AI content migration rolls back and restores trigger state transactionally on failure', async () => {
  const executor = executorFixture({ failUpdate: true });
  await assert.rejects(() => migrateAiContent(executor, cipher, { apply: true }), /forced update failure/);
  assert.equal(executor.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(executor.calls.some((call) => call.sql === 'COMMIT'), false);
});
