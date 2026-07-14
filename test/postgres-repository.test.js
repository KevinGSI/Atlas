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

test('PostgreSQL document blobs are content-addressed and workspace scoped',async()=>{const calls=[];const content=Buffer.from('private file');const row={workspace_id:'wsp_1',sha256:'a'.repeat(64),content,size:content.length,created_at:timestamp};const pool={async query(sql,values){calls.push({sql,values});return {rows:[row]};}};const repository=new PostgresRepository(pool);await repository.createDocumentBlob('wsp_1',row.sha256,content,timestamp);const stored=await repository.getDocumentBlob('wsp_1',row.sha256);assert.deepEqual(stored.content,content);assert.match(calls[0].sql,/ON CONFLICT \(workspace_id,sha256\)/);assert.deepEqual(calls[1].values,['wsp_1',row.sha256]);});

test('PostgreSQL semantic embeddings remain workspace scoped and parameterized',async()=>{const calls=[];const row={id:'dke_1',workspace_id:'wsp_1',observation_id:'ino_1',provider:'local',model:'semantic-test',dimensions:3,embedding:[1,0,0],created_at:timestamp};const repository=new PostgresRepository({async query(sql,values){calls.push({sql,values});return {rows:[row]};}});const created=await repository.createDocumentKnowledgeEmbedding({id:row.id,workspaceId:row.workspace_id,observationId:row.observation_id,provider:row.provider,model:row.model,dimensions:row.dimensions,embedding:row.embedding,createdAt:timestamp});const listed=await repository.listDocumentKnowledgeEmbeddings('wsp_1','semantic-test');assert.deepEqual(created.embedding,[1,0,0]);assert.equal(listed[0].observationId,'ino_1');assert.match(calls[0].sql,/ON CONFLICT \(observation_id,provider,model\)/);assert.deepEqual(calls[1].values,['wsp_1','semantic-test']);});

test('PostgreSQL source passages and raw-document backfill remain workspace scoped',async()=>{const calls=[];const chunk={id:'dkc_1',workspace_id:'wsp_1',source_object_id:'obj_1',ordinal:0,content:'atlas:v1:encrypted',source_location:{page:2},provider:'local',model:'semantic-test',dimensions:3,embedding:[1,0,0],created_at:timestamp};const document={id:'obj_1',workspace_id:'wsp_1',parent_object_id:null,dimension:'document',type:'order',title:'Order',state:{storageRef:'atlas-blob://wsp_1/hash'},version:1,created_at:timestamp,updated_at:timestamp,deleted_at:null};let index=0;const repository=new PostgresRepository({async query(sql,values){calls.push({sql,values});index+=1;return {rows:[index<3?chunk:document]};}});await repository.createDocumentKnowledgeChunk({id:chunk.id,workspaceId:'wsp_1',sourceObjectId:'obj_1',ordinal:0,content:chunk.content,sourceLocation:chunk.source_location,provider:'local',model:'semantic-test',dimensions:3,embedding:[1,0,0],createdAt:timestamp});await repository.listDocumentKnowledgeChunks('wsp_1','semantic-test');await repository.listUnchunkedStoredDocuments('wsp_1','semantic-test',5);assert.match(calls[0].sql,/ON CONFLICT \(workspace_id,source_object_id,model,ordinal\)/);assert.deepEqual(calls[1].values,['wsp_1','semantic-test']);assert.match(calls[2].sql,/d\.workspace_id=\$1/);assert.match(calls[2].sql,/atlas-blob:\/\/.*\$1/);assert.match(calls[2].sql,/c\.workspace_id=\$1/);assert.deepEqual(calls[2].values,['wsp_1','semantic-test',5]);});

