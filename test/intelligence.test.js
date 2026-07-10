import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasIntelligenceRuntime, IntelligenceProviderRegistry, StructuredModelIntelligenceProvider, runIntelligenceWorker } from '../src/intelligence.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { IntelligenceProjectionService } from '../src/intelligence-projection.js';

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

test('normalized intelligence projects candidate twin observations and non-chat review actions', async () => {
  const { repository, service, workspace } = await fixture();
  await service.createObject(workspace.id, { dimension: 'document', type: 'incoming_pdf', title: 'Court notice' });
  const registry = new IntelligenceProviderRegistry().register('extractor', { capabilities() { return { structuredExtraction: true }; }, async analyze() { return {
    observations: [{ kind: 'deadline', data: { date: '2026-07-20', description: 'Response due' }, confidence: 0.94, sourceLocation: { page: 2 } }],
    actionProposals: [{ actionType: 'create_task', input: { title: 'Prepare response', matterId: null, dueDate: '2026-07-20' } }]
  }; } });
  const runtime = new AtlasIntelligenceRuntime(repository, registry, { providerName: 'extractor', projector: new IntelligenceProjectionService(() => '2026-07-10T12:01:00.000Z'), clock: () => '2026-07-10T12:01:00.000Z' });
  await runtime.processNext();
  const observations = await repository.listIntelligenceObservations(workspace.id, 'candidate');
  const proposals = await repository.listAiActionProposals(workspace.id, 'pending');
  assert.equal(observations[0].kind, 'deadline');
  assert.equal(observations[0].sourceLocation.page, 2);
  assert.equal(proposals[0].originType, 'intelligence');
  assert.equal(proposals[0].runId, null);
  assert.match(proposals[0].intelligenceJobId, /^inj_/);
  const inbox = await service.intelligenceReviewInbox(workspace.id);
  assert.deepEqual(inbox.counts, { observations: 1, actions: 1, failures: 0 });
  assert.equal(inbox.observations[0].kind, 'deadline');
  assert.equal(inbox.actions[0].originType, 'intelligence');
  const accepted=await service.decideIntelligenceObservation(workspace.id,observations[0].id,{decision:'accept'},'usr_reviewer');
  assert.equal(accepted.observation.status,'accepted');assert.equal(accepted.result.type,'deadline');
  const twin=await service.searchTwin(workspace.id,'response due');
  assert.equal(twin.observations[0].id,observations[0].id);assert.equal(twin.objects.some((item)=>item.id===accepted.result.id),true);
  await assert.rejects(()=>service.decideIntelligenceObservation(workspace.id,observations[0].id,{decision:'accept'},'usr_reviewer'),(error)=>error.code==='INTELLIGENCE_OBSERVATION_ALREADY_REVIEWED');
});

test('invalid provider observations roll back projection and job completion', async () => {
  const { repository, service, workspace } = await fixture();
  await service.createObject(workspace.id, { dimension: 'document', type: 'pdf', title: 'Bad result' });
  const registry = new IntelligenceProviderRegistry().register('invalid', { capabilities() { return {}; }, async analyze() { return { observations: [{ kind: 'invented', data: {}, confidence: 2 }] }; } });
  const runtime = new AtlasIntelligenceRuntime(repository, registry, { providerName: 'invalid', projector: new IntelligenceProjectionService(), maxAttempts: 1, clock: () => '2026-07-10T12:01:00.000Z' });
  await assert.rejects(() => runtime.processNext(), (error) => error.code === 'INTELLIGENCE_RESULT_INVALID');
  assert.equal((await repository.listIntelligenceObservations(workspace.id)).length, 0);
  assert.equal((await repository.listIntelligenceJobs(workspace.id))[0].status, 'failed');
});

test('capability routing selects providers by native event type',()=>{
  const registry=new IntelligenceProviderRegistry()
    .register('documents',{capabilities(){return {triggers:['attachment.received']};},async analyze(){return {};}})
    .register('communications',{capabilities(){return {triggers:['email.received']};},async analyze(){return {};}});
  assert.equal(registry.resolveFor('email.received').name,'communications');
  assert.equal(registry.resolveFor('attachment.received').name,'documents');
});

test('background worker drains queued intelligence until aborted',async()=>{
  let calls=0;const controller=new AbortController();const runtime={async processNext(){calls+=1;if(calls===2)controller.abort();return calls===1?{id:'job'}:null;}};
  await runIntelligenceWorker(runtime,{signal:controller.signal,pollMs:1});assert.equal(calls,2);
});

test('any interchangeable chat model can power normalized native intelligence',async()=>{
  const model={async complete(input){assert.equal(input.tools.length,0);return {text:JSON.stringify({observations:[{kind:'risk',data:{title:'Deadline risk'},confidence:.8}],actionProposals:[]})};}};
  const provider=new StructuredModelIntelligenceProvider(model);
  const result=await provider.analyze({event:{type:'email.received'},context:{workspaceId:'wsp_1'}});
  assert.equal(result.observations[0].kind,'risk');assert.equal(provider.capabilities().providerNeutralModel,true);
  await assert.rejects(()=>new StructuredModelIntelligenceProvider({async complete(){return {text:'not-json'};}}).analyze({event:{},context:{}}),(error)=>error.code==='INTELLIGENCE_RESULT_INVALID');
});
