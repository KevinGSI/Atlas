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
