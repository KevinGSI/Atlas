import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { SmsAssistantService } from '../src/sms-assistant.js';
import { CaseCommunicationsService } from '../src/case-communications.js';

const now='2026-07-14T16:00:00.000Z';

async function fixture(){
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,()=>now);const workspace=await atlas.createWorkspace({name:'Case Communications Firm'});
  const matter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Morgan v. Lakeside',state:{caseNumber:'2026-CV-101'}});
  const client=await atlas.createObject(workspace.id,{parentObjectId:matter.id,dimension:'client',type:'client',title:'Taylor Morgan',state:{matterId:matter.id,email:'Taylor.Morgan@example.test',phone:'(555) 010-2026'}});
  const sent=[];const messagingProvider={describe(){return {provider:'fake-sms'};},async sendMessage(input){sent.push(input);return {id:'sent',status:'queued'};}};
  const sms=new SmsAssistantService(atlas,{messagingProvider,clock:()=>now});
  const modelCalls=[];const model={async complete(input){modelCalls.push(input);return {text:JSON.stringify({subject:'A case update',body:'I am writing with an update for your review.'})};}};
  const service=new CaseCommunicationsService(atlas,{model,sms,clock:()=>now});
  return {repository,atlas,workspace,matter,client,sms,modelCalls,sent,service};
}

async function addCaseContact(atlas,workspaceId,matter,{title,type,role,email=null,phone=null}){
  return atlas.createObject(workspaceId,{parentObjectId:matter.id,dimension:'person',type,title,state:{matterId:matter.id,role,...(email?{email}:{}),...(phone?{phone}:{})}});
}

test('status resolves one case-linked canonical client and reports safe capabilities',async()=>{
  const {workspace,matter,client,service}=await fixture();const result=await service.status(workspace.id,matter.id);
  assert.equal(result.client.id,client.id);assert.deepEqual(result.contact,{email:'taylor.morgan@example.test',phone:'5550102026'});
  assert.deepEqual(result.capabilities.call,{available:true,mode:'device_handoff',providerInvoked:false});
  assert.equal(result.capabilities.text.available,true);assert.equal(result.capabilities.email.draftOnly,true);assert.equal(result.capabilities.meeting.createsCalendarEvent,false);
});

test('status offers every supported case-contact role with channel-specific availability',async()=>{
  const {atlas,workspace,matter,client,service}=await fixture();
  const opposing=await addCaseContact(atlas,workspace.id,matter,{title:'Avery Counsel',type:'opposing_counsel',role:'opposing_counsel',email:'avery@opposing.test'});
  const judicial=await addCaseContact(atlas,workspace.id,matter,{title:'Jordan Chambers',type:'judicial_assistant',role:'judicial_assistant',email:'chambers@court.test',phone:'+15550103030'});
  const expert=await addCaseContact(atlas,workspace.id,matter,{title:'Dr. Riley Expert',type:'expert_witness',role:'expert_witness',phone:'+15550104040'});
  const other=await addCaseContact(atlas,workspace.id,matter,{title:'Case Mediator',type:'contact',role:'other_contact',email:'mediator@example.test'});
  const result=await service.status(workspace.id,matter.id);
  assert.deepEqual(new Set(result.contacts.map(contact=>contact.role)),new Set(['client','opposing_counsel','judicial_assistant','expert_witness','other_contact']));
  assert.deepEqual(result.contacts.map(contact=>contact.id),[client.id,opposing.id,judicial.id,expert.id,other.id]);
  const byId=new Map(result.contacts.map(contact=>[contact.id,contact]));
  assert.deepEqual(byId.get(opposing.id).capabilities,{call:{available:false,mode:'device_handoff',providerInvoked:false},text:{available:false,draftOnly:true,providerConfigured:true},email:{available:true,draftOnly:true},meeting:{available:true,draftOnly:true,createsCalendarEvent:false}});
  assert.equal(byId.get(judicial.id).capabilities.call.available,true);assert.equal(byId.get(judicial.id).capabilities.email.available,true);
  assert.equal(byId.get(expert.id).capabilities.call.available,true);assert.equal(byId.get(expert.id).capabilities.text.available,true);assert.equal(byId.get(expert.id).capabilities.email.available,false);
  assert.equal(byId.get(other.id).capabilities.call.available,false);assert.equal(byId.get(other.id).capabilities.email.available,true);
  assert.equal(result.client.id,client.id);assert.equal(result.contact.email,'taylor.morgan@example.test');
});

