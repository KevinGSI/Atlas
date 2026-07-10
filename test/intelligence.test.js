import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasIntelligenceRuntime, IntelligenceProviderRegistry } from '../src/intelligence.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

async function fixture() {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository, () => '2026-07-10T12:00:00.000Z');
  const workspace = await service.createWorkspace({ name: 'Native Intelligence Firm' });
  return { repository, service, workspace };
}

test('ordinary platform activity queues native intelligence work without using chat', async () => {
  const { repository, service, workspace } = await fixture();
  const object = await service.createObject(workspace.id, { dimension: 'document', type: 'incoming_pdf', title: 'Discovery production' });
  await service.updateObject(workspace.id, object.id, { version: 1, state: { cataloged: true } }, 'usr_1');
  const jobs = await repository.listIntelligenceJobs(workspace.id);
  assert.deepEqual(jobs.map((job) => job.triggerType), ['object.created', 'object.updated']);
  assert.ok(jobs.every((job) => job.status === 'pending' && job.objectId === object.id));
});

test('provider-neutral intelligence runtime analyzes queued events and records provenance', async () => {
  const { repository, service, workspace } = await fixture();
  await service.createObject(workspace.id, { dimension: 'matter', type: 'civil', title: 'Reed v. Northline' });
  const registry = new IntelligenceProviderRegistry().register('test-engine', {
    capabilities() { return { documentUnderstanding: true, entityResolution: true }; },
    async analyze(input) { return { classification: input.event.object.type, recommendations: ['review'] }; }
  });
  const runtime = new AtlasIntelligenceRuntime(repository, registry, { providerName: 'test-engine', clock: () => '2026-07-10T12:01:00.000Z' });
  const completed = await runtime.processNext();
  assert.equal(completed.status, 'completed');
  assert.equal(completed.provider, 'test-engine');
  assert.deepEqual(completed.result, { classification: 'civil', recommendations: ['review'] });
});

test('intelligence failures retry to a bounded terminal state', async () => {
  const { repository, service, workspace } = await fixture();
  await service.createObject(workspace.id, { dimension: 'evidence', type: 'pdf', title: 'Attachment' });
  const registry = new IntelligenceProviderRegistry().register('failing', { capabilities() { return {}; }, async analyze() { throw new Error('provider failed'); } });
  const runtime = new AtlasIntelligenceRuntime(repository, registry, { providerName: 'failing', maxAttempts: 2, clock: () => '2026-07-10T12:01:00.000Z' });
  await assert.rejects(() => runtime.processNext(), /provider failed/);
  assert.equal((await repository.listIntelligenceJobs(workspace.id))[0].status, 'pending');
  await assert.rejects(() => runtime.processNext(), /provider failed/);
  const failed = (await repository.listIntelligenceJobs(workspace.id))[0];
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 2);
  assert.equal(failed.errorCode, 'INTELLIGENCE_ANALYSIS_FAILED');
});

test('intelligence provider registry rejects invalid and duplicate adapters', () => {
  const registry = new IntelligenceProviderRegistry();
  assert.throws(() => registry.register('bad', {}), (error) => error.code === 'INTELLIGENCE_PROVIDER_INVALID');
  registry.register('engine', { capabilities() { return {}; }, async analyze() { return {}; } });
  assert.throws(() => registry.register('engine', { capabilities() { return {}; }, async analyze() { return {}; } }), (error) => error.code === 'INTELLIGENCE_PROVIDER_EXISTS');
});
