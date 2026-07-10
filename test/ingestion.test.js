import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasIngestionService, AttachmentExtractionProvider, ContentExtractorRegistry, IngestionConnectorRegistry } from '../src/ingestion.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

async function fixture() {
  const repository=new InMemoryRepository(); const service=new AtlasService(repository,()=> '2026-07-10T12:00:00.000Z');
  const workspace=await service.createWorkspace({name:'Ingestion Firm'}); const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline'});
  return {repository,workspace,matter,ingestion:new AtlasIngestionService(repository,()=> '2026-07-10T13:00:00.000Z')};
}

test('incoming email and PDF attachment become canonical linked objects and intelligence work atomically', async()=>{
  const {repository,workspace,matter,ingestion}=await fixture();
  const result=await ingestion.ingestEmail(workspace.id,{connector:'test-mail',externalId:'msg-1',from:'counsel@example.com',to:['lawyer@example.com'],subject:'Discovery production',bodyText:'Attached production.',matterId:matter.id,attachments:[{filename:'production.pdf',storageRef:'blob://sha256/abc',sha256:'abc',mediaType:'application/pdf',size:1234}]},'usr_1');
  assert.equal(result.root.type,'incoming_email'); assert.equal(result.attachments[0].state.extractionStatus,'pending');
  const graph=await new AtlasService(repository).expandGraph(workspace.id,result.root.id);
  assert.equal(graph.nodes[0].id,result.attachments[0].id); assert.equal(graph.relationships[0].type,'has_attachment');
  assert.deepEqual((await repository.listIntelligenceJobs(workspace.id)).map((job)=>job.triggerType).slice(-2),['attachment.received','email.received']);
});

test('email ingestion is idempotent by workspace connector and external message ID',async()=>{
  const {workspace,ingestion}=await fixture(); const input={connector:'mail',externalId:'same',from:'a@example.com',to:['b@example.com'],subject:'One'};
  const first=await ingestion.ingestEmail(workspace.id,input); const second=await ingestion.ingestEmail(workspace.id,input);
  assert.equal(first.duplicate,false);assert.equal(second.duplicate,true);assert.equal(second.root.id,first.root.id);
});

test('phone call ingestion creates one canonical call and one native intelligence job',async()=>{
  const {repository,workspace,matter,ingestion}=await fixture();
  const input={connector:'telephony',externalId:'call-1',direction:'incoming',from:'+15551230000',to:'+15559870000',transcript:'Client asked for a callback about discovery.',durationSeconds:93,matterId:matter.id};
  const first=await ingestion.ingestPhoneCall(workspace.id,input,'usr_1'); const duplicate=await ingestion.ingestPhoneCall(workspace.id,input,'usr_1');
  assert.equal(first.root.type,'phone_call');assert.equal(first.root.state.transcript,input.transcript);assert.equal(first.ingestion.kind,'phone_call');assert.equal(duplicate.duplicate,true);assert.equal(duplicate.root.id,first.root.id);
  const jobs=await repository.listIntelligenceJobs(workspace.id);assert.equal(jobs.at(-1).triggerType,'phone_call.received');assert.equal(jobs.at(-1).payload.call.id,first.root.id);
});

test('standalone document ingestion catalogs metadata and queues extraction exactly once',async()=>{
  const {repository,workspace,matter,ingestion}=await fixture();
  const input={connector:'portal',externalId:'upload-1',filename:'interrogatories.pdf',storageRef:'blob://sha256/document',sha256:'document',mediaType:'application/pdf',size:2048,matterId:matter.id};
  const first=await ingestion.ingestDocument(workspace.id,input,'usr_1');const duplicate=await ingestion.ingestDocument(workspace.id,input,'usr_1');
  assert.equal(first.root.type,'uploaded_document');assert.equal(first.root.state.extractionStatus,'pending');assert.equal(first.ingestion.kind,'document');assert.equal(duplicate.duplicate,true);
  const jobs=await repository.listIntelligenceJobs(workspace.id);assert.equal(jobs.at(-1).triggerType,'attachment.received');assert.equal(jobs.at(-1).payload.document.id,first.root.id);
});

test('invalid call and document inputs leave no partial canonical records',async()=>{
  const {repository,workspace,ingestion}=await fixture();
  await assert.rejects(()=>ingestion.ingestPhoneCall(workspace.id,{connector:'phone',externalId:'bad-call',direction:'sideways'}),(error)=>error.code==='INGESTION_INVALID');
  await assert.rejects(()=>ingestion.ingestDocument(workspace.id,{connector:'portal',externalId:'bad-document',filename:'empty.pdf',storageRef:'blob://empty',sha256:'empty',mediaType:'application/pdf',size:-1}),(error)=>error.code==='INGESTION_INVALID');
  const objects=await repository.listObjects(workspace.id,{});assert.equal(objects.some((object)=>['phone_call','uploaded_document'].includes(object.type)),false);
});

test('connector and extractor registries enforce interchangeable adapter contracts',()=>{
  assert.throws(()=>new IngestionConnectorRegistry().register('bad',{}),(error)=>error.code==='INGESTION_CONNECTOR_INVALID');
  const connectors=new IngestionConnectorRegistry().register('mail',{capabilities(){return {attachments:true};},async pull(){return [];}});assert.ok(connectors.resolve('mail'));
  const extractors=new ContentExtractorRegistry().register('application/pdf',{capabilities(){return {ocrFallback:true};},async extract(){return {text:'PDF text'};}});assert.ok(extractors.resolve('application/pdf'));
});

test('invalid attachment metadata rolls back the entire ingestion',async()=>{
  const {repository,workspace,ingestion}=await fixture();
  await assert.rejects(()=>ingestion.ingestEmail(workspace.id,{connector:'mail',externalId:'bad',from:'a@example.com',to:['b@example.com'],attachments:[{filename:'bad.pdf'}]}),(error)=>error.code==='INGESTION_INVALID');
  assert.equal((await repository.listObjects(workspace.id,{})).filter((object)=>object.type==='incoming_email').length,0);
});

test('attachment extraction is a replaceable intelligence provider with blob and OCR boundaries',async()=>{
  const extractors=new ContentExtractorRegistry().register('application/pdf',{capabilities(){return {ocrFallback:true};},async extract({content}){assert.equal(content,'pdf-bytes');return {text:'Response due July 20',documentType:'court_notice',confidence:.91};}});
  const provider=new AttachmentExtractionProvider({async read(reference){assert.equal(reference,'blob://one');return 'pdf-bytes';}},extractors);
  const result=await provider.analyze({event:{document:{id:'obj_pdf',title:'notice.pdf',state:{storageRef:'blob://one',mediaType:'application/pdf'}},matterId:'obj_matter'},context:{workspaceId:'wsp_1'}});
  assert.deepEqual(provider.capabilities().triggers,['attachment.received']);
  assert.equal(result.observations[0].data.documentType,'court_notice');
  assert.equal(result.observations[1].data.description,'Response due July 20');
});
