import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { FormBankService } from '../src/form-bank.js';
import { AtlasFileService, InMemoryBlobStore } from '../src/file-storage.js';
import { createAtlasHandler } from '../src/http.js';
import { AtlasIngestionService } from '../src/ingestion.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

const now='2026-07-14T22:00:00.000Z';

async function fixture(options={}){
  const repository=new InMemoryRepository();
  const atlas=new AtlasService(repository,()=>now);
  const workspace=await atlas.createWorkspace({name:'Forms Firm'});
  const otherWorkspace=await atlas.createWorkspace({name:'Other Firm'});
  const files=new AtlasFileService(atlas,new AtlasIngestionService(repository,()=>now),new InMemoryBlobStore());
  const draftCalls=[];
  const draftProvider=Object.hasOwn(options,'draftProvider')?options.draftProvider:{async complete(input){draftCalls.push(input);return{text:JSON.stringify({body:'MOTION TO COMPEL\nPLAINTIFF: Jordan Reed\nDEFENDANT: Northline LLC\nPlaintiff requests an order compelling the overdue responses based only on the supplied canonical record. [ATTORNEY INPUT REQUIRED: supporting procedural history and requested relief]'}),provider:'fixture-private-ai',model:'fixture-drafter',usage:{inputTokens:20,outputTokens:15,totalTokens:35}};}};
  const formBank=new FormBankService(atlas,files,{draftProvider});
  return {repository,atlas,workspace,otherWorkspace,files,formBank,draftCalls};
}

const uploadInput=(overrides={})=>({
  title:'Motion to Compel Form',
  documentType:'motion',
  practiceArea:'Civil litigation',
  jurisdiction:'Test County Civil Division',
  description:'Approved firm structure for discovery motions.',
  formVersion:'2026.1',
  tags:['discovery','motion'],
  filename:'motion-to-compel.txt',
  mediaType:'text/plain',
  contentBase64:Buffer.from('MOTION TO COMPEL\n\n[BODY]').toString('base64'),
  ...overrides
});

test('Form Bank securely stores a firm-scoped canonical form and never exposes its storage reference',async()=>{
  const {repository,workspace,otherWorkspace,formBank}=await fixture();
  const uploaded=await formBank.upload(workspace.id,uploadInput(),'usr_attorney');
  assert.equal(uploaded.form.type,'form_bank_template');
  assert.equal(uploaded.form.parentObjectId,null);
  assert.deepEqual({formBank:uploaded.form.state.formBank,library:uploaded.form.state.library,scope:uploaded.form.state.scope,status:uploaded.form.state.status},{formBank:true,library:'form_bank',scope:'firm',status:'active'});
  assert.equal(uploaded.form.state.storageRef,undefined);
  assert.equal(uploaded.form.state.storageAvailable,true);
  assert.equal(uploaded.form.state.securityScan.status,'clean');
  assert.equal(uploaded.form.state.extractionStatus,'pending');
  const stored=await repository.getObject(workspace.id,uploaded.form.id);
  assert.match(stored.state.storageRef,new RegExp(`^atlas-blob://${workspace.id}/`));
  assert.deepEqual(stored.state.provenance,{kind:'form_bank_upload',connector:'atlas-upload'});
  assert.equal((await repository.listIntelligenceJobs(workspace.id)).some(item=>item.triggerType==='attachment.received'&&item.objectId===stored.id),true);
  const downloaded=await formBank.download(workspace.id,stored.id);
  assert.equal(downloaded.content.toString(),'MOTION TO COMPEL\n\n[BODY]');
  assert.equal(downloaded.filename,'motion-to-compel.txt');
  await assert.rejects(()=>formBank.get(otherWorkspace.id,stored.id),error=>error.code==='OBJECT_NOT_FOUND');
  await assert.rejects(()=>formBank.download(otherWorkspace.id,stored.id),error=>error.code==='OBJECT_NOT_FOUND');
});

