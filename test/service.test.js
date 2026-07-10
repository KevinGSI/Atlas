import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

function fixture() {
  const clock = () => '2026-07-10T12:00:00.000Z';
  const service = new AtlasService(new InMemoryRepository(), clock);
  const workspace = service.createWorkspace({ name: 'Meredith Legal' });
  return { service, workspace };
}

test('creates and retrieves a workspace', () => {
  const { service, workspace } = fixture();
  assert.match(workspace.id, /^wsp_[a-f0-9]{32}$/);
  assert.deepEqual(service.getWorkspace(workspace.id), workspace);
});

test('creates a canonical matter and its immutable audit event', () => {
  const { service, workspace } = fixture();
  const matter = service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'State v. Atlas' });
  assert.equal(service.getObject(workspace.id, matter.id).version, 1);
  const events = service.listEvents(workspace.id, matter.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'object.created');
});

test('filters objects by dimension and type', () => {
  const { service, workspace } = fixture();
  service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Matter' });
  service.createObject(workspace.id, { dimension: 'evidence', type: 'video', title: 'Body camera' });
  assert.equal(service.listObjects(workspace.id, { dimension: 'evidence' }).length, 1);
  assert.equal(service.listObjects(workspace.id, { type: 'criminal' }).length, 1);
});

test('validates parent objects inside the workspace', () => {
  const { service, workspace } = fixture();
  assert.throws(
    () => service.createObject(workspace.id, { parentObjectId: 'obj_missing', dimension: 'evidence', type: 'video', title: 'Missing parent' }),
    (error) => error.code === 'OBJECT_NOT_FOUND'
  );
});

test('creates relationships and expands a graph', () => {
  const { service, workspace } = fixture();
  const matter = service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Matter' });
  const evidence = service.createObject(workspace.id, { dimension: 'evidence', type: 'video', title: 'Body camera' });
  service.createRelationship(workspace.id, { fromObjectId: evidence.id, toObjectId: matter.id, type: 'supports' });
  const graph = service.expandGraph(workspace.id, matter.id);
  assert.equal(graph.nodes[0].id, evidence.id);
  assert.equal(graph.relationships[0].type, 'supports');
});

test('rejects self and duplicate relationships', () => {
  const { service, workspace } = fixture();
  const object = service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Matter' });
  assert.throws(() => service.createRelationship(workspace.id, { fromObjectId: object.id, toObjectId: object.id, type: 'related' }), /cannot relate to itself/);
  const other = service.createObject(workspace.id, { dimension: 'person', type: 'witness', title: 'Witness' });
  service.createRelationship(workspace.id, { fromObjectId: object.id, toObjectId: other.id, type: 'involves' });
  assert.throws(() => service.createRelationship(workspace.id, { fromObjectId: object.id, toObjectId: other.id, type: 'involves' }), (error) => error.code === 'RELATIONSHIP_EXISTS');
});

test('validates timeline confidence', () => {
  const { service, workspace } = fixture();
  assert.throws(() => service.createEvent(workspace.id, { type: 'analysis.completed', actorId: 'ai', source: 'atlas', confidence: 1.2 }), /between 0 and 1/);
});

test('computes explainable matter health deductions', () => {
  const { service, workspace } = fixture();
  const incomplete = service.createObject(workspace.id, { dimension: 'matter', type: 'criminal', title: 'Incomplete' });
  assert.deepEqual(service.matterHealth(workspace.id, incomplete.id), {
    matterId: incomplete.id,
    score: 65,
    status: 'orange',
    reasons: [
      { code: 'MISSING_CLIENT', deduction: 15 },
      { code: 'MISSING_DEADLINE', deduction: 10 },
      { code: 'MISSING_OWNER', deduction: 10 }
    ]
  });
  const healthy = service.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Healthy', state: { clientId: 'obj_client', nextDeadline: '2026-08-01', ownerId: 'usr_owner' } });
  assert.equal(service.matterHealth(workspace.id, healthy.id).score, 100);
});