test('case clientId remains the preferred legacy default while contact lists stay selectable and cross-case pointers fail closed',async()=>{
  const {atlas,workspace,matter,client,service}=await fixture();
  const sharedClient=await atlas.createObject(workspace.id,{dimension:'client',type:'client',title:'Shared Client',state:{email:'shared@example.test',phone:'+15550001212'}});const explicit=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Explicit case',state:{clientId:sharedClient.id}});assert.equal((await service.status(workspace.id,explicit.id)).client.id,sharedClient.id);
  const wrongCase=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Wrong explicit case',state:{clientId:client.id}});await assert.rejects(()=>service.status(workspace.id,wrongCase.id),error=>error.code==='CASE_COMMUNICATION_CLIENT_CASE_MISMATCH'&&error.status===409);
  const missing=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Missing client'});const empty=await service.status(workspace.id,missing.id);assert.equal(empty.client,null);assert.deepEqual(empty.contacts,[]);
  const second=await atlas.createObject(workspace.id,{parentObjectId:matter.id,dimension:'person',type:'client',title:'Second Client',state:{email:'second@example.test',phone:'+15550009999'}});const selectable=await service.status(workspace.id,matter.id);assert.equal(selectable.client,null);assert.deepEqual(new Set(selectable.contacts.filter(contact=>contact.role==='client').map(contact=>contact.id)),new Set([client.id,second.id]));
  await assert.rejects(()=>service.prepareCall(workspace.id,matter.id,'usr_attorney'),error=>error.code==='CASE_COMMUNICATION_CLIENT_AMBIGUOUS');
  const otherMatter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Other case'});await atlas.createObject(workspace.id,{parentObjectId:otherMatter.id,dimension:'client',type:'client',title:'Other Client',state:{email:'other@example.test'}});assert.deepEqual((await service.status(workspace.id,missing.id)).contacts,[]);
});

test('call preparation creates only a case-parented device handoff attempt',async()=>{
  const {atlas,workspace,matter,client,service,sent}=await fixture();const result=await service.prepareCall(workspace.id,matter.id,{contactId:client.id},'usr_attorney');
  assert.equal(result.dialUri,'tel:5550102026');assert.equal(result.attempt.parentObjectId,matter.id);assert.equal(result.attempt.type,'phone_call');
  assert.deepEqual({status:result.attempt.state.status,clientId:result.attempt.state.clientId,providerInvoked:result.attempt.state.providerInvoked,completedAt:result.attempt.state.completedAt},{status:'prepared',clientId:client.id,providerInvoked:false,completedAt:null});
  assert.equal(sent.length,0);assert.ok((await atlas.listEvents(workspace.id,result.attempt.id)).some(event=>event.type==='communication.call_prepared'));
});

test('text action delegates to the existing unsent draft path and never sends',async()=>{
  const {workspace,matter,client,service,sent}=await fixture();const result=await service.createTextDraft(workspace.id,matter.id,{contactId:client.id,body:'Please call when convenient.'},'usr_attorney');
  assert.equal(result.draft.parentObjectId,matter.id);assert.deepEqual({type:result.draft.type,to:result.draft.state.to,clientId:result.draft.state.clientId,status:result.draft.state.status,sent:result.draft.state.sent},{type:'sms_draft',to:'5550102026',clientId:client.id,status:'pending_review',sent:false});
  assert.equal(sent.length,0);await assert.rejects(()=>service.createTextDraft(workspace.id,matter.id,{body:'No',to:'+15550000000'},'usr_attorney'),error=>error.code==='CASE_COMMUNICATION_RECIPIENT_OVERRIDE_FORBIDDEN');
});

test('email action uses the interchangeable model and stores one unsent case draft',async()=>{
  const {atlas,workspace,matter,client,service,modelCalls,sent}=await fixture();await atlas.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'task',title:'Client documents received',state:{matterId:matter.id,status:'completed',summary:'The requested client documents were received.'}});const result=await service.createEmailDraft(workspace.id,matter.id,{contactId:client.id,instructions:'Explain that the filing is ready for review.'},'usr_attorney');
  assert.equal(modelCalls.length,1);assert.equal(modelCalls[0].context.action,'draft_client_email');const modelContext=JSON.parse(modelCalls[0].messages.at(-1).content);assert.ok(modelContext.canonicalContext.objects.some(item=>item.title==='Client documents received'));assert.equal(result.draft.parentObjectId,matter.id);
  assert.deepEqual({type:result.draft.type,recipients:result.draft.state.recipients,clientId:result.draft.state.clientId,status:result.draft.state.status,sent:result.draft.state.sent,approval:result.draft.state.requiresHumanApproval,providerInvoked:result.draft.state.providerInvoked,generatedByAi:result.draft.state.generatedByAi},{type:'email_draft',recipients:['taylor.morgan@example.test'],clientId:client.id,status:'pending_review',sent:false,approval:true,providerInvoked:false,generatedByAi:true});
  assert.equal(sent.length,0);assert.equal((await atlas.listObjects(workspace.id,{type:'calendar_event'})).length,0);
  await assert.rejects(()=>service.createEmailDraft(workspace.id,matter.id,{recipients:['attacker@example.test']},'usr_attorney'),error=>error.code==='CASE_COMMUNICATION_RECIPIENT_OVERRIDE_FORBIDDEN');
});

