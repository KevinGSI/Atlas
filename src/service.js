import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';
import { ConflictScreeningService } from './conflict-screening.js';
import { normalizeCalendarEventProposal } from './calendar-events.js';
import { buildCanonicalContext, canonicalMatterId } from './canonical-context.js';
import {canonicalContactType,isContactObject,normalizeContactState} from './contacts.js';

const dimensions = new Set(['matter', 'client', 'evidence', 'document', 'person', 'organization', 'operation']);
const immutableLedgerTypes = new Set(['payment', 'refund', 'trust_transaction', 'journal_entry']);

function profileText(value,field,max=500){if(value===undefined)return undefined;if(value===null)return null;if(typeof value!=='string')throw new AtlasError('PROFILE_INVALID',`${field} must be text`,400,{field});return value.trim().slice(0,max)||null;}
function profileEmail(value,field){const email=profileText(value,field,320);if(email&&!/^\S+@\S+\.\S+$/.test(email))throw new AtlasError('PROFILE_INVALID',`${field} must be a valid email address`,400,{field});return email;}
function profileUrl(value,field){const text=profileText(value,field,1000);if(!text)return text;let url;try{url=new URL(text);}catch{throw new AtlasError('PROFILE_INVALID',`${field} must be a valid web address`,400,{field});}if(!['http:','https:'].includes(url.protocol))throw new AtlasError('PROFILE_INVALID',`${field} must use http or https`,400,{field});return url.href;}
function profileList(value,field){if(value===undefined)return undefined;const values=Array.isArray(value)?value:typeof value==='string'?value.split(','):null;if(!values)throw new AtlasError('PROFILE_INVALID',`${field} must be a list`,400,{field});return [...new Set(values.map(item=>String(item).trim().slice(0,160)).filter(Boolean))].slice(0,30);}
function selectedProfileState(input,previous,definitions){if(!input||typeof input!=='object'||Array.isArray(input))throw new AtlasError('PROFILE_INVALID','Profile information must be an object',400);const state={...previous};for(const [field,kind,max] of definitions){const value=kind==='email'?profileEmail(input[field],field):kind==='url'?profileUrl(input[field],field):kind==='list'?profileList(input[field],field):profileText(input[field],field,max);if(value!==undefined)state[field]=value;}return state;}
const firmProfileFields=[['displayName','text',240],['legalName','text',240],['generalEmail','email'],['phone','text',80],['website','url'],['addressLine1','text',240],['addressLine2','text',240],['city','text',120],['state','text',120],['postalCode','text',40],['country','text',120],['jurisdictions','list'],['practiceAreas','list']];
const attorneyProfileFields=[['name','text',240],['professionalEmail','email'],['phone','text',80],['mobilePhone','text',80],['title','text',160],['barNumber','text',120],['barJurisdictions','list'],['practiceAreas','list'],['bio','text',4000],['signatureBlock','text',4000]];

export class AtlasService {
  constructor(repository, clock = () => new Date().toISOString(),options={}) {
    this.repository = repository;
    this.clock = clock;
    this.calendarPublisher=options.calendarPublisher??null;
  }

  setCalendarPublisher(publisher){if(publisher!==null&&typeof publisher!=='function')throw new AtlasError('CALENDAR_PUBLISHER_INVALID','Calendar publisher must be a function',500);this.calendarPublisher=publisher;return this;}

  async createWorkspace(input, ownerUserId = null) {
    const now = this.clock();
    return this.repository.transaction(async (repository) => {
      const workspace = await repository.createWorkspace({
        id: createId('wsp'), name: required(input.name, 'name'), createdAt: now, updatedAt: now, version: 1
      });
      if (ownerUserId) await repository.createMembership({
        id: createId('mem'), workspaceId: workspace.id, userId: ownerUserId, role: 'owner', createdAt: now
      });
      await repository.createSubscription({
        id:createId('sub'),workspaceId:workspace.id,plan:input.plan??'pilot',status:'trialing',seatLimit:input.seatLimit??10,
        trialEndsAt:input.trialEndsAt??null,currentPeriodEndsAt:null,createdAt:now,updatedAt:now
      });
      return workspace;
    });
  }

  buildIntelligenceJob(workspaceId, triggerType, objectId, eventId, payload) {
    const now = this.clock();
    return { id: createId('inj'), workspaceId, triggerType, objectId, eventId, status: 'pending', attempts: 0, payload, result: null, provider: null, errorCode: null, availableAt: now, lockedAt: null, createdAt: now, completedAt: null };
  }

