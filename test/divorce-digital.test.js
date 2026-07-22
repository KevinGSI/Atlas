import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { DivorceDigitalService } from '../src/divorce-digital.js';
import { AtlasIngestionService } from '../src/ingestion.js';
import { AtlasFileService, InMemoryBlobStore } from '../src/file-storage.js';

const clock=()=> '2026-07-15T18:00:00.000Z';
const token='portal-token-'.padEnd(40,'x');
const authorization=`Bearer ${token}`;
const catalog=[{
  serviceId:'petition_or_response',templateId:'flo_petition_response_v1',version:'1.0.0',label:'Petition or response preparation',
  scopeSummary:'Prepare the selected petition or response.',excludedSummary:'Filing, service, hearings, and negotiations are excluded.',
  agreementText:'LIMITED-SCOPE AGREEMENT\nClient: {{clientName}}\nDate: {{agreementDate}}\nService: petition or response preparation.',
  approvalStatus:'active_attorney_approved',approvedBy:'usr_attorney',approvedAt:'2026-07-14T12:00:00.000Z',allowedMergeFields:['clientName','agreementDate'],priceMinor:50000,currency:'USD',
  standardQuestions:[{key:'county',label:'Which Florida county?'},{key:'requestedRelief',label:'What should the document address?'}]
},{
  serviceId:'divorce_case_assessment',templateId:'flo_case_assessment_v1',version:'1.0.0',label:'Divorce case assessment and action plan',scopeSummary:'Organize supplied facts and records into an action plan.',excludedSummary:'Court appearances and filing are excluded.',agreementText:'ASSESSMENT AGREEMENT\nClient: {{clientName}}\nDate: {{agreementDate}}',approvalStatus:'active_attorney_approved',approvedBy:'usr_attorney',approvedAt:'2026-07-14T12:00:00.000Z',allowedMergeFields:['clientName','agreementDate'],priceMinor:30000,currency:'USD',standardQuestions:[]
},{
  serviceId:'financial_disclosure',templateId:'flo_financial_disclosure_v1',version:'1.0.0',label:'Financial disclosure organization',scopeSummary:'Organize supplied financial information and records.',excludedSummary:'Forensic accounting is excluded.',agreementText:'FINANCIAL AGREEMENT\nClient: {{clientName}}\nDate: {{agreementDate}}',approvalStatus:'active_attorney_approved',approvedBy:'usr_attorney',approvedAt:'2026-07-14T12:00:00.000Z',allowedMergeFields:['clientName','agreementDate'],priceMinor:40000,currency:'USD',standardQuestions:[]
}];

async function setup(){
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);const firm=await atlas.createWorkspace({name:'Florida’s Law Office'});const other=await atlas.createWorkspace({name:'Other Firm'});
  const files=new AtlasFileService(atlas,new AtlasIngestionService(repository,clock),new InMemoryBlobStore());
  const assistantCalls=[];const assistant={async query(input){assistantCalls.push(input);const recommendation=input.prompt.includes('ATLAS_SERVICE_RECOMMENDATION_REQUEST');return{answer:recommendation?JSON.stringify({summary:'Atlas identified the next practical service options from the client-visible matter.',nextRequiredStep:'Review the response service first and confirm the service date.',recommendations:[{serviceId:'petition_or_response',reason:'The intake says a petition was served.',priority:'immediate',missingInformation:['Verified service date']},{serviceId:'divorce_case_assessment',reason:'An organized assessment can consolidate the remaining issues.',priority:'high',missingInformation:[]},{serviceId:'financial_disclosure',reason:'Financial information will need organized supporting records.',priority:'standard',missingInformation:['Current income records']}]}):'I can organize the client-visible matter information and identify the next portal section.',sources:[],webSources:[],runId:recommendation?'air_recommend':'air_portal',conversationId:recommendation?'aic_recommend':'aic_portal',provider:'test-provider',model:'test-model'};}};
  const service=new DivorceDigitalService(atlas,repository,{clock,assistant,files,catalog,connections:[{websiteId:'flo-divorce',workspaceId:firm.id,targetUserId:'usr_attorney',token,timeZone:'America/New_York'},{websiteId:'other-divorce',workspaceId:other.id,targetUserId:'usr_other',token:'other-token-'.padEnd(40,'y'),timeZone:'America/New_York'}]});
  return{repository,atlas,firm,other,service,assistantCalls};
}

async function lead(service,extra={}){return service.createLead('flo-divorce',authorization,{name:'Client One',email:'client@example.com',phone:'8135550101',contactConsent:true,textConsent:true,consentVersion:'v1',attribution:{utmSource:'test'},...extra});}

