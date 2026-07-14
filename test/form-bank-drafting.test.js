import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasToolRegistry } from '../src/assistant.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { authorizedTemplateText, buildLegalDocumentDraft, selectLegalFormTemplate } from '../src/legal-documents.js';

const now='2026-07-14T21:00:00.000Z';

async function fixture(){
  const repository=new InMemoryRepository();
  const service=new AtlasService(repository,()=>now);
  const workspace=await service.createWorkspace({name:'Form Bank Firm'});
  const otherWorkspace=await service.createWorkspace({name:'Other Firm'});
  const matter=await service.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-42',courtName:'Superior Court of Test County',courtJurisdiction:'Civil Division',judgeName:'Hon. Casey Example',parties:[{name:'Jordan Reed',role:'plaintiff'},{name:'Northline LLC',role:'defendant'}]}});
  return {repository,service,workspace,otherWorkspace,matter};
}

async function form(service,workspace,input={}){
  return service.createObject(workspace.id,{dimension:'document',type:'form_bank_template',title:input.title??'Firm Motion Form',state:{formBank:true,scope:'firm',library:'form_bank',status:input.status??'active',documentType:input.documentType??'motion',practiceArea:input.practiceArea??'civil',jurisdiction:Object.hasOwn(input,'jurisdiction')?input.jurisdiction:'Civil Division',tags:input.tags??['motion'],formVersion:input.formVersion??'3.0',storageRef:`atlas-blob://${workspace.id}/form`,sha256:'abc123',mediaType:'application/pdf',size:100,securityScan:{status:'clean'},uploadedAt:now,extractionStatus:input.extractionStatus??'completed',documentAnalysis:{documentType:input.documentType??'motion',status:input.analysisStatus??'cataloged',confidence:.96,provider:'fixture',analyzedAt:now,sourceJobId:'inj_form'},provenance:{kind:'form_bank_upload',connector:'atlas-upload'}}});
}

async function chunk(repository,workspace,template,text,id='dkc_form',ordinal=0){
  return repository.createDocumentKnowledgeChunk({id,workspaceId:workspace.id,sourceObjectId:template.id,ordinal,content:text,sourceLocation:{page:ordinal+1},provider:'fixture',model:'form-extraction',dimensions:2,embedding:[1,0],createdAt:now});
}

test('Form Bank selection uses only active analyzed compatible firm forms and prefers canonical jurisdiction',async()=>{
  const {service,workspace,matter}=await fixture();
  const generic=await form(service,workspace,{title:'Generic Motion',jurisdiction:null});
  const exact=await form(service,workspace,{title:'Civil Division Motion'});
  const archived=await form(service,workspace,{title:'Archived Motion',status:'archived'});
  const pending=await form(service,workspace,{title:'Pending Motion',extractionStatus:'pending'});
  const review=await form(service,workspace,{title:'Low-confidence analyzed Motion',analysisStatus:'needs_review'});
  assert.equal(selectLegalFormTemplate(matter,[generic,exact,archived,pending,review],{documentType:'motion'}).id,exact.id);
  assert.equal(selectLegalFormTemplate(matter,[generic,exact],{documentType:'motion',templateId:generic.id}).id,generic.id);
  assert.equal(selectLegalFormTemplate(matter,[review],{documentType:'motion',templateId:review.id}).id,review.id);
  assert.throws(()=>selectLegalFormTemplate(matter,[generic],{documentType:'complaint',templateId:generic.id}),error=>error.code==='LEGAL_FORM_TEMPLATE_TYPE_MISMATCH');
});

test('analyzed Form Bank source text is decrypted from only the selected template with chunk provenance',async()=>{
  const cipher={decrypt:(value,context)=>value.replace(`sealed:${context}:`,'')};
  const result=authorizedTemplateText([
    {id:'one',sourceObjectId:'obj_form',ordinal:0,content:'sealed:document-chunk:one:content:MOTION',sourceLocation:{page:1},provider:'fixture',model:'form-v1',createdAt:now},
    {id:'two',sourceObjectId:'obj_form',ordinal:1,content:'sealed:document-chunk:two:content:[BODY]',sourceLocation:{page:2},provider:'fixture',model:'form-v1',createdAt:now},
    {id:'secret',sourceObjectId:'obj_other',ordinal:0,content:'Other firm secret',sourceLocation:{page:1},provider:'fixture',model:'form-v1',createdAt:now}
  ],'obj_form',cipher);
  assert.equal(result.text,'MOTION\n\n[BODY]');
  assert.deepEqual(result.chunkIds,['one','two']);
  assert.equal(result.text.includes('secret'),false);
});