  async getWorkspace(id) { return this.repository.getWorkspace(id); }

  async accountProfiles(workspaceId,user,canEditFirm=false,role=null){const [workspace,objects]=await Promise.all([this.getWorkspace(workspaceId),this.listObjects(workspaceId,{})]);const firm=objects.find(item=>item.type==='firm_profile')??null;const attorney=objects.find(item=>item.type==='attorney_profile'&&item.state?.userId===user.id)??null;return{canEditFirm,role,firm:firm??{id:null,title:workspace.name,version:null,state:{displayName:workspace.name}},attorney:attorney??{id:null,title:user.name,version:null,state:{userId:user.id,name:user.name,professionalEmail:user.email}},identity:{id:user.id,name:user.name,email:user.email}};}

  async updateAccountProfiles(workspaceId,user,input,{canEditFirm=false,role=null}={}){if(!input||typeof input!=='object'||Array.isArray(input))throw new AtlasError('PROFILE_INVALID','Profile information must be an object',400);const objects=await this.listObjects(workspaceId,{});let firm=objects.find(item=>item.type==='firm_profile')??null;let attorney=objects.find(item=>item.type==='attorney_profile'&&item.state?.userId===user.id)??null;const now=this.clock();if(input.firm!==undefined){if(!canEditFirm)throw new AtlasError('ACCESS_DENIED','Only a firm owner or administrator may edit firm information',403);const state=selectedProfileState(input.firm,firm?.state??{},firmProfileFields);state.profileScope='firm';state.updatedBy=user.id;state.profileUpdatedAt=now;const title=state.displayName??state.legalName??(await this.getWorkspace(workspaceId)).name;if(firm)firm=await this.updateObject(workspaceId,firm.id,{version:firm.version,title,state},user.id);else firm=await this.createObject(workspaceId,{dimension:'operation',type:'firm_profile',title,state,actorId:user.id});}
    if(input.attorney!==undefined){const state=selectedProfileState(input.attorney,attorney?.state??{},attorneyProfileFields);state.userId=user.id;state.profileScope='professional';state.signInEmail=user.email;state.updatedBy=user.id;state.profileUpdatedAt=now;state.name=state.name??user.name;state.professionalEmail=state.professionalEmail??user.email;const title=`Attorney profile — ${state.name}`;if(attorney)attorney=await this.updateObject(workspaceId,attorney.id,{version:attorney.version,title,state},user.id);else attorney=await this.createObject(workspaceId,{dimension:'operation',type:'attorney_profile',title,state,actorId:user.id});}
    return this.accountProfiles(workspaceId,user,canEditFirm,role);}

