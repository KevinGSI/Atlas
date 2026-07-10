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

test('PostgreSQL identity adapter stores password hashes without exposing SQL interpolation', async () => {
  const calls = [];
  const row = { id: 'usr_1', email: 'lawyer@example.com', name: 'Lawyer', password_hash: 'scrypt$hash', created_at: timestamp };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(pool);
  const user = await repository.createUser({ id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash, createdAt: timestamp });
  assert.equal(user.passwordHash, 'scrypt$hash');
  assert.match(calls[0].sql, /VALUES \(\$1,\$2,\$3,\$4,\$5\)/);
  assert.equal(calls[0].values[3], 'scrypt$hash');
});

test('PostgreSQL membership lookup is scoped by workspace and user', async () => {
  const calls = [];
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; } };
  const repository = new PostgresRepository(pool);
  await assert.rejects(() => repository.getMembership('wsp_1', 'usr_1'), (error) => error.code === 'ACCESS_DENIED');
  assert.match(calls[0].sql, /workspace_id = \$1 AND user_id = \$2/);
  assert.deepEqual(calls[0].values, ['wsp_1', 'usr_1']);
});

test('PostgreSQL optimistic update constrains workspace, id, version, and deletion state', async () => {
  const calls = [];
  const base = { id: 'obj_1', workspace_id: 'wsp_1', parent_object_id: null, dimension: 'matter', type: 'civil', title: 'Before', state: {}, version: 1, created_at: timestamp, updated_at: timestamp, deleted_at: null };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [sql.startsWith('SELECT') ? base : { ...base, title: 'After', version: 2 }] }; } };
  const repository = new PostgresRepository(pool);
  const updated = await repository.updateObject('wsp_1', 'obj_1', 1, { title: 'After' }, timestamp);
  assert.equal(updated.version, 2);
  assert.match(calls[1].sql, /version = \$3 AND deleted_at IS NULL/);
  assert.deepEqual(calls[1].values.slice(0, 3), ['wsp_1', 'obj_1', 1]);
});

test('PostgreSQL audit adapter persists complete before and after snapshots', async () => {
  const calls = [];
  const value = { id: 'aud_1', workspaceId: 'wsp_1', objectId: 'obj_1', actorId: 'usr_1', action: 'object.updated', beforeSnapshot: { version: 1 }, afterSnapshot: { version: 2 }, createdAt: timestamp };
  const row = { id: value.id, workspace_id: value.workspaceId, object_id: value.objectId, actor_id: value.actorId, action: value.action, before_snapshot: value.beforeSnapshot, after_snapshot: value.afterSnapshot, created_at: timestamp };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(pool);
  const audit = await repository.createAudit(value);
  assert.equal(audit.afterSnapshot.version, 2);
  assert.match(calls[0].sql, /INSERT INTO atlas_audit_entry/);
  assert.deepEqual(calls[0].values[5], { version: 1 });
});

test('PostgreSQL refresh sessions store only token hashes and lock during rotation', async () => {
  const calls = [];
  const row = { id: 'ses_1', user_id: 'usr_1', family_id: 'fam_1', token_hash: 'hashed', expires_at: timestamp, created_at: timestamp, used_at: null, revoked_at: null, replaced_by_session_id: null };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(pool);
  const session = await repository.createRefreshSession({ id: 'ses_1', userId: 'usr_1', familyId: 'fam_1', tokenHash: 'hashed', expiresAt: timestamp, createdAt: timestamp, usedAt: null, revokedAt: null, replacedBySessionId: null });
  assert.equal(session.tokenHash, 'hashed');
  assert.match(calls[0].sql, /INSERT INTO atlas_refresh_session/);
  await repository.getRefreshSessionByHash('hashed');
  assert.match(calls[1].sql, /FOR UPDATE/);
  assert.deepEqual(calls[1].values, ['hashed']);
});

test('PostgreSQL session inventory and lookup are always scoped to the owning user', async () => {
  const calls = [];
  const row = { id: 'ses_1', user_id: 'usr_1', family_id: 'fam_1', token_hash: 'hashed', expires_at: timestamp, created_at: timestamp, used_at: null, revoked_at: null, replaced_by_session_id: null };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(pool);
  assert.equal((await repository.getRefreshSession('usr_1', 'ses_1')).id, 'ses_1');
  assert.deepEqual(calls[0].values, ['usr_1', 'ses_1']);
  assert.match(calls[0].sql, /user_id = \$1 AND id = \$2/);
  assert.equal((await repository.listRefreshSessions('usr_1')).length, 1);
  assert.deepEqual(calls[1].values, ['usr_1']);
  assert.match(calls[1].sql, /ORDER BY created_at DESC/);
});

test('PostgreSQL login throttling atomically increments a hashed principal', async () => {
  const calls = [];
  const row = { principal_hash: 'hashed-email', failed_count: 2, window_started_at: timestamp, locked_until: null, updated_at: timestamp };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: sql.startsWith('DELETE') ? [] : [row] }; } };
  const repository = new PostgresRepository(pool);
  const throttle = await repository.recordLoginFailure('hashed-email', timestamp, 900, 5, 900);
  assert.equal(throttle.failedCount, 2);
  assert.match(calls[0].sql, /ON CONFLICT \(principal_hash\) DO UPDATE/);
  assert.match(calls[0].sql, /failed_count \+ 1/);
  assert.deepEqual(calls[0].values, ['hashed-email', timestamp, 900, 5, 900]);
  await repository.clearLoginThrottle('hashed-email');
  assert.match(calls[1].sql, /DELETE FROM atlas_login_throttle/);
});