test('legal drafting fills canonical fields into analyzed firm form structure without inventing missing data',async()=>{
  const {service,workspace,matter}=await fixture();
  const template=await form(service,workspace);
  const source={text:'OLD SAMPLE CAPTION\nMOTION\nMOVANT: [PLAINTIFF]\nRESPONDENT: [DEFENDANT]\nRELIEF REQUESTED\n[BODY]',chunkIds:['dkc_one'],sourceLocations:[{page:1}],provider:'fixture',model:'form-extraction'};
  const draft=buildLegalDocumentDraft(matter,{documentType:'motion',title:'Motion to Compel',body:'The movant requests only source-supported relief.'},{template,templateText:source.text,templateChunks:source,renderTemplateText:true});
  assert.match(draft.content,/DRAFT FOR ATTORNEY REVIEW — NOT FILED/);
  assert.match(draft.content,/IN THE SUPERIOR COURT OF TEST COUNTY/);
  assert.match(draft.content,/Case No\. 2026-CV-42/);
  assert.match(draft.content,/MOVANT: Jordan Reed/);
  assert.match(draft.content,/RESPONDENT: Northline LLC/);
  assert.match(draft.content,/The movant requests only source-supported relief\./);
  assert.doesNotMatch(draft.content,/OLD SAMPLE CAPTION/);
  assert.equal(draft.templateProvenance.templateId,template.id);
  assert.deepEqual(draft.templateProvenance.sourceChunkIds,['dkc_one']);
  assert.deepEqual({reviewRequired:draft.reviewRequired,filed:draft.filed},{reviewRequired:true,filed:false});
});

test('case-linked client identity overrides a legacy attorney name and professional profiles never become parties',async()=>{
  const {service,workspace,matter}=await fixture();
  const stale=await service.updateObject(workspace.id,matter.id,{version:matter.version,state:{...matter.state,clientName:'Jordan Attorney',parties:[...matter.state.parties,{name:'Jordan Attorney',role:'client'}]}},'usr_attorney');
  const attorney=await service.createObject(workspace.id,{dimension:'operation',type:'attorney_profile',title:'Attorney profile — Jordan Attorney',state:{userId:'usr_attorney',name:'Jordan Attorney',profileScope:'professional'}});
  const client=await service.createObject(workspace.id,{parentObjectId:stale.id,dimension:'client',type:'client',title:'Taylor Client',state:{matterId:stale.id,contactType:'client'}});
  const template=await form(service,workspace,{documentType:'pleading'});
  const source={text:'PLEADING\nCLIENT: [CLIENT]\nPARTIES: [PARTIES]\n[BODY]',chunkIds:['dkc_roles'],sourceLocations:[{page:1}],provider:'fixture',model:'form-extraction'};
  const draft=buildLegalDocumentDraft(stale,{documentType:'pleading',title:'Case Filing',body:'Source-supported filing body.'},{template,templateText:source.text,templateChunks:source,renderTemplateText:true,canonicalObjects:[stale,attorney,client]});
  assert.equal(draft.templateData.clientName,'Taylor Client');
  assert.equal(draft.templateData.parties.some(party=>party.name==='Jordan Attorney'&&party.role==='client'),false);
  assert.match(draft.content,/CLIENT: Taylor Client/);
  assert.doesNotMatch(draft.content,/CLIENT: Jordan Attorney/);
});

test('an attorney profile collision leaves client blank instead of relabeling the attorney as the client',async()=>{
  const {service,workspace,matter}=await fixture();
  const stale=await service.updateObject(workspace.id,matter.id,{version:matter.version,state:{...matter.state,clientName:'Jordan Attorney',parties:[...matter.state.parties,{name:'Jordan Attorney',role:'client'}]}},'usr_attorney');
  const attorney=await service.createObject(workspace.id,{dimension:'operation',type:'attorney_profile',title:'Attorney profile — Jordan Attorney',state:{userId:'usr_attorney',name:'Jordan Attorney',profileScope:'professional'}});
  const canonicalDraft=buildLegalDocumentDraft(stale,{documentType:'pleading',body:'Source-supported filing body.'},{canonicalObjects:[stale,attorney]});
  assert.equal(canonicalDraft.templateData.clientName,null);
  assert.equal(canonicalDraft.templateData.parties.some(party=>party.name==='Jordan Attorney'&&party.role==='client'),false);
});