test('PostgreSQL backfill selects only unindexed non-rejected documents in one workspace',async()=>{const calls=[];const row={id:'ino_1',workspace_id:'wsp_1',job_id:'inj_1',source_object_id:'obj_1',kind:'fact',data:{title:'Finding'},confidence:.9,source_location:{page:1},provider:'local',status:'accepted',reviewed_by:null,reviewed_at:null,created_at:timestamp,document_title:'Order'};const result=await new PostgresRepository({async query(sql,values){calls.push({sql,values});return {rows:[row]};}}).listUnembeddedDocumentObservations('wsp_1','semantic-test',50);assert.equal(result[0].documentTitle,'Order');assert.match(calls[0].sql,/o\.workspace_id=\$1/);assert.match(calls[0].sql,/o\.status<>'rejected'/);assert.match(calls[0].sql,/e\.id IS NULL/);assert.deepEqual(calls[0].values,['wsp_1','semantic-test',50]);});

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
  assert.equal(calls[0],'BEGIN');assert.match(calls[1],/atlas_canonical_event_object/);assert.deepEqual(calls.slice(2),['COMMIT','RELEASE']);
});

test('PostgreSQL transactions roll back canonical mutations missing event coverage',async()=>{const calls=[];const client={async query(sql){calls.push(sql);if(sql.startsWith('WITH mutated'))return {rows:[{id:'obj_orphan'}]};return {rows:[]};},release(){calls.push('RELEASE');}};const repository=new PostgresRepository({async connect(){return client;}});await assert.rejects(()=>repository.transaction(async()=> 'mutated'),(error)=>error.code==='CANONICAL_EVENT_REQUIRED'&&error.details.objectIds[0]==='obj_orphan');assert.equal(calls.includes('COMMIT'),false);assert.deepEqual(calls.slice(-2),['ROLLBACK','RELEASE']);});

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

test('PostgreSQL managed-user role changes and invitation cancellation remain parameterized and firm scoped',async()=>{
  const calls=[];
  const membershipRow={id:'mem_1',workspace_id:'wsp_1',user_id:'usr_member',role:'billing',active:true,deactivated_at:null,deactivated_by:null,deactivation_reason:null,created_at:timestamp};
  const invitationRow={id:'inv_1',workspace_id:'wsp_1',email:'new-user@firm.test',role:'paralegal',token_hash:'hashed-invitation',status:'pending',invited_by:'usr_owner',accepted_by:null,expires_at:'2026-07-17T12:00:00.000Z',created_at:timestamp,accepted_at:null};
  const pool={async query(sql,values){calls.push({sql,values});if(sql.startsWith('UPDATE atlas_workspace_membership'))return {rows:[membershipRow]};if(sql.startsWith('UPDATE atlas_workspace_invitation'))return {rows:[{...invitationRow,status:'canceled'}]};return {rows:[invitationRow]};}};
  const repository=new PostgresRepository(pool);

  const changed=await repository.updateMembershipRole('wsp_1','usr_member','billing');
  assert.deepEqual({workspaceId:changed.workspaceId,userId:changed.userId,role:changed.role,active:changed.active},{workspaceId:'wsp_1',userId:'usr_member',role:'billing',active:true});
  assert.match(calls[0].sql,/workspace_id=\$1 AND user_id=\$2/);
  assert.deepEqual(calls[0].values,['wsp_1','usr_member','billing']);

  const invitation=await repository.getWorkspaceInvitation('wsp_1','inv_1');
  assert.deepEqual({id:invitation.id,workspaceId:invitation.workspaceId,email:invitation.email,role:invitation.role,status:invitation.status},{id:'inv_1',workspaceId:'wsp_1',email:'new-user@firm.test',role:'paralegal',status:'pending'});
  assert.equal('workspace_id' in invitation,false);
  assert.match(calls[1].sql,/workspace_id=\$1 AND id=\$2/);
  assert.deepEqual(calls[1].values,['wsp_1','inv_1']);

  const canceled=await repository.cancelWorkspaceInvitation('wsp_1','inv_1');
  assert.equal(canceled.status,'canceled');
  assert.equal(canceled.workspaceId,'wsp_1');
  assert.match(calls[2].sql,/workspace_id=\$1 AND id=\$2 AND status='pending'/);
  assert.deepEqual(calls[2].values,['wsp_1','inv_1']);
});