  async createObject(workspaceId, input) {
    const dimension = required(input.dimension, 'dimension');
    if (!dimensions.has(dimension)) {
      throw new AtlasError('VALIDATION_ERROR', 'Unsupported dimension', 400, { dimension });
    }
    const type=required(input.type, 'type');
    const inputState=input.state??{};
    const state=isContactObject({dimension,type,state:inputState})?normalizeContactState(inputState,{fallback:dimension==='client'||type==='client'?'client':'other'}):inputState;
    const now = this.clock();
    return this.repository.transaction(async (repository) => {
      const object = await repository.createObject({
        id: createId('obj'),
        workspaceId,
        parentObjectId: input.parentObjectId ?? null,
        dimension,
        type,
        title: required(input.title, 'title'),
        state,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1
      });
      const event = await repository.createEvent(this.buildEvent(workspaceId, {
        parentObjectId: object.id,
        type: 'object.created',
        actorId: input.actorId ?? 'system',
        source: 'atlas',
        confidence: 1,
        visibility: 'workspace',
        data: { objectType: object.type }
      }));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'object.created', object.id, event.id, { object }));
      return object;
    });
  }

  async getObject(workspaceId, id) { return this.repository.getObject(workspaceId, id); }
  async listObjects(workspaceId, filters) { return this.repository.listObjects(workspaceId, filters); }

  async getCanonicalContext(workspaceId,objectId,userId=null){
    const root=await this.repository.getObject(workspaceId,objectId);
    const [objects,relationships,events,observations,actions,awareness]=await Promise.all([
      this.repository.listObjects(workspaceId,{}),
      this.repository.listRelationships(workspaceId),
      this.repository.listEvents(workspaceId),
      this.repository.listIntelligenceObservations(workspaceId),
      this.repository.listAiActionProposals(workspaceId),
      userId?this.repository.listAwarenessItems(workspaceId,userId):[]
    ]);
    return buildCanonicalContext({rootObjectId:root.id,objects,relationships,events,observations,actions,awareness});
  }

  buildAudit(workspaceId, objectId, actorId, action, beforeSnapshot, afterSnapshot) {
    return { id: createId('aud'), workspaceId, objectId, actorId, action, beforeSnapshot, afterSnapshot, createdAt: this.clock() };
  }

  validateVersion(version) {
    if (!Number.isInteger(version) || version < 1) throw new AtlasError('VALIDATION_ERROR', 'version must be a positive integer', 400);
    return version;
  }

  async updateObject(workspaceId, objectId, input, actorId = 'system') {
    const version = this.validateVersion(input.version);
    const changes = {};
    if (input.title !== undefined) changes.title = required(input.title, 'title');
    if (input.state !== undefined) changes.state = input.state;
    if (!Object.keys(changes).length) throw new AtlasError('VALIDATION_ERROR', 'At least one editable field is required', 400);
    return this.repository.transaction(async (repository) => {
      const before = await repository.getObject(workspaceId, objectId);
      if(input.state!==undefined&&isContactObject(before))changes.state=normalizeContactState(input.state,{fallback:canonicalContactType(before)});
      if (immutableLedgerTypes.has(before.type)) throw new AtlasError('IMMUTABLE_LEDGER_ENTRY', 'Posted accounting entries cannot be edited; create a correcting entry instead', 409);
      const after = await repository.updateObject(workspaceId, objectId, version, changes, this.clock());
      await repository.createEvent(this.buildEvent(workspaceId, { parentObjectId: objectId, type: 'object.updated', actorId, source: 'atlas', data: { version: after.version } }));
      await repository.createAudit(this.buildAudit(workspaceId, objectId, actorId, 'object.updated', before, after));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'object.updated', objectId, null, { before, after }));
      return after;
    });
  }

  async deleteObject(workspaceId, objectId, input, actorId = 'system') {
    const version = this.validateVersion(input.version);
    return this.repository.transaction(async (repository) => {
      const before = await repository.getObject(workspaceId, objectId);
      if (immutableLedgerTypes.has(before.type)) throw new AtlasError('IMMUTABLE_LEDGER_ENTRY', 'Posted accounting entries cannot be deleted; create a correcting entry instead', 409);
      await repository.createEvent(this.buildEvent(workspaceId, { parentObjectId: objectId, type: 'object.deleted', actorId, source: 'atlas', data: { previousVersion: before.version } }));
      const after = await repository.softDeleteObject(workspaceId, objectId, version, this.clock());
      await repository.createAudit(this.buildAudit(workspaceId, objectId, actorId, 'object.deleted', before, after));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'object.deleted', objectId, null, { before, after }));
      return after;
    });
  }

  async restoreObject(workspaceId, objectId, input, actorId = 'system') {
    const version = this.validateVersion(input.version);
    return this.repository.transaction(async (repository) => {
      const before = await repository.getObject(workspaceId, objectId, { includeDeleted: true });
      const after = await repository.restoreObject(workspaceId, objectId, version, this.clock());
      await repository.createEvent(this.buildEvent(workspaceId, { parentObjectId: objectId, type: 'object.restored', actorId, source: 'atlas', data: { version: after.version } }));
      await repository.createAudit(this.buildAudit(workspaceId, objectId, actorId, 'object.restored', before, after));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'object.restored', objectId, null, { before, after }));
      return after;
    });
  }

  async listAudits(workspaceId, objectId) { return this.repository.listAudits(workspaceId, objectId); }

  async listAiActionProposals(workspaceId, status) {
    if (status && !['pending', 'approved', 'rejected'].includes(status)) throw new AtlasError('VALIDATION_ERROR', 'Unsupported AI action status', 400);
    return this.repository.listAiActionProposals(workspaceId, status);
  }

  async intelligenceReviewInbox(workspaceId) {
    const [observations, actions, jobs] = await Promise.all([
      this.repository.listIntelligenceObservations(workspaceId, 'candidate'),
      this.repository.listAiActionProposals(workspaceId, 'pending'),
      this.repository.listIntelligenceJobs(workspaceId)
    ]);
    const failedJobs = jobs.filter((job) => job.status === 'failed');
    return {
      counts: { observations: observations.length, actions: actions.length, failures: failedJobs.length },
      observations, actions, failures: failedJobs
    };
  }

  async whileYouWereGone(workspaceId,userId,since=null){const items=await this.repository.listAwarenessItems(workspaceId,userId,since);const [observations,actions]=await Promise.all([this.repository.listIntelligenceObservations(workspaceId),this.repository.listAiActionProposals(workspaceId)]);const observationMap=new Map(observations.map((item)=>[item.id,item]));const actionMap=new Map(actions.map((item)=>[item.id,item]));return items.map((item)=>({...item,observations:item.observationIds.map((id)=>observationMap.get(id)).filter(Boolean),actions:item.actionProposalIds.map((id)=>actionMap.get(id)).filter(Boolean)}));}
  async updateAwarenessStatus(workspaceId,itemId,userId,status){if(!['seen','reviewed','dismissed'].includes(status))throw new AtlasError('VALIDATION_ERROR','status must be seen, reviewed, or dismissed',400);return this.repository.updateAwarenessReceipt(workspaceId,itemId,userId,status,this.clock());}

  async searchTwin(workspaceId, query) {
    const text=required(query,'query').trim().toLowerCase();
    const [objects,observations]=await Promise.all([this.repository.listObjects(workspaceId,{}),this.repository.listIntelligenceObservations(workspaceId,'accepted')]);
    return {
      objects:objects.filter((item)=>`${item.title} ${item.type} ${JSON.stringify(item.state)}`.toLowerCase().includes(text)),
      observations:observations.filter((item)=>`${item.kind} ${JSON.stringify(item.data)}`.toLowerCase().includes(text))
    };
  }

  async conflictAlerts(workspaceId){return new ConflictScreeningService(this.repository,this.clock).screen(workspaceId);}

  async searchDocumentKnowledge(workspaceId,query,limit=20){
    const text=required(query,'query').trim();
    if(text.length<2||text.length>1000)throw new AtlasError('VALIDATION_ERROR','document knowledge query must contain 2 to 1000 characters',400);
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new AtlasError('VALIDATION_ERROR','limit must be between 1 and 50',400);
    const normalized=text.toLowerCase();const terms=[...new Set(normalized.split(/[^a-z0-9]+/).filter(term=>term.length>1))];
    const [objects,observations]=await Promise.all([this.repository.listObjects(workspaceId,{}),this.repository.listIntelligenceObservations(workspaceId)]);
    const objectMap=new Map(objects.map(object=>[object.id,object]));const matterMap=new Map(objects.filter(object=>object.dimension==='matter').map(object=>[object.id,object]));
    const score=value=>{const haystack=String(value??'').toLowerCase();const phrase=haystack.includes(normalized)?100:0;return phrase+terms.reduce((total,term)=>total+(haystack.includes(term)?1:0),0);};
    const results=[];
    for(const document of objects.filter(object=>object.dimension==='document')){
      const relevance=score(`${document.title} ${document.type} ${JSON.stringify(document.state)}`);if(!relevance)continue;
      const matterId=document.parentObjectId??document.state?.matterId??null;results.push({citationId:`document:${document.id}`,sourceObjectId:document.id,documentTitle:document.title,documentType:document.type,matterId,matterTitle:matterMap.get(matterId)?.title??null,kind:'document',data:{title:document.title,documentType:document.type},confidence:1,reviewStatus:'canonical',sourceLocation:null,relevance});
    }
    for(const observation of observations.filter(item=>item.status!=='rejected')){
      const document=objectMap.get(observation.sourceObjectId);if(document?.dimension!=='document')continue;const relevance=score(`${observation.kind} ${JSON.stringify(observation.data)} ${document.title} ${document.type}`);if(!relevance)continue;
      const matterId=observation.data?.matterId??document.parentObjectId??document.state?.matterId??null;results.push({citationId:`observation:${observation.id}`,observationId:observation.id,sourceObjectId:document.id,documentTitle:document.title,documentType:document.type,matterId,matterTitle:matterMap.get(matterId)?.title??null,kind:observation.kind,data:observation.data,confidence:observation.confidence,reviewStatus:observation.status,sourceLocation:observation.sourceLocation??null,relevance});
    }
    return results.sort((a,b)=>b.relevance-a.relevance||Number(b.reviewStatus==='accepted')-Number(a.reviewStatus==='accepted')||a.documentTitle.localeCompare(b.documentTitle)).slice(0,limit);
  }

  async searchSemanticDocumentKnowledge(workspaceId,query,queryEmbedding,model,limit=20){
    if(!Array.isArray(queryEmbedding)||!queryEmbedding.length||queryEmbedding.some(value=>!Number.isFinite(value)))throw new AtlasError('VALIDATION_ERROR','query embedding is invalid',400);
    const lexical=await this.searchDocumentKnowledge(workspaceId,query,limit);const [embeddings,chunks,observations,objects]=await Promise.all([this.repository.listDocumentKnowledgeEmbeddings(workspaceId,model),this.repository.listDocumentKnowledgeChunks(workspaceId,model),this.repository.listIntelligenceObservations(workspaceId),this.repository.listObjects(workspaceId,{})]);const observationMap=new Map(observations.filter(item=>item.status!=='rejected').map(item=>[item.id,item]));const objectMap=new Map(objects.map(item=>[item.id,item]));const matterMap=new Map(objects.filter(item=>item.dimension==='matter').map(item=>[item.id,item]));const norm=vector=>Math.sqrt(vector.reduce((total,value)=>total+value*value,0));const queryNorm=norm(queryEmbedding);const semantic=[];
    if(queryNorm)for(const item of embeddings){if(item.dimensions!==queryEmbedding.length)continue;const observation=observationMap.get(item.observationId);const document=observation?objectMap.get(observation.sourceObjectId):null;if(document?.dimension!=='document')continue;const vectorNorm=norm(item.embedding);if(!vectorNorm)continue;const similarity=item.embedding.reduce((total,value,index)=>total+value*queryEmbedding[index],0)/(vectorNorm*queryNorm);const matterId=observation.data?.matterId??document.parentObjectId??document.state?.matterId??null;semantic.push({citationId:`observation:${observation.id}`,observationId:observation.id,sourceObjectId:document.id,documentTitle:document.title,documentType:document.type,matterId,matterTitle:matterMap.get(matterId)?.title??null,kind:observation.kind,data:observation.data,confidence:observation.confidence,reviewStatus:observation.status,sourceLocation:observation.sourceLocation??null,relevance:Math.round(similarity*100000)/1000,semanticSimilarity:similarity});}
    if(queryNorm)for(const item of chunks){if(item.dimensions!==queryEmbedding.length)continue;const document=objectMap.get(item.sourceObjectId);if(document?.dimension!=='document')continue;const vectorNorm=norm(item.embedding);if(!vectorNorm)continue;const similarity=item.embedding.reduce((total,value,index)=>total+value*queryEmbedding[index],0)/(vectorNorm*queryNorm);const matterId=document.parentObjectId??document.state?.matterId??null;semantic.push({citationId:`chunk:${item.id}`,chunkId:item.id,sourceObjectId:document.id,documentTitle:document.title,documentType:document.type,matterId,matterTitle:matterMap.get(matterId)?.title??null,kind:'document_passage',encryptedContent:item.content,confidence:null,reviewStatus:'source_extraction',sourceLocation:item.sourceLocation??null,relevance:Math.round(similarity*100000)/1000,semanticSimilarity:similarity});}
    const merged=new Map([...lexical,...semantic].map(item=>[item.citationId,item]));for(const item of semantic){const current=merged.get(item.citationId);merged.set(item.citationId,current?{...current,semanticSimilarity:item.semanticSimilarity,relevance:Math.max(current.relevance,item.relevance)}:item);}return [...merged.values()].sort((a,b)=>b.relevance-a.relevance||a.documentTitle.localeCompare(b.documentTitle)).slice(0,limit);
  }

  async decideIntelligenceObservation(workspaceId,observationId,input,actorId) {
    const decision=required(input.decision,'decision');if(!['accept','reject'].includes(decision))throw new AtlasError('VALIDATION_ERROR','decision must be accept or reject',400);
    return this.repository.transaction(async(repository)=>{
      const observation=await repository.getIntelligenceObservation(workspaceId,observationId);const now=this.clock();
      if(decision==='reject')return {observation:await repository.reviewIntelligenceObservation(workspaceId,observationId,'rejected',actorId,now),result:null};
      let result=null;
      if(observation.kind==='matter_match'){
        const matterId=required(observation.data.matterId,'matterId');const matter=await repository.getObject(workspaceId,matterId);if(matter.dimension!=='matter')throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Matter match must identify a case',400);if(!observation.sourceObjectId)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Matter match requires a source object',400);
        const sourceObject=await repository.getObject(workspaceId,observation.sourceObjectId);
        result=await repository.createRelationship({id:createId('rel'),workspaceId,fromObjectId:observation.sourceObjectId,toObjectId:matterId,type:'intelligence_matched_to',attributes:{observationId,confidence:observation.confidence},createdAt:now});
        const associated=[sourceObject];
        if(['incoming_email','email'].includes(sourceObject.type)){
          const relationships=await repository.listRelationships(workspaceId);
          for(const relationship of relationships.filter(item=>item.fromObjectId===sourceObject.id&&item.type==='has_attachment')){
            const attachment=await repository.getObject(workspaceId,relationship.toObjectId);
            if(attachment.dimension==='document')associated.push(attachment);
          }
        }
        const associatedObjectIds=[];
        for(const object of associated){
          if(object.state?.matterId!==matterId){
            await repository.updateObject(workspaceId,object.id,object.version,{state:{...object.state,matterId,matterAssociation:{source:'accepted_intelligence_match',observationId,acceptedBy:actorId,acceptedAt:now}}},now);
          }
          associatedObjectIds.push(object.id);
        }
        await repository.createEvent(this.buildEvent(workspaceId,{parentObjectId:observation.sourceObjectId,relatedObjectIds:[matterId,...associatedObjectIds.filter(id=>id!==observation.sourceObjectId)],type:'intelligence.relationship.accepted',actorId,source:'atlas.intelligence.review',confidence:observation.confidence,data:{observationId,relationshipId:result.id,associatedObjectIds}}));
      }else if(['fact','deadline','duty','conflict','risk','recommendation','entity'].includes(observation.kind)){
        const entity=observation.kind==='entity';const dimension=entity?(observation.data.entityType==='organization'?'organization':'person'):'operation';
        result=await repository.createObject({id:createId('obj'),workspaceId,parentObjectId:observation.data.matterId??null,dimension,type:observation.kind,title:observation.data.title??observation.data.description??`${observation.kind} observation`,state:{...observation.data,sourceObservationId:observation.id,confidence:observation.confidence},version:1,createdAt:now,updatedAt:now,deletedAt:null});
        await repository.createEvent(this.buildEvent(workspaceId,{parentObjectId:result.id,type:'intelligence.accepted',actorId,source:'atlas.intelligence.review',confidence:observation.confidence,data:{observationId,kind:observation.kind}}));
      }
      return {observation:await repository.reviewIntelligenceObservation(workspaceId,observationId,'accepted',actorId,now),result};
    });
  }

  async decideAiActionProposal(workspaceId, proposalId, input, actorId) {
    const version = this.validateVersion(input.version);
    const decision = required(input.decision, 'decision');
    if (!['approve', 'reject'].includes(decision)) throw new AtlasError('VALIDATION_ERROR', 'decision must be approve or reject', 400);
    const outcome=await this.repository.transaction(async (repository) => {
      const proposal = await repository.getAiActionProposal(workspaceId, proposalId);
      if (decision === 'reject') return repository.decideAiActionProposal(workspaceId, proposalId, version, 'rejected', actorId, null, this.clock());
      const now = this.clock();
      const calendar=proposal.actionType==='create_calendar_event'?normalizeCalendarEventProposal(proposal.input,{defaultTargetUserId:actorId,sourceType:'native_intelligence'}):null;
      const templateProvenance=proposal.actionType==='create_document'?proposal.input.templateProvenance??null:null;
      let sourceTemplate=null;
      if(templateProvenance){
        sourceTemplate=await repository.getObject(workspaceId,required(templateProvenance.templateId,'templateProvenance.templateId'));
        if(sourceTemplate.dimension!=='document'||sourceTemplate.type!=='form_bank_template'||sourceTemplate.deletedAt||sourceTemplate.parentObjectId!==null||sourceTemplate.state?.matterId||sourceTemplate.state?.formBank!==true||sourceTemplate.state?.library!=='form_bank'||sourceTemplate.state?.scope!=='firm'||sourceTemplate.state?.status!=='active'||sourceTemplate.state?.provenance?.kind!=='form_bank_upload'||sourceTemplate.state?.securityScan?.status!=='clean'||!String(sourceTemplate.state?.storageRef??'').startsWith(`atlas-blob://${workspaceId}/`)||sourceTemplate.state?.extractionStatus!=='completed'||!['cataloged','needs_review'].includes(sourceTemplate.state?.documentAnalysis?.status))throw new AtlasError('LEGAL_FORM_TEMPLATE_NOT_AVAILABLE','The source Form Bank template is no longer active, analyzed, and available to this firm',409,{templateId:sourceTemplate.id});
        if(sourceTemplate.version!==templateProvenance.sourceVersion)throw new AtlasError('LEGAL_FORM_TEMPLATE_VERSION_CONFLICT','The source Form Bank template changed after this draft was prepared. Generate a new draft from the current form.',409,{templateId:sourceTemplate.id,expectedVersion:templateProvenance.sourceVersion,currentVersion:sourceTemplate.version});
      }
      const specifications = {
        create_task: { dimension: 'operation', type: 'task', title: proposal.input.title, state: { description: proposal.input.description, dueDate: proposal.input.dueDate, status: 'open' } },
        create_document: { dimension: 'document', type: proposal.input.documentType, title: proposal.input.title, state: { content: proposal.input.content, templateData: proposal.input.templateData??null, templateProvenance, generationProvenance:proposal.input.generationProvenance??null, sourceMatterVersion: proposal.input.sourceMatterVersion??null, reviewRequired: proposal.input.reviewRequired!==false, status: 'draft', filed: false } },
        draft_email: { dimension: 'operation', type: 'email_draft', title: proposal.input.subject, state: { recipients: proposal.input.recipients, body: proposal.input.body, status: 'draft', sent: false } },
        create_social_post: { dimension: 'operation', type: 'social_post_draft', title: proposal.input.title, state: { content: proposal.input.content, hashtags: proposal.input.hashtags??[], networks: proposal.input.networks??[], topic: proposal.input.topic??null, status: 'draft', approvedForEditing: true, published: false, publishingEnabled: false } },
        create_calendar_event: {dimension:'operation',type:'calendar_event',title:calendar?.title,state:{...calendar,status:'confirmed',approvedBy:actorId,approvedAt:now,externalCalendar:{provider:'microsoft',status:'pending',targetUserId:calendar?.targetUserId??actorId}}}
      };
      const specification = specifications[proposal.actionType];
      if (!specification) throw new AtlasError('AI_ACTION_TYPE_UNSUPPORTED', 'AI action type is not supported', 400);
      const created = await repository.createObject({
        id: createId('obj'), workspaceId, parentObjectId: calendar?.matterId??proposal.input.matterId,
        dimension: specification.dimension, type: specification.type, title: specification.title,
        state: { ...specification.state, createdFromAiProposalId: proposal.id },
        createdAt: now, updatedAt: now, deletedAt: null, version: 1
      });
      if(sourceTemplate)await repository.createRelationship({id:createId('rel'),workspaceId,fromObjectId:created.id,toObjectId:sourceTemplate.id,type:'derived_from_form_template',attributes:{sourceVersion:templateProvenance.sourceVersion,formVersion:templateProvenance.formVersion??null,sourceChunkIds:templateProvenance.sourceChunkIds??[]},createdAt:now});
      await repository.createEvent(this.buildEvent(workspaceId, { parentObjectId: created.id, relatedObjectIds:sourceTemplate?[sourceTemplate.id]:[], type: sourceTemplate?'document.draft_created_from_form':'object.created', actorId, source: 'atlas.ai.approval', data: { objectType: created.type, actionType: proposal.actionType, proposalId,templateId:sourceTemplate?.id??null,templateVersion:templateProvenance?.sourceVersion??null } }));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'ai_action.approved', created.id, null, { proposalId, actionType: proposal.actionType, object: created }));
      const decided = await repository.decideAiActionProposal(workspaceId, proposalId, version, 'approved', actorId, created.id, now);
      return { proposal: decided, result: created };
    });
    if(outcome?.result?.type!=='calendar_event')return outcome;
    if(!this.calendarPublisher)return {...outcome,calendarDelivery:{status:'pending',provider:'microsoft',reason:'publisher_unavailable'}};
    try{const delivery=await this.calendarPublisher({workspaceId,calendarEvent:outcome.result,targetUserId:outcome.result.state.targetUserId??actorId,actorId});return {...outcome,result:delivery.calendarEvent??outcome.result,calendarDelivery:{status:delivery.status,provider:delivery.provider??'microsoft',reason:delivery.reason??null}};}catch(error){return {...outcome,calendarDelivery:{status:'pending',provider:'microsoft',reason:error.code??'CALENDAR_PUBLICATION_FAILED'}};}
  }

  async createRelationship(workspaceId, input) {
    const fromObjectId = required(input.fromObjectId, 'fromObjectId');
    const toObjectId = required(input.toObjectId, 'toObjectId');
    if (fromObjectId === toObjectId) {
      throw new AtlasError('SELF_RELATIONSHIP', 'An object cannot relate to itself', 400);
    }
    return this.repository.transaction(async(repository)=>{
      const relationship=await repository.createRelationship({
        id: createId('rel'),workspaceId,fromObjectId,toObjectId,type:required(input.type,'type'),attributes:input.attributes??{},createdAt:this.clock()
      });
      const event=await repository.createEvent(this.buildEvent(workspaceId,{parentObjectId:fromObjectId,relatedObjectIds:[toObjectId],type:'relationship.created',actorId:input.actorId??'system',source:'atlas',data:{relationshipId:relationship.id,relationshipType:relationship.type}}));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId,'relationship.created',fromObjectId,event.id,{relationship}));
      return relationship;
    });
  }

  buildEvent(workspaceId, input) {
    const confidence = input.confidence ?? 1;
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new AtlasError('VALIDATION_ERROR', 'confidence must be between 0 and 1', 400);
    }
    return {
      id: createId('evt'),
      workspaceId,
      parentObjectId: input.parentObjectId ?? null,
      type: required(input.type, 'type'),
      actorId: required(input.actorId, 'actorId'),
      source: required(input.source, 'source'),
      confidence,
      visibility: input.visibility ?? 'workspace',
      relatedObjectIds: input.relatedObjectIds ?? [],
      data: input.data ?? {},
      occurredAt: input.occurredAt ?? this.clock(),
      createdAt: this.clock()
    };
  }

  async createEvent(workspaceId, input) {
    return this.repository.transaction(async (repository) => {
      const event = await repository.createEvent(this.buildEvent(workspaceId, input));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, event.type || 'timeline.event', event.parentObjectId, event.id, { event }));
      return event;
    });
  }

  async listEvents(workspaceId, parentObjectId) {
    return this.repository.listEvents(workspaceId, parentObjectId);
  }

  async expandGraph(workspaceId, objectId) {
    const root = await this.repository.getObject(workspaceId, objectId);
    const relationships = (await this.repository.listRelationships(workspaceId))
      .filter((item) => item.fromObjectId === objectId || item.toObjectId === objectId);
    const ids = new Set(relationships.flatMap((item) => [item.fromObjectId, item.toObjectId]));
    ids.delete(objectId);
    return {
      root,
      nodes: await Promise.all([...ids].map((id) => this.repository.getObject(workspaceId, id))),
      relationships
    };
  }

  async matterHealth(workspaceId, matterId) {
    const matter = await this.repository.getObject(workspaceId, matterId);
    if (matter.dimension !== 'matter') throw new AtlasError('NOT_A_MATTER', 'Object is not a matter', 400);
    const reasons = [];
    const objects=await this.repository.listObjects(workspaceId,{});
    const byId=new Map(objects.map((object)=>[object.id,object]));
    const connected=objects.filter((object)=>object.id!==matterId&&canonicalMatterId(object,byId)===matterId);
    if (!matter.state.clientId) reasons.push({ code: 'MISSING_CLIENT', deduction: 15 });
    if (!matter.state.nextDeadline&&!connected.some((object)=>object.type==='deadline')) reasons.push({ code: 'MISSING_DEADLINE', deduction: 10 });
    if (!matter.state.ownerId) reasons.push({ code: 'MISSING_OWNER', deduction: 10 });
    for(const object of connected.filter((item)=>item.type==='risk'||item.type==='conflict')) reasons.push({code:object.type==='risk'?'INTELLIGENCE_RISK':'INTELLIGENCE_CONFLICT',deduction:10,objectId:object.id});
    const score = Math.max(0, 100 - reasons.reduce((sum, reason) => sum + reason.deduction, 0));
    return { matterId, score, status: score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red', reasons };
  }
}