test('assistant form retrieval and drafting are firm-isolated and preserve source provenance',async()=>{
  const {repository,service,workspace,otherWorkspace,matter}=await fixture();
  const selected=await form(service,workspace,{title:'Firm Complaint Form',documentType:'complaint'});
  const secret=await form(service,otherWorkspace,{title:'Other Firm Complaint Form',documentType:'complaint'});
  await chunk(repository,workspace,selected,'COMPLAINT\nPARTIES: [PARTIES]\nFACTUAL ALLEGATIONS\n[BODY]','dkc_selected');
  await chunk(repository,otherWorkspace,secret,'OTHER FIRM CONFIDENTIAL TEXT','dkc_secret');
  const tools=new AtlasToolRegistry(service);
  const retrieved=await tools.execute('get_form_bank_template',workspace.id,{matterId:matter.id,documentType:'complaint',templateId:selected.id});
  assert.equal(retrieved.data.template.id,selected.id);
  assert.match(retrieved.data.extractedText,/FACTUAL ALLEGATIONS/);
  assert.equal(JSON.stringify(retrieved.data).includes('OTHER FIRM'),false);
  await assert.rejects(()=>tools.execute('get_form_bank_template',workspace.id,{matterId:matter.id,documentType:'complaint',templateId:secret.id}),error=>error.code==='LEGAL_FORM_TEMPLATE_NOT_AVAILABLE');
  const proposed=await tools.execute('propose_create_legal_document',workspace.id,{matterId:matter.id,documentType:'complaint',templateId:selected.id,title:'Verified Complaint',body:'Plaintiff alleges only the facts supported by the canonical case record.'});
  assert.equal(proposed.actionProposal.input.templateProvenance.templateId,selected.id);
  assert.deepEqual(proposed.actionProposal.input.templateProvenance.sourceChunkIds,['dkc_selected']);
  assert.equal(proposed.sources.some(item=>item.objectId===selected.id&&item.sourceType==='form_bank_template'),true);
  assert.match(proposed.actionProposal.input.content,/Plaintiff alleges only the facts supported by the canonical case record/);
  assert.doesNotMatch(proposed.actionProposal.input.content,/FACTUAL ALLEGATIONS/);
});

test('a form-required canonical party field blocks drafting instead of being fabricated',async()=>{
  const {service,workspace,matter}=await fixture();
  const template=await form(service,workspace,{documentType:'complaint'});
  const incomplete=await service.updateObject(workspace.id,matter.id,{version:matter.version,state:{...matter.state,parties:[{name:'Jordan Reed',role:'plaintiff'}]}},'usr_attorney');
  assert.throws(()=>buildLegalDocumentDraft(incomplete,{documentType:'complaint',body:'Source-supported allegations.'},{template,templateText:'COMPLAINT\nDEFENDANT: [DEFENDANT]\n[BODY]',templateChunks:{chunkIds:['one']},renderTemplateText:true}),error=>error.code==='LEGAL_DOCUMENT_CONTEXT_INCOMPLETE'&&error.details.missing.includes('defendantName'));
});

test('approved form-grounded drafts remain unfiled and retain a canonical relationship to the source form',async()=>{
  const {repository,service,workspace,matter}=await fixture();
  const template=await form(service,workspace);
  await chunk(repository,workspace,template,'MOTION\n[BODY]');
  const tools=new AtlasToolRegistry(service);
  const proposed=await tools.execute('propose_create_legal_document',workspace.id,{matterId:matter.id,documentType:'motion',templateId:template.id,body:'Source-supported motion content.'});
  const proposal=await repository.createAiActionProposal({id:'aap_form_draft',workspaceId:workspace.id,runId:null,intelligenceJobId:null,originType:'assistant',proposedBy:'usr_attorney',actionType:'create_document',input:proposed.actionProposal.input,status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:now,decidedAt:null});
  const approved=await service.decideAiActionProposal(workspace.id,proposal.id,{version:1,decision:'approve'},'usr_attorney');
  assert.deepEqual({status:approved.result.state.status,filed:approved.result.state.filed,reviewRequired:approved.result.state.reviewRequired},{status:'draft',filed:false,reviewRequired:true});
  assert.equal(approved.result.state.templateProvenance.templateId,template.id);
  const relationship=(await repository.listRelationships(workspace.id)).find(item=>item.fromObjectId===approved.result.id&&item.toObjectId===template.id);
  assert.equal(relationship?.type,'derived_from_form_template');
  const event=(await repository.listEvents(workspace.id,approved.result.id)).find(item=>item.type==='document.draft_created_from_form');
  assert.equal(event.relatedObjectIds.includes(template.id),true);
});