test('Form Bank supports searchable metadata with optimistic update, audited archive, and restore',async()=>{
  const {repository,workspace,formBank}=await fixture();
  const uploaded=(await formBank.upload(workspace.id,uploadInput(),'usr_attorney')).form;
  const updated=(await formBank.update(workspace.id,uploaded.id,{version:uploaded.version,title:'Verified Discovery Motion',practiceArea:'Commercial litigation',tags:['verified','discovery']},'usr_admin')).form;
  assert.equal(updated.title,'Verified Discovery Motion');
  assert.deepEqual(updated.state.tags,['verified','discovery']);
  assert.equal((await formBank.list(workspace.id,{q:'verified',practiceArea:'Commercial litigation',tag:'discovery'})).count,1);
  await assert.rejects(()=>formBank.update(workspace.id,uploaded.id,{version:uploaded.version,title:'Stale'},'usr_admin'),error=>error.code==='VERSION_CONFLICT');
  const archived=(await formBank.archive(workspace.id,uploaded.id,{version:updated.version},'usr_admin')).form;
  assert.equal(archived.status,'archived');
  assert.equal((await formBank.list(workspace.id,{status:'active'})).count,0);
  assert.equal((await formBank.list(workspace.id,{status:'archived'})).count,1);
  assert.equal((await repository.listEvents(workspace.id,uploaded.id)).some(item=>item.type==='form_bank.template.archived'),true);
  assert.equal((await repository.listAudits(workspace.id,uploaded.id)).some(item=>item.action==='object.deleted'),true);
  const restored=(await formBank.restore(workspace.id,uploaded.id,{version:archived.version},'usr_admin')).form;
  assert.equal(restored.status,'active');
  assert.equal((await formBank.list(workspace.id,{status:'active'})).count,1);
  assert.equal((await repository.listEvents(workspace.id,uploaded.id)).some(item=>item.type==='form_bank.template.restored'),true);
});

async function catalogForm(repository,workspace,form){
  const stored=await repository.getObject(workspace.id,form.id);
  const analyzed=await repository.updateObject(workspace.id,stored.id,stored.version,{state:{...stored.state,extractionStatus:'completed',documentAnalysis:{documentType:'motion',summary:'Reusable motion structure.',confidence:.95,status:'cataloged',provider:'fixture',analyzedAt:now,sourceJobId:'inj_analysis'}}},now);
  await repository.createDocumentKnowledgeChunk({id:'dkc_form_bank',workspaceId:workspace.id,sourceObjectId:form.id,ordinal:0,content:'OLD SAMPLE: Prior Client demanded $999,999 on January 1, 1999.\nMOTION TO COMPEL\nPLAINTIFF: [PLAINTIFF]\nDEFENDANT: [DEFENDANT]\n[BODY]',sourceLocation:{page:1},provider:'fixture',model:'fixture-model',dimensions:2,embedding:[1,0],createdAt:now});
  return analyzed;
}