test('meeting action preserves exact slots in an unsent email and creates no calendar event',async()=>{
  const {atlas,workspace,matter,client,service,modelCalls,sent}=await fixture();const slots=['2026-07-20T14:00:00.000Z','2026-07-21T16:30:00.000Z'];
  const result=await service.createMeetingDraft(workspace.id,matter.id,{contactId:client.id,meetingType:'in_person',proposedSlots:slots,timeZone:'America/New_York',location:'Firm conference room'},'usr_attorney');
  assert.equal(modelCalls.at(-1).context.action,'draft_client_meeting_email');assert.deepEqual(result.draft.state.meetingProposal,{meetingType:'in_person',proposedSlots:slots,timeZone:'America/New_York',location:'Firm conference room'});
  assert.equal(result.draft.state.sent,false);assert.equal(result.draft.state.status,'pending_review');assert.match(result.draft.state.body,/Proposed times \(America\/New_York\)/);assert.match(result.draft.state.body,/Firm conference room/);
  assert.equal((await atlas.listObjects(workspace.id,{type:'calendar_event'})).length,0);assert.equal(sent.length,0);
  await assert.rejects(()=>service.createMeetingDraft(workspace.id,matter.id,{meetingType:'phone',proposedSlots:[slots[0]],timeZone:'America/New_York'},'usr_attorney'),error=>error.code==='CASE_COMMUNICATION_INVALID');
  await assert.rejects(()=>service.createMeetingDraft(workspace.id,matter.id,{meetingType:'phone',proposedSlots:['2026-07-01T14:00:00.000Z','2026-07-02T14:00:00.000Z'],timeZone:'America/New_York'},'usr_attorney'),error=>error.code==='CASE_COMMUNICATION_INVALID');
});

test('each action resolves only the selected canonical contact and records that contact on new work',async()=>{
  const {atlas,workspace,matter,service,sent}=await fixture();
  const opposing=await addCaseContact(atlas,workspace.id,matter,{title:'Avery Counsel',type:'opposing_counsel',role:'opposing_counsel',email:'avery@opposing.test',phone:'+15550105050'});
  const judicial=await addCaseContact(atlas,workspace.id,matter,{title:'Jordan Chambers',type:'judicial_assistant',role:'judicial_assistant',email:'chambers@court.test',phone:'+15550106060'});
  const expert=await addCaseContact(atlas,workspace.id,matter,{title:'Dr. Riley Expert',type:'expert_witness',role:'expert_witness',email:'expert@example.test',phone:'+15550107070'});
  const call=await service.prepareCall(workspace.id,matter.id,{contactId:judicial.id},'usr_attorney');
  assert.equal(call.dialUri,'tel:+15550106060');assert.equal(call.attempt.state.contactId,judicial.id);assert.equal(call.attempt.state.contactRole,'judicial_assistant');
  const text=await service.createTextDraft(workspace.id,matter.id,{contactId:expert.id,body:'Please confirm your availability.'},'usr_attorney');
  assert.equal(text.draft.state.to,'+15550107070');assert.equal(text.draft.state.contactId,expert.id);assert.equal(text.draft.state.contactRole,'expert_witness');
  const emailDraft=await service.createEmailDraft(workspace.id,matter.id,{contactId:opposing.id,instructions:'Propose a time to confer.'},'usr_attorney');
  assert.deepEqual(emailDraft.draft.state.recipients,['avery@opposing.test']);assert.equal(emailDraft.draft.state.contactId,opposing.id);assert.equal(emailDraft.draft.state.contactRole,'opposing_counsel');
  assert.equal(sent.length,0);
});