test('divorce portal writes one connected canonical matter instead of page-local records',async()=>{
  const {repository,atlas,firm,service}=await setup();const created=await lead(service);
  assert.match(created.portalId,/^dp_[A-Za-z0-9_-]{20,}$/);assert.equal(created.portalPath,`/portal/${created.portalId}/`);
  const saved=await service.saveSection('flo-divorce',authorization,created.sessionToken,{section:'situation',data:{county:'Hillsborough',stage:'petition received'}});
  assert.equal(saved.matterId,created.matterId);assert.equal(saved.canonical,true);
  const context=await atlas.getCanonicalContext(firm.id,created.matterId);
  const types=new Set(context.objects.map(item=>item.type));
  for(const type of ['divorce','prospective_client','client_portal_session','divorce_intake_section'])assert.ok(types.has(type),`missing ${type}`);
  assert.ok(context.relationships.some(item=>item.type==='prospective_party_for'));
  assert.ok(context.events.some(item=>item.type==='divorce.portal.section_saved'));
  assert.ok((await repository.listIntelligenceJobs(firm.id)).some(item=>item.triggerType==='divorce.portal.section_saved'));
  assert.equal(context.objects.find(item=>item.type==='client_portal_session').state.rawTokenStored,false);
  assert.equal(context.objects.find(item=>item.type==='client_portal_session').state.portalId,created.portalId);
  assert.equal(context.objects.find(item=>item.type==='divorce').state.portalFramework,'flo_divorce_shared_v1');
  assert.notEqual(context.objects.find(item=>item.type==='client_portal_session').state.sessionKey,created.sessionToken);
});

test('hub-and-spoke portals share one capability framework while each client remains bound to a different canonical matter',async()=>{
  const {atlas,firm,service}=await setup();
  const first=await lead(service,{name:'Client One',email:'one@example.com'});
  const second=await lead(service,{name:'Client Two',email:'two@example.com',phone:'8135550102'});
  assert.notEqual(first.portalId,second.portalId);assert.notEqual(first.portalPath,second.portalPath);assert.notEqual(first.matterId,second.matterId);
  await service.saveSection('flo-divorce',authorization,first.sessionToken,{section:'start',data:{privateFact:'first client only'}});
  const connection=service.connection('flo-divorce',authorization);
  const firstContext=await service.clientContext(connection,await service.findBySession(connection,first.sessionToken));
  const secondContext=await service.clientContext(connection,await service.findBySession(connection,second.sessionToken));
  assert.equal(firstContext.portalFramework,'flo_divorce_shared_v1');assert.equal(secondContext.portalFramework,'flo_divorce_shared_v1');
  assert.equal(firstContext.policy.hubAndSpokePortal,true);assert.equal(firstContext.policy.sameAtlasCapabilityFramework,true);assert.equal(firstContext.policy.portalUrlIsAuthorization,false);
  assert.ok(firstContext.objects.some(item=>item.type==='divorce_intake_section'));assert.ok(!secondContext.objects.some(item=>JSON.stringify(item).includes('first client only')));
  const matters=await atlas.listObjects(firm.id,{type:'divorce'});assert.equal(matters.length,2);
});

