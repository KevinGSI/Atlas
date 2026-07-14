import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

async function fixture() {
  const clock = () => '2026-07-10T12:00:00.000Z';
  const service = new AtlasService(new InMemoryRepository(), clock);
  const workspace = await service.createWorkspace({ name: 'Meredith Legal' });
  return { service, workspace };
}

test('creates and retrieves a workspace', async () => {
  const { service, workspace } = await fixture();
  assert.match(workspace.id, /^wsp_[a-f0-9]{32}$/);
  assert.deepEqual(await service.getWorkspace(workspace.id), workspace);
});

test('creates a canonical matter and its immutable audit event', async () => {
  const { service, workspace } = await fixture();
  const matter = await service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'State v. Atlas' });
  assert.equal((await service.getObject(workspace.id, matter.id)).version, 1);
  const events = await service.listEvents(workspace.id, matter.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'object.created');
});

test('filters objects by dimension and type', async () => {
  const { service, workspace } = await fixture();
  await service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Matter' });
  await service.createObject(workspace.id, { dimension: 'evidence', type: 'video', title: 'Body camera' });
  assert.equal((await service.listObjects(workspace.id, { dimension: 'evidence' })).length, 1);
  assert.equal((await service.listObjects(workspace.id, { type: 'criminal' })).length, 1);
});

test('validates parent objects inside the workspace', async () => {
  const { service, workspace } = await fixture();
  await assert.rejects(
    () => service.createObject(workspace.id, { parentObjectId: 'obj_missing', dimension: 'evidence', type: 'video', title: 'Missing parent' }),
    (error) => error.code === 'OBJECT_NOT_FOUND'
  );
});

test('creates relationships and expands a graph', async () => {
  const { service, workspace } = await fixture();
  const matter = await service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Matter' });
  const evidence = await service.createObject(workspace.id, { dimension: 'evidence', type: 'video', title: 'Body camera' });
  await service.createRelationship(workspace.id, { fromObjectId: evidence.id, toObjectId: matter.id, type: 'supports' });
  const graph = await service.expandGraph(workspace.id, matter.id);
  assert.equal(graph.nodes[0].id, evidence.id);
  assert.equal(graph.relationships[0].type, 'supports');
});

test('rejects self and duplicate relationships', async () => {
  const { service, workspace } = await fixture();
  const object = await service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Matter' });
  await assert.rejects(() => service.createRelationship(workspace.id, { fromObjectId: object.id, toObjectId: object.id, type: 'related' }), /cannot relate to itself/);
  const other = await service.createObject(workspace.id, { dimension: 'person', type: 'witness', title: 'Witness' });
  await service.createRelationship(workspace.id, { fromObjectId: object.id, toObjectId: other.id, type: 'involves' });
  await assert.rejects(() => service.createRelationship(workspace.id, { fromObjectId: object.id, toObjectId: other.id, type: 'involves' }), (error) => error.code === 'RELATIONSHIP_EXISTS');
});

test('validates timeline confidence', async () => {
  const { service, workspace } = await fixture();
  await assert.rejects(() => service.createEvent(workspace.id, { type: 'analysis.completed', actorId: 'ai', source: 'atlas', confidence: 1.2 }), /between 0 and 1/);
});

test('computes explainable matter health deductions', async () => {
  const { service, workspace } = await fixture();
  const incomplete = await service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Incomplete' });
  assert.deepEqual(await service.matterHealth(workspace.id, incomplete.id), {
    matterId: incomplete.id,
    score: 65,
    status: 'orange',
    reasons: [
      { code: 'MISSING_CLIENT', deduction: 15 },
      { code: 'MISSING_DEADLINE', deduction: 10 },
      { code: 'MISSING_OWNER', deduction: 10 }
    ]
  });
  const healthy = await service.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Healthy', state: { clientId: 'obj_client', nextDeadline: '2026-08-01', ownerId: 'usr_owner' } });
  assert.equal((await service.matterHealth(workspace.id, healthy.id)).score, 100);
});