test('external-recipient AI drafting excludes internal work and observations and stores no clientId',async()=>{
  const {repository,atlas,workspace,matter,service,modelCalls}=await fixture();
  const opposing=await addCaseContact(atlas,workspace.id,matter,{title:'Avery Counsel',type:'opposing_counsel',role:'opposing_counsel',email:'avery@opposing.test'});
  const judicial=await addCaseContact(atlas,workspace.id,matter,{title:'Jordan Chambers',type:'judicial_assistant',role:'judicial_assistant',email:'chambers@court.test'});
  const internalTask=await atlas.createObject(workspace.id,{parentObjectId:matter.id,dimension:'operation',type:'task',title:'Internal settlement ceiling',state:{matterId:matter.id,summary:'Privileged work product: authority stops at 40,000.',status:'open'}});
  await repository.createIntelligenceObservation({id:'ino_case_communication_secret',workspaceId:workspace.id,jobId:'inj_case_communication_secret',sourceObjectId:internalTask.id,kind:'risk',data:{description:'Attorney-eyes-only impeachment plan'},confidence:.9,sourceLocation:{field:'summary'},provider:'test',status:'accepted',reviewedBy:'usr_attorney',reviewedAt:now,createdAt:now});
  for(const contact of [opposing,judicial]){
    const result=await service.createEmailDraft(workspace.id,matter.id,{contactId:contact.id,instructions:'Draft a neutral scheduling email.'},'usr_attorney');
    const request=modelCalls.at(-1);const supplied=JSON.parse(request.messages.at(-1).content);
    assert.equal(supplied.contact.id,contact.id);assert.equal(supplied.contact.role,contact.state.role);
    assert.equal(supplied.canonicalContext.objects.some(object=>object.id===internalTask.id),false);
    assert.equal(supplied.canonicalContext.observations.length,0);
    assert.doesNotMatch(request.messages.at(-1).content,/settlement ceiling|40,000|impeachment plan/i);
    assert.match(request.messages[0].content,/privileg|work product/i);assert.match(request.messages[0].content,/ex parte|merits/i);
    assert.equal(result.draft.state.contactId,contact.id);assert.equal(result.draft.state.contactRole,contact.state.role);assert.equal('clientId' in result.draft.state,false);
  }
});

test('contact selection fails closed across cases and firms without creating communication work',async()=>{
  const {atlas,workspace,matter,service,sent}=await fixture();
  const otherMatter=await atlas.createObject(workspace.id,{dimension:'matter',type:'civil',title:'Unrelated case'});
  const otherCaseContact=await addCaseContact(atlas,workspace.id,otherMatter,{title:'Other Case Contact',type:'contact',role:'other_contact',email:'other-case@example.test',phone:'+15550108080'});
  const otherWorkspace=await atlas.createWorkspace({name:'Completely Separate Firm'});
  const foreignMatter=await atlas.createObject(otherWorkspace.id,{dimension:'matter',type:'civil',title:'Foreign case'});
  const foreignContact=await addCaseContact(atlas,otherWorkspace.id,foreignMatter,{title:'Foreign Contact',type:'contact',role:'other_contact',email:'foreign@example.test',phone:'+15550109090'});
  await assert.rejects(()=>service.prepareCall(workspace.id,matter.id,{contactId:otherCaseContact.id},'usr_attorney'),error=>error.status===409&&/case/i.test(error.message));
  await assert.rejects(()=>service.createEmailDraft(workspace.id,matter.id,{contactId:foreignContact.id,instructions:'Do not draft this.'},'usr_attorney'),error=>error.code==='CASE_COMMUNICATION_CONTACT_UNAVAILABLE'&&error.status===409&&!JSON.stringify(error.details??{}).includes(foreignContact.id));
  const communications=(await atlas.listObjects(workspace.id,{})).filter(object=>['phone_call','sms_draft','email_draft'].includes(object.type));
  assert.equal(communications.length,0);assert.equal(sent.length,0);
});

test('contactId is a selector but direct recipient overrides remain forbidden for every channel',async()=>{
  const {workspace,matter,client,service}=await fixture();
  const attempts=[
    ()=>service.prepareCall(workspace.id,matter.id,{contactId:client.id,phone:'+15550000000'},'usr_attorney'),
    ()=>service.createTextDraft(workspace.id,matter.id,{contactId:client.id,body:'Draft',to:'+15550000000'},'usr_attorney'),
    ()=>service.createEmailDraft(workspace.id,matter.id,{contactId:client.id,recipients:['attacker@example.test']},'usr_attorney'),
    ()=>service.createMeetingDraft(workspace.id,matter.id,{contactId:client.id,email:'attacker@example.test',meetingType:'phone',proposedSlots:['2026-07-20T14:00:00.000Z','2026-07-21T16:30:00.000Z'],timeZone:'America/New_York'},'usr_attorney')
  ];
  for(const attempt of attempts)await assert.rejects(attempt,error=>error.code==='CASE_COMMUNICATION_RECIPIENT_OVERRIDE_FORBIDDEN');
});