test('case drafting uses the interchangeable private AI provider with analyzed Form Bank text and canonical case data but creates only a review proposal',async()=>{
  const {repository,atlas,workspace,formBank,draftCalls}=await fixture();
  const form=(await formBank.upload(workspace.id,uploadInput(),'usr_attorney')).form;
  const analyzed=await catalogForm(repository,workspace,form);
  const matter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-42',courtName:'Superior Court of Test County',courtJurisdiction:'Test County Civil Division',parties:[{name:'Jordan Reed',role:'plaintiff'},{name:'Northline LLC',role:'defendant'}]}});
  await atlas.createObject(workspace.id,{dimension:'operation',type:'attorney_profile',title:'Attorney profile — Casey Counsel',state:{userId:'usr_attorney',name:'Casey Counsel',profileScope:'professional'}});
  await atlas.createObject(workspace.id,{parentObjectId:matter.id,dimension:'client',type:'client',title:'Jordan Reed',state:{matterId:matter.id,contactType:'client'}});
  const result=await formBank.proposeCaseDraft(workspace.id,matter.id,form.id,{title:'Motion to Compel Discovery',documentType:'motion',instructions:'Plaintiff requests an order compelling the overdue responses. [ATTORNEY REVIEW REQUIRED]'},'usr_attorney');
  assert.equal(result.proposal.status,'pending');
  assert.equal(result.proposal.actionType,'create_document');
  assert.equal(result.proposal.input.templateProvenance.templateId,form.id);
  assert.equal(result.proposal.input.templateProvenance.sourceVersion,analyzed.version);
  assert.match(result.proposal.input.content,/DRAFT FOR ATTORNEY REVIEW — NOT FILED/);
  assert.match(result.proposal.input.content,/Reed v\. Northline/);
  assert.match(result.proposal.input.content,/Case No\. 2026-CV-42/);
  assert.match(result.proposal.input.content,/PLAINTIFF: Jordan Reed/);
  assert.match(result.proposal.input.content,/DEFENDANT: Northline LLC/);
  assert.match(result.proposal.input.content,/supporting procedural history and requested relief/);
  assert.doesNotMatch(result.proposal.input.content,/Prior Client|999,999|January 1, 1999/);
  assert.doesNotMatch(result.proposal.input.content,/Plaintiff requests an order compelling the overdue responses\. \[ATTORNEY REVIEW REQUIRED\]/);
  assert.equal(draftCalls.length,1);
  assert.match(draftCalls[0].messages[0].content,/Return strict JSON only/);
  assert.match(draftCalls[0].messages[0].content,/professional profile.*never the client/);
  assert.match(draftCalls[0].messages[1].content,/MOTION TO COMPEL/);
  assert.match(draftCalls[0].messages[1].content,/Reed v\. Northline/);
  const draftingPayload=JSON.parse(draftCalls[0].messages[1].content);
  assert.equal(draftingPayload.canonicalCase.clientName,'Jordan Reed');
  assert.equal(draftingPayload.canonicalContext.objects.some(object=>object.type==='attorney_profile'),false);
  assert.doesNotMatch(draftCalls[0].messages[1].content,/storageRef|contentBase64|password|refreshToken/);
  assert.deepEqual(result.proposal.input.generationProvenance,{provider:'fixture-private-ai',model:'fixture-drafter',draftedAt:now,usage:{inputTokens:20,outputTokens:15,totalTokens:35},sourceBoundary:'authorized_private_firm_context',humanReviewRequired:true});
  assert.equal((await atlas.listObjects(workspace.id,{dimension:'document'})).filter(item=>item.parentObjectId===matter.id).length,0);
  assert.equal(result.awareness.actionProposalIds.includes(result.proposal.id),true);
  const approved=await atlas.decideAiActionProposal(workspace.id,result.proposal.id,{version:1,decision:'approve'},'usr_attorney');
  assert.deepEqual({parentObjectId:approved.result.parentObjectId,status:approved.result.state.status,filed:approved.result.state.filed,reviewRequired:approved.result.state.reviewRequired},{parentObjectId:matter.id,status:'draft',filed:false,reviewRequired:true});
  assert.equal(approved.result.state.generationProvenance.provider,'fixture-private-ai');
  assert.equal((await repository.listRelationships(workspace.id)).some(item=>item.fromObjectId===approved.result.id&&item.toObjectId===form.id&&item.type==='derived_from_form_template'),true);
});

test('Form Bank drafting fails honestly without an interchangeable AI provider and creates no proposal',async()=>{
  const {repository,atlas,workspace,formBank}=await fixture({draftProvider:null});
  const form=(await formBank.upload(workspace.id,uploadInput(),'usr_attorney')).form;
  await catalogForm(repository,workspace,form);
  const matter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-42',courtName:'Superior Court',courtJurisdiction:'Test County Civil Division',parties:[{name:'Jordan Reed',role:'plaintiff'},{name:'Northline LLC',role:'defendant'}]}});
  await assert.rejects(()=>formBank.proposeCaseDraft(workspace.id,matter.id,form.id,{documentType:'motion',instructions:'Prepare the source-supported motion.'},'usr_attorney'),error=>error.code==='AI_NOT_CONFIGURED');
  assert.equal((await repository.listAiActionProposals(workspace.id)).length,0);
});

