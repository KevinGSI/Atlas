import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';

const dimensions = new Set(['matter', 'client', 'evidence', 'document', 'person', 'organization', 'operation']);

export class AtlasService {
  constructor(repository, clock = () => new Date().toISOString()) {
    this.repository = repository;
    this.clock = clock;
  }

  async createWorkspace(input, ownerUserId = null) {
    const now = this.clock();
    return this.repository.transaction(async (repository) => {
      const workspace = await repository.createWorkspace({
        id: createId('wsp'), name: required(input.name, 'name'), createdAt: now, updatedAt: now, version: 1
      });
      if (ownerUserId) await repository.createMembership({
        id: createId('mem'), workspaceId: workspace.id, userId: ownerUserId, role: 'owner', createdAt: now
      });
      return workspace;
    });
  }

  buildIntelligenceJob(workspaceId, triggerType, objectId, eventId, payload) {
    const now = this.clock();
    return { id: createId('inj'), workspaceId, triggerType, objectId, eventId, status: 'pending', attempts: 0, payload, result: null, provider: null, errorCode: null, availableAt: now, lockedAt: null, createdAt: now, completedAt: null };
  }

  async getWorkspace(id) { return this.repository.getWorkspace(id); }

  async createObject(workspaceId, input) {
    const dimension = required(input.dimension, 'dimension');
    if (!dimensions.has(dimension)) {
      throw new AtlasError('VALIDATION_ERROR', 'Unsupported dimension', 400, { dimension });
    }
    const now = this.clock();
    return this.repository.transaction(async (repository) => {
      const object = await repository.createObject({
        id: createId('obj'),
        workspaceId,
        parentObjectId: input.parentObjectId ?? null,
        dimension,
        type: required(input.type, 'type'),
        title: required(input.title, 'title'),
        state: input.state ?? {},
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

  async searchTwin(workspaceId, query) {
    const text=required(query,'query').trim().toLowerCase();
    const [objects,observations]=await Promise.all([this.repository.listObjects(workspaceId,{}),this.repository.listIntelligenceObservations(workspaceId,'accepted')]);
    return {
      objects:objects.filter((item)=>`${item.title} ${item.type} ${JSON.stringify(item.state)}`.toLowerCase().includes(text)),
      observations:observations.filter((item)=>`${item.kind} ${JSON.stringify(item.data)}`.toLowerCase().includes(text))
    };
  }

  async decideIntelligenceObservation(workspaceId,observationId,input,actorId) {
    const decision=required(input.decision,'decision');if(!['accept','reject'].includes(decision))throw new AtlasError('VALIDATION_ERROR','decision must be accept or reject',400);
    return this.repository.transaction(async(repository)=>{
      const observation=await repository.getIntelligenceObservation(workspaceId,observationId);const now=this.clock();
      if(decision==='reject')return {observation:await repository.reviewIntelligenceObservation(workspaceId,observationId,'rejected',actorId,now),result:null};
      let result=null;
      if(observation.kind==='matter_match'){
        const matterId=required(observation.data.matterId,'matterId');await repository.getObject(workspaceId,matterId);if(!observation.sourceObjectId)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Matter match requires a source object',400);
        result=await repository.createRelationship({id:createId('rel'),workspaceId,fromObjectId:observation.sourceObjectId,toObjectId:matterId,type:'intelligence_matched_to',attributes:{observationId,confidence:observation.confidence},createdAt:now});
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
    return this.repository.transaction(async (repository) => {
      const proposal = await repository.getAiActionProposal(workspaceId, proposalId);
      if (decision === 'reject') return repository.decideAiActionProposal(workspaceId, proposalId, version, 'rejected', actorId, null, this.clock());
      const now = this.clock();
      const specifications = {
        create_task: { dimension: 'operation', type: 'task', title: proposal.input.title, state: { description: proposal.input.description, dueDate: proposal.input.dueDate, status: 'open' } },
        create_document: { dimension: 'document', type: proposal.input.documentType, title: proposal.input.title, state: { content: proposal.input.content, status: 'draft', filed: false } },
        draft_email: { dimension: 'operation', type: 'email_draft', title: proposal.input.subject, state: { recipients: proposal.input.recipients, body: proposal.input.body, status: 'draft', sent: false } }
      };
      const specification = specifications[proposal.actionType];
      if (!specification) throw new AtlasError('AI_ACTION_TYPE_UNSUPPORTED', 'AI action type is not supported', 400);
      const created = await repository.createObject({
        id: createId('obj'), workspaceId, parentObjectId: proposal.input.matterId,
        dimension: specification.dimension, type: specification.type, title: specification.title,
        state: { ...specification.state, createdFromAiProposalId: proposal.id },
        createdAt: now, updatedAt: now, deletedAt: null, version: 1
      });
      await repository.createEvent(this.buildEvent(workspaceId, { parentObjectId: created.id, type: 'object.created', actorId, source: 'atlas.ai.approval', data: { objectType: created.type, actionType: proposal.actionType, proposalId } }));
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'ai_action.approved', created.id, null, { proposalId, actionType: proposal.actionType, object: created }));
      const decided = await repository.decideAiActionProposal(workspaceId, proposalId, version, 'approved', actorId, created.id, now);
      return { proposal: decided, result: created };
    });
  }

  async createRelationship(workspaceId, input) {
    const fromObjectId = required(input.fromObjectId, 'fromObjectId');
    const toObjectId = required(input.toObjectId, 'toObjectId');
    if (fromObjectId === toObjectId) {
      throw new AtlasError('SELF_RELATIONSHIP', 'An object cannot relate to itself', 400);
    }
    return this.repository.createRelationship({
      id: createId('rel'),
      workspaceId,
      fromObjectId,
      toObjectId,
      type: required(input.type, 'type'),
      attributes: input.attributes ?? {},
      createdAt: this.clock()
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
      await repository.createIntelligenceJob(this.buildIntelligenceJob(workspaceId, 'timeline.event', event.parentObjectId, event.id, { event }));
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
    const connected=(await this.repository.listObjects(workspaceId,{})).filter((object)=>object.parentObjectId===matterId);
    if (!matter.state.clientId) reasons.push({ code: 'MISSING_CLIENT', deduction: 15 });
    if (!matter.state.nextDeadline&&!connected.some((object)=>object.type==='deadline')) reasons.push({ code: 'MISSING_DEADLINE', deduction: 10 });
    if (!matter.state.ownerId) reasons.push({ code: 'MISSING_OWNER', deduction: 10 });
    for(const object of connected.filter((item)=>item.type==='risk'||item.type==='conflict')) reasons.push({code:object.type==='risk'?'INTELLIGENCE_RISK':'INTELLIGENCE_CONFLICT',deduction:10,objectId:object.id});
    const score = Math.max(0, 100 - reasons.reduce((sum, reason) => sum + reason.deduction, 0));
    return { matterId, score, status: score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red', reasons };
  }
}
