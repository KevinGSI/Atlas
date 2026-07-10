import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { AtlasIntelligenceRuntime, IntelligenceProviderRegistry } from '../src/intelligence.js';
import { IntelligenceProjectionService } from '../src/intelligence-projection.js';
import { SituationalPlaybookEngine, SituationalSweepService } from '../src/situational-awareness.js';

test('missed discovery deadlines autonomously prepare review work and While You Were Gone awareness',async()=>{
  const repository=new InMemoryRepository();const clock=()=> '2026-07-10T12:00:00.000Z';const service=new AtlasService(repository,clock);const workspace=await service.createWorkspace({name:'Aware Firm'});const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline'});await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'deadline',title:'Discovery responses due',state:{date:'2026-07-01T00:00:00.000Z',deadlineType:'discovery',status:'open'}});
  for(const job of await repository.listIntelligenceJobs(workspace.id))await repository.completeIntelligenceJob(job.id,{},'setup',clock());
  const sweep=new SituationalSweepService(repository,clock);assert.equal((await sweep.run()).queued,1);assert.equal((await sweep.run()).queued,0);
  const provider={capabilities(){return {triggers:['deadline.missed']};},async analyze(){return {observations:[],actionProposals:[]};}};const registry=new IntelligenceProviderRegistry().register('awareness',provider);const runtime=new AtlasIntelligenceRuntime(repository,registry,{providerName:'awareness',projector:new IntelligenceProjectionService(clock),playbooks:new SituationalPlaybookEngine(),clock});await runtime.processNext();
  const home=await service.whileYouWereGone(workspace.id,'usr_attorney');const item=home[0];assert.equal(item.category,'missed_deadline');assert.equal(item.priority,'urgent');assert.deepEqual(item.actions.map((action)=>action.actionType).sort(),['create_document','create_task']);assert.match(item.actions.find((action)=>action.actionType==='create_document').input.content,/DRAFT FOR ATTORNEY REVIEW/);assert.equal(item.reviewStatus,'unseen');await service.updateAwarenessStatus(workspace.id,item.id,'usr_attorney','reviewed');assert.equal((await service.whileYouWereGone(workspace.id,'usr_attorney'))[0].reviewStatus,'reviewed');
});

test('phone calls and document/email events retain distinct situational categories',async()=>{const repository=new InMemoryRepository();const service=new AtlasService(repository);const workspace=await service.createWorkspace({name:'Events'});await service.createEvent(workspace.id,{type:'phone_call.received',actorId:'usr_1',source:'phone',data:{transcript:'Client requested a callback'}});const jobs=await repository.listIntelligenceJobs(workspace.id);assert.equal(jobs[0].triggerType,'phone_call.received');const engine=new SituationalPlaybookEngine();assert.equal(engine.apply(jobs[0],{observations:[],actionProposals:[]}).awareness.category,'phone_call');assert.equal(engine.apply({...jobs[0],triggerType:'attachment.received'},{observations:[],actionProposals:[]}).awareness.category,'document_upload');assert.equal(engine.apply({...jobs[0],triggerType:'email.received'},{observations:[],actionProposals:[]}).awareness.category,'incoming_email');});

test('While You Were Gone suppresses background noise that needs no review',()=>{const output=new SituationalPlaybookEngine().apply({triggerType:'object.updated',payload:{}},{observations:[],actionProposals:[]});assert.equal(output.awareness,undefined);});