test('portal Atlas uses audited native AI with client-only context and no firm-wide recall or action tools',async()=>{
  const {atlas,firm,service,assistantCalls}=await setup();const created=await lead(service);await service.saveSection('flo-divorce',authorization,created.sessionToken,{section:'start',data:{county:'Pinellas'}});
  const result=await service.assist('flo-divorce',authorization,created.sessionToken,{message:'What should I organize next?'});
  assert.equal(result.canonicalMatterId,created.matterId);assert.equal(assistantCalls.length,1);assert.equal(assistantCalls[0].skipRecall,true);assert.deepEqual(assistantCalls[0].allowedTools,['search_public_web']);
  assert.match(assistantCalls[0].developerContext,/client-visible canonical context/i);assert.match(assistantCalls[0].developerContext,/firmWideRetrieval":false/);assert.match(assistantCalls[0].developerContext,/Never reveal private chain-of-thought/i);assert.doesNotMatch(assistantCalls[0].developerContext,/client@example\.com|8135550101/);
  const context=await atlas.getCanonicalContext(firm.id,created.matterId);const statement=context.objects.find(item=>item.type==='divorce_conversation_intake');assert.equal(statement.state.clientStatement,'What should I organize next?');assert.equal(statement.state.hiddenReasoningStored,false);assert.ok(context.events.some(item=>item.type==='divorce.portal.assistant_completed'&&item.parentObjectId===statement.id));
});

test('Atlas ranks three to five approved services from the learned canonical matter instead of a fixed browser command',async()=>{
  const {atlas,firm,service,assistantCalls}=await setup();const created=await lead(service);await service.saveSection('flo-divorce',authorization,created.sessionToken,{section:'start',data:{stage:'petition served',county:'Hillsborough'}});
  const result=await service.recommendServices('flo-divorce',authorization,created.sessionToken);
  assert.equal(result.canonical,true);assert.equal(result.recommendations.length,3);assert.equal(result.recommendations[0].serviceId,'petition_or_response');assert.equal(result.recommendations[0].priority,'immediate');assert.equal(result.automaticPurchase,false);assert.equal(result.hiddenReasoningStored,false);
  const call=assistantCalls.find(item=>item.prompt.includes('ATLAS_SERVICE_RECOMMENDATION_REQUEST'));assert.ok(call);assert.equal(call.skipRecall,true);assert.deepEqual(call.allowedTools,[]);assert.match(call.developerContext,/active attorney-approved service catalog/i);assert.match(call.developerContext,/petition served/);assert.doesNotMatch(call.developerContext,/client@example\.com|8135550101/);
  const cached=await service.recommendServices('flo-divorce',authorization,created.sessionToken);assert.equal(cached.cached,true);assert.equal(assistantCalls.filter(item=>item.prompt.includes('ATLAS_SERVICE_RECOMMENDATION_REQUEST')).length,1);
  const context=await atlas.getCanonicalContext(firm.id,created.matterId);assert.ok(context.objects.some(item=>item.type==='client_service_recommendation'));assert.ok(context.events.some(item=>item.type==='divorce.portal.service_recommendations_prepared'));
});

test('court-document upload becomes canonical intelligence, case facts, and a source-linked response service suggestion',async()=>{
  const {atlas,firm,service}=await setup();const created=await lead(service);const bytes=Buffer.from('%PDF-1.4\npetition for dissolution fixture');
  const uploaded=await service.uploadDocument('flo-divorce',authorization,created.sessionToken,{filename:'Petition for Dissolution.pdf',mediaType:'application/pdf',contentBase64:bytes.toString('base64'),idempotencyKey:'petition-upload-1'});
  assert.equal(uploaded.analysisQueued,true);assert.equal(uploaded.document.status,'pending');
  let document=await atlas.getObject(firm.id,uploaded.document.id);assert.equal(document.parentObjectId,created.matterId);assert.equal(document.state.provenance.kind,'client_portal_upload');
  document=await atlas.updateObject(firm.id,document.id,{version:document.version,state:{...document.state,extractionStatus:'completed',documentType:'petition_for_dissolution',documentAnalysis:{status:'cataloged',documentType:'petition_for_dissolution',summary:'A petition for dissolution of marriage opens a family case and identifies the parties and requested relief.',confidence:.96,suggestedTitle:'Petition for Dissolution of Marriage',caseNumber:'2026-DR-123',court:'Thirteenth Judicial Circuit, Hillsborough County',documentDate:'2026-07-14',parties:['Client One','Spouse One'],attorneys:[],organizations:[],keyDates:[{label:'Personally served',date:'2026-07-15',sourceLocation:{page:1}}],requiresAttorneyReview:true}}},'atlas');
  const listed=await service.listDocuments('flo-divorce',authorization,created.sessionToken);assert.equal(listed.documents.length,1);const result=listed.documents[0];assert.equal(result.documentType,'petition_for_dissolution');assert.equal(result.caseNumber,'2026-DR-123');assert.equal(result.serviceSuggestion.serviceId,'petition_or_response');assert.equal(result.serviceSuggestion.responseWindow.bindingDeadlineCalculated,false);assert.match(result.serviceSuggestion.responseWindow.ruleReference,/12\.140/);
  assert.equal(JSON.stringify(result).includes('storageRef'),false);assert.equal(JSON.stringify(result).includes('sha256'),false);
  const context=await atlas.getCanonicalContext(firm.id,created.matterId);for(const type of ['uploaded_document','divorce_document_facts','client_service_suggestion'])assert.ok(context.objects.some(item=>item.type===type));assert.ok(context.relationships.some(item=>item.type==='extracts_case_facts_from'));assert.ok(context.relationships.some(item=>item.type==='suggested_from_document'));assert.ok(context.events.some(item=>item.type==='divorce.portal.service_suggested'));
});

test('agreement, signature, verified payment, answers, and Atlas work remain in the same canonical context',async()=>{
  const {atlas,firm,service}=await setup();const created=await lead(service);
  let order=await service.createAgreement('flo-divorce',authorization,created.sessionToken,{serviceId:'petition_or_response'});
  assert.equal(order.status,'agreement_ready');assert.equal(order.agreement.clientName,'Client One');assert.match(order.agreement.agreementText,/Client: Client One/);assert.doesNotMatch(order.agreement.agreementText,/{{/);
  order=await service.signAgreement('flo-divorce',authorization,created.sessionToken,order.orderId,{signatureName:'Client One',agreementDigest:order.agreement.agreementDigest,templateVersion:'1.0.0',intentToSign:true,electronicRecordsConsent:true});assert.equal(order.status,'signed');
  const paid=await service.confirmPayment('flo-divorce',authorization,order.orderId,{eventId:'evt_pay_1',providerPaymentId:'pay_1',amountCents:50000,currency:'USD',paidAt:clock()});assert.equal(paid.status,'payment_verified_atlas_queued');
  let smart=await service.smartWorkspace('flo-divorce',authorization,created.sessionToken);assert.equal(smart.services.length,1);assert.equal(smart.services[0].status,'collecting_information');assert.equal(smart.services[0].clientActionRequired,true);assert.equal(smart.services[0].requiresAttorneyCompletion,true);assert.match(smart.services[0].completionNotice,/attorney completes/i);assert.ok(smart.services[0].progressPercent>0);
  order=await service.submitAnswers('flo-divorce',authorization,created.sessionToken,order.orderId,{answers:{county:'Hillsborough',requestedRelief:'Prepare a response using the supplied facts.'}});assert.equal(order.status,'draft_preparing');
  smart=await service.smartWorkspace('flo-divorce',authorization,created.sessionToken);assert.equal(smart.services[0].status,'draft_preparing');assert.equal(smart.services[0].clientActionRequired,false);assert.equal(smart.services[0].progressPercent,62);
  const context=await atlas.getCanonicalContext(firm.id,created.matterId);const types=new Set(context.objects.map(item=>item.type));for(const type of ['client_service_order','limited_scope_agreement','payment','task','client_service_answers'])assert.ok(types.has(type),`missing ${type}`);
  assert.ok(context.relationships.some(item=>item.type==='governed_by_agreement'));
  assert.ok(context.relationships.some(item=>item.type==='pays_for_service_order'));
  assert.ok(context.relationships.some(item=>item.type==='executes_service_order'));
  assert.ok(context.events.some(item=>item.type==='divorce.service.activated'));
  const task=context.objects.find(item=>item.type==='task'&&item.state.taskKind==='client_service_workflow');assert.equal(task.state.requiresInternalQualityControl,true);assert.equal(task.state.maySignSendFileOrPublish,false);
});

test('attorney review returns only client-visible approved work and creates a credited court-services consultation',async()=>{
  const {atlas,firm,service}=await setup();const created=await lead(service);
  await atlas.createObject(firm.id,{parentObjectId:created.matterId,dimension:'document',type:'attorney_approved_document',title:'Approved response',actorId:'usr_attorney',state:{attorneyApproved:true,clientVisible:true,status:'approved',clientInstructions:'Review the filing instructions.',approvedAt:clock(),downloadUrl:'/secure/documents/doc-1'}});
  await atlas.createObject(firm.id,{parentObjectId:created.matterId,dimension:'operation',type:'attorney_client_guidance',title:'Next step',actorId:'usr_attorney',state:{attorneyApproved:true,clientVisible:true,summary:'A temporary-relief hearing may require live representation.',nextStepKind:'court_hearing',approvedAt:clock()}});
  await atlas.createObject(firm.id,{parentObjectId:created.matterId,dimension:'document',type:'attorney_approved_document',title:'Private draft',actorId:'usr_attorney',state:{attorneyApproved:false,clientVisible:false,status:'draft'}});
  const review=await service.attorneyReview('flo-divorce',authorization,created.sessionToken);assert.equal(review.documents.length,1);assert.equal(review.documents[0].title,'Approved response');assert.equal(review.advice.length,1);assert.equal(review.courtServicesConsultation.feeMinor,9999);assert.equal(review.courtServicesConsultation.creditToSubsequentLiveServiceAgreement,true);
  const consultation=await service.requestCourtServicesConsultation('flo-divorce',authorization,created.sessionToken,{requestedService:'Court hearing',reason:'A temporary-relief hearing is expected.',idempotencyKey:'court-consult-1'});assert.equal(consultation.status,'payment_required');assert.equal(consultation.feeMinor,9999);assert.equal(consultation.creditToFutureService,true);
  const repeated=await service.requestCourtServicesConsultation('flo-divorce',authorization,created.sessionToken,{requestedService:'Court hearing',reason:'A temporary-relief hearing is expected.',idempotencyKey:'court-consult-1'});assert.equal(repeated.id,consultation.id);
  const context=await atlas.getCanonicalContext(firm.id,created.matterId);const request=context.objects.find(item=>item.type==='court_service_consultation');assert.equal(request.state.creditAppliesTo,'subsequent_live_attorney_client_services_agreement');assert.ok(context.events.some(item=>item.type==='divorce.court_services_consultation.requested'));
});

test('website and client session boundaries fail closed across firms',async()=>{
  const {service}=await setup();const created=await lead(service);
  await assert.rejects(()=>service.saveSection('flo-divorce','Bearer wrong',created.sessionToken,{section:'start',data:{}}),error=>error.code==='DIVORCE_PORTAL_UNAUTHORIZED');
  await assert.rejects(()=>service.saveSection('other-divorce',`Bearer ${'other-token-'.padEnd(40,'y')}`,created.sessionToken,{section:'start',data:{}}),error=>error.code==='DIVORCE_PORTAL_SESSION_INVALID');
});

test('retries reuse canonical lead, agreement, signature, answers, and payment records',async()=>{const {atlas,firm,service}=await setup();const first=await lead(service,{idempotencyKey:'lead-1'});const second=await lead(service,{idempotencyKey:'lead-1'});assert.equal(second.duplicate,true);assert.equal(second.matterId,first.matterId);assert.equal(second.sessionToken,first.sessionToken);let order=await service.createAgreement('flo-divorce',authorization,first.sessionToken,{serviceId:'petition_or_response',idempotencyKey:'order-1'});const repeated=await service.createAgreement('flo-divorce',authorization,first.sessionToken,{serviceId:'petition_or_response',idempotencyKey:'order-1'});assert.equal(repeated.orderId,order.orderId);order=await service.signAgreement('flo-divorce',authorization,first.sessionToken,order.orderId,{signatureName:'Client One',agreementDigest:order.agreement.agreementDigest,templateVersion:'1.0.0',intentToSign:true,electronicRecordsConsent:true});const signedAgain=await service.signAgreement('flo-divorce',authorization,first.sessionToken,order.orderId,{signatureName:'Client One',agreementDigest:order.agreement.agreementDigest,templateVersion:'1.0.0',intentToSign:true,electronicRecordsConsent:true});assert.equal(signedAgain.status,'signed');const paid=await service.confirmPayment('flo-divorce',authorization,order.orderId,{eventId:'pay-event-1',providerPaymentId:'pay-1',amountCents:50000,currency:'USD',paidAt:clock()});const paidAgain=await service.confirmPayment('flo-divorce',authorization,order.orderId,{eventId:'pay-event-1',providerPaymentId:'pay-1',amountCents:50000,currency:'USD',paidAt:clock()});assert.equal(paidAgain.duplicate,true);await service.submitAnswers('flo-divorce',authorization,first.sessionToken,order.orderId,{answers:{county:'Hillsborough'},idempotencyKey:'answers-1'});await service.submitAnswers('flo-divorce',authorization,first.sessionToken,order.orderId,{answers:{county:'Hillsborough'},idempotencyKey:'answers-1'});const objects=await atlas.listObjects(firm.id,{});assert.equal(objects.filter(item=>item.type==='divorce').length,1);assert.equal(objects.filter(item=>item.type==='client_service_order').length,1);assert.equal(objects.filter(item=>item.type==='limited_scope_agreement').length,1);assert.equal(objects.filter(item=>item.type==='payment').length,1);assert.equal(objects.filter(item=>item.type==='client_service_answers').length,1);assert.ok(paid.taskId);});

test('service catalog rejects AI-editable or unapproved agreements',()=>{const repository=new InMemoryRepository();const atlas=new AtlasService(repository,clock);assert.throws(()=>new DivorceDigitalService(atlas,repository,{catalog:[{...catalog[0],approvalStatus:'draft'}]}),/not an active attorney-approved template/);assert.throws(()=>new DivorceDigitalService(atlas,repository,{catalog:[{...catalog[0],allowedMergeFields:['clientName','agreementDate','scope']}]}),/clientName and agreementDate/);});