test('approval refuses a stale Form Bank source version and leaves the proposal pending',async()=>{
  const {repository,atlas,workspace,formBank}=await fixture();
  const form=(await formBank.upload(workspace.id,uploadInput(),'usr_attorney')).form;
  const analyzed=await catalogForm(repository,workspace,form);
  const matter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-42',courtName:'Superior Court',courtJurisdiction:'Test County Civil Division',parties:[{name:'Jordan Reed',role:'plaintiff'},{name:'Northline LLC',role:'defendant'}]}});
  const result=await formBank.proposeCaseDraft(workspace.id,matter.id,form.id,{documentType:'motion',instructions:'Prepare the source-supported motion.'},'usr_attorney');
  await formBank.update(workspace.id,form.id,{version:analyzed.version,description:'A materially revised source form.'},'usr_admin');
  await assert.rejects(()=>atlas.decideAiActionProposal(workspace.id,result.proposal.id,{version:1,decision:'approve'},'usr_attorney'),error=>error.code==='LEGAL_FORM_TEMPLATE_VERSION_CONFLICT');
  assert.equal((await repository.getAiActionProposal(workspace.id,result.proposal.id)).status,'pending');
  assert.equal((await atlas.listObjects(workspace.id,{dimension:'document'})).filter(item=>item.parentObjectId===matter.id).length,0);
});

async function json(handler,url,options={}){
  const request=Readable.from(options.body?[Buffer.from(options.body)]:[]);request.method=options.method??'GET';request.url=url;request.headers=options.headers??{};
  return new Promise((resolve,reject)=>{const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body:JSON.parse(Buffer.from(body).toString())});}};Promise.resolve(handler(request,response)).catch(reject);});
}

test('Form Bank HTTP routes enforce read and write permissions and bind case drafts to both IDs',async()=>{
  const calls=[];const permissions=[];
  const formBank={
    async list(workspaceId,input){calls.push(['list',workspaceId,input]);return{forms:[],count:0};},
    async upload(workspaceId,input,userId){calls.push(['upload',workspaceId,input,userId]);return{form:{id:'obj_form'}};},
    async proposeCaseDraft(workspaceId,matterId,formId,input,userId){calls.push(['draft',workspaceId,matterId,formId,input,userId]);return{proposal:{id:'aap_draft'}};}
  };
  const identity={async authenticate(){return{id:'usr_attorney'};},async authorize(workspaceId,userId,permission){permissions.push([workspaceId,userId,permission]);}};
  const handler=createAtlasHandler(new AtlasService(new InMemoryRepository()),{identity,formBank,ready:async()=>true,config:{maxBodyBytes:1_048_576,documentMaxBytes:25_000_000,corsOrigins:[]}});
  const headers={authorization:'Bearer test','content-type':'application/json'};
  assert.equal((await json(handler,'/v1/workspaces/wsp_1/form-bank?q=motion',{headers})).status,200);
  assert.equal((await json(handler,'/v1/workspaces/wsp_1/form-bank',{method:'POST',headers,body:JSON.stringify({title:'Form'})})).status,201);
  assert.equal((await json(handler,'/v1/workspaces/wsp_1/matters/obj_case/form-bank/obj_form/drafts',{method:'POST',headers,body:JSON.stringify({instructions:'Draft it'})})).status,201);
  assert.deepEqual(permissions.map(item=>item[2]),['workspace:read','workspace:write','workspace:write']);
  assert.deepEqual(calls.at(-1),['draft','wsp_1','obj_case','obj_form',{instructions:'Draft it'},'usr_attorney']);
});
