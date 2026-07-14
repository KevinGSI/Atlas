import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { AtlasToolRegistry } from '../src/assistant.js';
import { DigitalTwinImpactConsumer } from '../src/canonical-events.js';

const clock=()=> '2026-07-14T16:00:00.000Z';

test('one canonical context joins every case surface plus explicitly linked firm records',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository,clock);const workspace=await service.createWorkspace({name:'Context Firm'});
  const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Morgan v. Lakeside'});
  const email=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'incoming_email',title:'Discovery deficiency email'});
  const document=await service.createObject(workspace.id,{parentObjectId:email.id,dimension:'document',type:'discovery_response',title:'Discovery Responses.pdf'});
  const task=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'task',title:'Prepare motion to compel'});
  const calendar=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'calendar_event',title:'Discovery hearing'});
  const accounting=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'invoice',title:'Litigation invoice'});
  const client=await service.createObject(workspace.id,{dimension:'client',type:'client',title:'Taylor Morgan'});
  await service.createRelationship(workspace.id,{fromObjectId:client.id,toObjectId:matter.id,type:'client_of'});
  const otherMatter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Unrelated case'});
  await service.createObject(workspace.id,{parentObjectId:otherMatter.id,dimension:'operation',type:'task',title:'Unrelated task'});
  const observation=await repository.createIntelligenceObservation({id:'ino_context',workspaceId:workspace.id,jobId:'inj_context',sourceObjectId:document.id,kind:'duty',data:{title:'Supplement discovery'},confidence:.94,sourceLocation:{page:4},provider:'test',status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:clock()});
  const action=await repository.createAiActionProposal({id:'aap_context',workspaceId:workspace.id,runId:null,intelligenceJobId:'inj_context',originType:'intelligence',proposedBy:'atlas',actionType:'create_document',input:{title:'Motion to Compel',matterId:matter.id,content:'Draft'},status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:clock(),decidedAt:null});
  await repository.createAwarenessItem({id:'awi_context',workspaceId:workspace.id,targetUserId:'usr_attorney',sourceJobId:'inj_context',sourceObjectId:email.id,category:'incoming_email',priority:'high',headline:'Discovery response requires action',summary:'Review proposed motion.',observationIds:[observation.id],actionProposalIds:[action.id],createdAt:clock()});
  const context=await service.getCanonicalContext(workspace.id,task.id,'usr_attorney');
  assert.equal(context.root.id,task.id);assert.equal(context.matter.id,matter.id);
  assert.deepEqual(new Set(context.objects.map(item=>item.id)),new Set([matter.id,email.id,document.id,task.id,calendar.id,accounting.id,client.id]));
  assert.equal(context.objects.some(item=>item.id===otherMatter.id),false);
  assert.equal(context.intelligence.observations[0].id,observation.id);assert.equal(context.intelligence.actions[0].id,action.id);assert.equal(context.intelligence.awareness[0].id,'awi_context');
  assert.equal(context.events.some(event=>event.parentObjectId===document.id),true);
  const toolContext=await new AtlasToolRegistry(service).execute('get_canonical_context',workspace.id,{objectId:email.id},{userId:'usr_attorney'});
  assert.equal(toolContext.data.matter.id,matter.id);assert.equal(toolContext.sources.some(source=>source.objectId===accounting.id),true);
  assert.equal(toolContext.data.intelligence.awareness[0].id,'awi_context');
});

test('every material case event automatically reanalyzes sibling case records without hand wiring',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository,clock);const workspace=await service.createWorkspace({name:'Always Aware Firm'});
  const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Case'});
  const email=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'incoming_email',title:'Incoming email'});
  const task=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'task',title:'Respond'});
  const document=await service.createObject(workspace.id,{parentObjectId:matter.id,dimension:'document',type:'notice',title:'Notice'});
  const consumer=new DigitalTwinImpactConsumer(repository,clock);const event={id:'cev_context',workspaceId:workspace.id,correlationId:'cev_context',affectedObjectIds:[email.id]};
  assert.deepEqual(await consumer.handle(event),{queued:3});
  const jobs=(await repository.listIntelligenceJobs(workspace.id)).filter(job=>job.eventId===event.id);
  assert.deepEqual(new Set(jobs.map(job=>job.objectId)),new Set([matter.id,task.id,document.id]));
  assert.ok(jobs.every(job=>new Set(job.payload.contextObjectIds).size===4));
  assert.deepEqual(await consumer.handle(event),{queued:0});
});