test('PostgreSQL firm discovery is scoped only to the authenticated user',async()=>{const calls=[];const pool={async query(sql,values){calls.push({sql,values});return {rows:[]};}};await new PostgresRepository(pool).listMembershipsForUser('usr_1');assert.match(calls[0].sql,/WHERE user_id = \$1/);assert.deepEqual(calls[0].values,['usr_1']);});

test('PostgreSQL subscription lookup is constrained to one firm workspace',async()=>{
  const calls=[];
  const row={id:'sub_1',workspace_id:'wsp_1',plan:'pilot',status:'active',seat_limit:10,trial_ends_at:null,current_period_ends_at:null,created_at:timestamp,updated_at:timestamp};
  const pool={async query(sql,values){calls.push({sql,values});return {rows:[row]};}};
  const value=await new PostgresRepository(pool).getSubscription('wsp_1');
  assert.deepEqual({workspaceId:value.workspaceId,status:value.status,seatLimit:value.seatLimit},{workspaceId:'wsp_1',status:'active',seatLimit:10});
  assert.match(calls[0].sql,/workspace_id = \$1/);
  assert.deepEqual(calls[0].values,['wsp_1']);
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

test('PostgreSQL MFA factors store encrypted secrets and security activity is workspace scoped',async()=>{const calls=[];const factorRow={user_id:'usr_1',encrypted_secret:'v1:encrypted',enabled:true,recovery_code_hashes:['hash'],created_at:timestamp,verified_at:timestamp,updated_at:timestamp};const eventRow={id:'sec_1',user_id:'usr_1',workspace_id:'wsp_1',type:'login',outcome:'success',ip_address:'192.0.2.1',user_agent:'browser',details:{},created_at:timestamp};const pool={async query(sql,values){calls.push({sql,values});return {rows:[sql.includes('atlas_mfa_factor')?factorRow:eventRow]};}};const repository=new PostgresRepository(pool);const factor=await repository.upsertMfaFactor({userId:'usr_1',encryptedSecret:'v1:encrypted',enabled:true,recoveryCodeHashes:['hash'],createdAt:timestamp,verifiedAt:timestamp,updatedAt:timestamp});assert.equal(factor.encryptedSecret,'v1:encrypted');assert.match(calls[0].sql,/ON CONFLICT \(user_id\)/);const events=await repository.listSecurityEvents('wsp_1',50);assert.equal(events[0].ipAddress,'192.0.2.1');assert.match(calls[1].sql,/atlas_workspace_membership/);assert.deepEqual(calls[1].values,['wsp_1',50]);});

test('PostgreSQL firm access policy and membership deactivation remain workspace scoped',async()=>{const calls=[];const policyRow={workspace_id:'wsp_1',require_mfa:true,updated_by:'usr_owner',created_at:timestamp,updated_at:timestamp};const membershipRow={id:'mem_1',workspace_id:'wsp_1',user_id:'usr_member',role:'paralegal',active:false,deactivated_at:timestamp,deactivated_by:'usr_owner',deactivation_reason:'Offboarded',created_at:timestamp};const pool={async query(sql,values){calls.push({sql,values});return {rows:[sql.includes('atlas_workspace_security_policy')?policyRow:membershipRow]};}};const repository=new PostgresRepository(pool);const policy=await repository.upsertWorkspaceSecurityPolicy({workspaceId:'wsp_1',requireMfa:true,updatedBy:'usr_owner',createdAt:timestamp,updatedAt:timestamp});assert.equal(policy.requireMfa,true);assert.match(calls[0].sql,/ON CONFLICT \(workspace_id\)/);assert.deepEqual(calls[0].values,['wsp_1',true,'usr_owner',timestamp,timestamp]);const membership=await repository.updateMembershipAccess('wsp_1','usr_member',{active:false,deactivatedAt:timestamp,deactivatedBy:'usr_owner',deactivationReason:'Offboarded'});assert.equal(membership.active,false);assert.match(calls[1].sql,/workspace_id=\$1 AND user_id=\$2/);assert.deepEqual(calls[1].values,['wsp_1','usr_member',false,timestamp,'usr_owner','Offboarded']);});

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

test('PostgreSQL request limiting atomically consumes a hashed fixed-window bucket',async()=>{
  const calls=[];
  const row={key_hash:'a'.repeat(64),scope:'ai',request_count:3,window_started_at:timestamp,expires_at:'2026-07-10T12:01:00.000Z',updated_at:timestamp};
  const pool={async query(sql,values){calls.push({sql,values});return {rows:[row]};}};
  const repository=new PostgresRepository(pool);
  const bucket=await repository.consumeRateLimitBucket({keyHash:'a'.repeat(64),scope:'ai',now:timestamp,windowSeconds:60});
  assert.equal(bucket.count,3);assert.equal(bucket.scope,'ai');
  assert.match(calls[0].sql,/INSERT INTO atlas_rate_limit_bucket/);assert.match(calls[0].sql,/ON CONFLICT \(key_hash\) DO UPDATE/);assert.match(calls[0].sql,/request_count\+1/);
  assert.deepEqual(calls[0].values,['a'.repeat(64),'ai',timestamp,60]);
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

test('PostgreSQL awareness feed is attorney-scoped and review receipts upsert safely',async()=>{
  const calls=[];const item={id:'awi_1',workspace_id:'wsp_1',target_user_id:'usr_1',source_job_id:'inj_1',source_object_id:'obj_1',category:'incoming_email',priority:'high',headline:'Review response',summary:'Draft ready',observation_ids:[],action_proposal_ids:[],created_at:timestamp,review_status:'unseen'};
  const receipt={item_id:'awi_1',user_id:'usr_1',status:'reviewed',updated_at:timestamp};
  const repository=new PostgresRepository({async query(sql,values){calls.push({sql,values});return {rows:[sql.startsWith('INSERT INTO atlas_awareness_receipt')?receipt:item]};}});
  const feed=await repository.listAwarenessItems('wsp_1','usr_1',null);assert.equal(feed[0].reviewStatus,'unseen');assert.match(calls[0].sql,/target_user_id IS NULL OR i\.target_user_id=\$2/);assert.deepEqual(calls[0].values,['wsp_1','usr_1',null]);
  const updated=await repository.updateAwarenessReceipt('wsp_1','awi_1','usr_1','reviewed',timestamp);assert.equal(updated.status,'reviewed');assert.match(calls[1].sql,/ON CONFLICT \(item_id,user_id\) DO UPDATE/);assert.deepEqual(calls[1].values,['wsp_1','awi_1','usr_1','reviewed',timestamp]);
});

test('PostgreSQL scheduler leases acquire renew and release by owner',async()=>{const calls=[];const repository=new PostgresRepository({async query(sql,values){calls.push({sql,values});return {rows:[{lease_key:'cms-sync'}]};}});assert.equal(await repository.acquireSchedulerLease('cms-sync','instance-a',timestamp,'2026-07-10T00:02:00.000Z'),true);assert.match(calls[0].sql,/ON CONFLICT \(lease_key\) DO UPDATE/);assert.match(calls[0].sql,/expires_at <= \$3/);assert.equal(await repository.renewSchedulerLease('cms-sync','instance-a',timestamp,'2026-07-10T00:03:00.000Z'),true);assert.match(calls[1].sql,/owner_id=\$2 AND expires_at>\$3/);assert.equal(await repository.releaseSchedulerLease('cms-sync','instance-a'),true);assert.match(calls[2].sql,/DELETE FROM atlas_scheduler_lease/);});