test('PostgreSQL password reset stores only hashes and locks tokens before consumption', async () => {
  const calls = [];
  const row = { id: 'rst_1', user_id: 'usr_1', token_hash: 'hashed-reset', expires_at: timestamp, created_at: timestamp, used_at: null };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(pool);
  const reset = await repository.createPasswordReset({ id: 'rst_1', userId: 'usr_1', tokenHash: 'hashed-reset', expiresAt: timestamp, createdAt: timestamp, usedAt: null });
  assert.equal(reset.tokenHash, 'hashed-reset');
  assert.match(calls[0].sql, /INSERT INTO atlas_password_reset/);
  await repository.getPasswordResetByHash('hashed-reset');
  assert.match(calls[1].sql, /FOR UPDATE/);
  await repository.revokeRefreshSessionsForUser('usr_1', timestamp);
  assert.match(calls[2].sql, /WHERE user_id = \$1/);
  await repository.invalidatePasswordResetsForUser('usr_1', timestamp);
  assert.match(calls[3].sql, /user_id = \$1 AND used_at IS NULL/);
});

test('PostgreSQL AI run ledger persists complete accountability fields and scopes history', async () => {
  const calls = [];
  const value = { id: 'air_1', workspaceId: 'wsp_1', actorId: 'usr_1', status: 'completed', prompt: 'Summarize', answer: 'Answer', provider: 'openai', model: 'model-a', sources: [{ objectId: 'obj_1' }], toolCalls: 1, usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, errorCode: null, createdAt: timestamp };
  const row = { id: value.id, workspace_id: value.workspaceId, actor_id: value.actorId, status: value.status, prompt: value.prompt, answer: value.answer, provider: value.provider, model: value.model, sources: value.sources, tool_calls: value.toolCalls, usage: value.usage, error_code: null, created_at: timestamp };
  const pool = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(pool);
  const run = await repository.createAiRun(value);
  assert.equal(run.usage.totalTokens, 5);
  assert.match(calls[0].sql, /INSERT INTO atlas_ai_run/);
  assert.deepEqual(calls[0].values[8], [{ objectId: 'obj_1' }]);
  await repository.listAiRuns('wsp_1', 25);
  assert.match(calls[1].sql, /workspace_id = \$1.*LIMIT \$2/);
  assert.deepEqual(calls[1].values, ['wsp_1', 25]);
});

test('PostgreSQL AI action decisions are workspace-scoped, versioned, and pending-only', async () => {
  const calls = [];
  const row = { id: 'aap_1', workspace_id: 'wsp_1', run_id: 'air_1', proposed_by: 'usr_1', action_type: 'create_task', input: { title: 'Review' }, status: 'approved', version: 2, decided_by: 'usr_2', result_object_id: 'obj_1', created_at: '2026-07-10T00:00:00.000Z', decided_at: '2026-07-10T01:00:00.000Z' };
  const executor = { async query(sql, values) { calls.push({ sql, values }); return { rows: [row] }; } };
  const repository = new PostgresRepository(executor);
  const result = await repository.decideAiActionProposal('wsp_1', 'aap_1', 1, 'approved', 'usr_2', 'obj_1', '2026-07-10T01:00:00.000Z');
  assert.equal(result.status, 'approved');
  assert.match(calls[0].sql, /workspace_id=\$1/);
  assert.match(calls[0].sql, /version=\$3/);
  assert.match(calls[0].sql, /status='pending'/);
});

test('PostgreSQL intelligence queue claims concurrent work with skip-locked semantics',async()=>{
  const calls=[];const row={id:'inj_1',workspace_id:'wsp_1',trigger_type:'email.received',object_id:'obj_1',event_id:'evt_1',status:'processing',attempts:1,payload:{},result:null,provider:null,error_code:null,available_at:timestamp,locked_at:timestamp,created_at:timestamp,completed_at:null};
  const repository=new PostgresRepository({async query(sql,values){calls.push({sql,values});return {rows:[row]};}});
  const job=await repository.claimIntelligenceJob(timestamp);assert.equal(job.status,'processing');assert.match(calls[0].sql,/FOR UPDATE SKIP LOCKED/);assert.match(calls[0].sql,/attempts=j\.attempts\+1/);
});

test('PostgreSQL observations preserve source, confidence, location, and provider provenance',async()=>{
  const calls=[];const row={id:'ino_1',workspace_id:'wsp_1',job_id:'inj_1',source_object_id:'obj_1',kind:'fact',data:{description:'Extracted'},confidence:'0.9300',source_location:{page:2},provider:'extractor',status:'candidate',reviewed_by:null,reviewed_at:null,created_at:timestamp};
  const repository=new PostgresRepository({async query(sql,values){calls.push({sql,values});return {rows:[row]};}});
  const observation=await repository.createIntelligenceObservation({id:'ino_1',workspaceId:'wsp_1',jobId:'inj_1',sourceObjectId:'obj_1',kind:'fact',data:row.data,confidence:.93,sourceLocation:row.source_location,provider:'extractor',status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:timestamp});
  assert.equal(observation.confidence,.93);assert.deepEqual(observation.sourceLocation,{page:2});assert.match(calls[0].sql,/atlas_intelligence_observation/);
});