test('matter health consumes accepted digital-twin deadlines and risks',async()=>{
  const {service,workspace}=await fixture();const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Twin Matter',state:{clientId:'client',ownerId:'owner'}});
  const email=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'incoming_email',title:'Scheduling email'});
  await service.createObject(workspace.id,{parentObjectId:email.id,dimension:'operation',type:'deadline',title:'Response due',state:{date:'2026-08-01'}});
  assert.equal((await service.matterHealth(workspace.id,matter.id)).score,100);
  const risk=await service.createObject(workspace.id,{parentObjectId:email.id,dimension:'operation',type:'risk',title:'Service defect'});
  const health=await service.matterHealth(workspace.id,matter.id);assert.equal(health.score,90);assert.deepEqual(health.reasons[0],{code:'INTELLIGENCE_RISK',deduction:10,objectId:risk.id});
});

test('rolls back object creation when its timeline event fails', async () => {
  class FailingEventRepository extends InMemoryRepository {
    async createEvent() { throw new Error('forced event failure'); }
  }
  const repository = new FailingEventRepository();
  const service = new AtlasService(repository);
  const workspace = await service.createWorkspace({ name: 'Rollback Test' });
  await assert.rejects(
    () => service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Must Roll Back' }),
    /forced event failure/
  );
  assert.deepEqual(await service.listObjects(workspace.id, {}), []);
});

test('updates objects with optimistic concurrency and append-only audit snapshots', async () => {
  const { service, workspace } = await fixture();
  const object = await service.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Original' });
  const updated = await service.updateObject(workspace.id, object.id, { version: 1, title: 'Amended', state: { ownerId: 'usr_1' } }, 'usr_1');
  assert.equal(updated.version, 2);
  assert.equal(updated.title, 'Amended');
  await assert.rejects(() => service.updateObject(workspace.id, object.id, { version: 1, title: 'Stale' }, 'usr_1'), (error) => error.code === 'VERSION_CONFLICT');
  const audits = await service.listAudits(workspace.id, object.id);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'object.updated');
  assert.equal(audits[0].beforeSnapshot.title, 'Original');
  assert.equal(audits[0].afterSnapshot.title, 'Amended');
});

test('soft deletes and restores objects with sequential versions and audit history', async () => {
  const { service, workspace } = await fixture();
  const object = await service.createObject(workspace.id, { dimension: 'evidence', type: 'video', title: 'BWC' });
  const deleted = await service.deleteObject(workspace.id, object.id, { version: 1 }, 'usr_1');
  assert.equal(deleted.version, 2);
  assert.ok(deleted.deletedAt);
  await assert.rejects(() => service.getObject(workspace.id, object.id), (error) => error.code === 'OBJECT_NOT_FOUND');
  const restored = await service.restoreObject(workspace.id, object.id, { version: 2 }, 'usr_1');
  assert.equal(restored.version, 3);
  assert.equal(restored.deletedAt, null);
  assert.deepEqual((await service.listAudits(workspace.id, object.id)).map((entry) => entry.action), ['object.deleted', 'object.restored']);
});

test('rolls back an object update when audit persistence fails', async () => {
  class FailingAuditRepository extends InMemoryRepository {
    async createAudit() { throw new Error('forced audit failure'); }
  }
  const repository = new FailingAuditRepository();
  const service = new AtlasService(repository);
  const workspace = await service.createWorkspace({ name: 'Audit Rollback' });
  const object = await service.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Before' });
  await assert.rejects(() => service.updateObject(workspace.id, object.id, { version: 1, title: 'After' }, 'usr_1'), /forced audit failure/);
  const persisted = await service.getObject(workspace.id, object.id);
  assert.equal(persisted.title, 'Before');
  assert.equal(persisted.version, 1);
  assert.equal((await service.listEvents(workspace.id, object.id)).filter((event) => event.type === 'object.updated').length, 0);
});
