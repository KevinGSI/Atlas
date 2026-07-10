import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';

const dimensions = new Set(['matter', 'client', 'evidence', 'document', 'person', 'organization', 'operation']);

export class AtlasService {
  constructor(repository, clock = () => new Date().toISOString()) {
    this.repository = repository;
    this.clock = clock;
  }

  createWorkspace(input) {
    const now = this.clock();
    return this.repository.createWorkspace({
      id: createId('wsp'),
      name: required(input.name, 'name'),
      createdAt: now,
      updatedAt: now,
      version: 1
    });
  }

  getWorkspace(id) { return this.repository.getWorkspace(id); }

  createObject(workspaceId, input) {
    const dimension = required(input.dimension, 'dimension');
    if (!dimensions.has(dimension)) {
      throw new AtlasError('VALIDATION_ERROR', 'Unsupported dimension', 400, { dimension });
    }
    const now = this.clock();
    const object = this.repository.createObject({
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
    this.createEvent(workspaceId, {
      parentObjectId: object.id,
      type: 'object.created',
      actorId: input.actorId ?? 'system',
      source: 'atlas',
      confidence: 1,
      visibility: 'workspace',
      data: { objectType: object.type }
    });
    return object;
  }

  getObject(workspaceId, id) { return this.repository.getObject(workspaceId, id); }
  listObjects(workspaceId, filters) { return this.repository.listObjects(workspaceId, filters); }

  createRelationship(workspaceId, input) {
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

  createEvent(workspaceId, input) {
    const confidence = input.confidence ?? 1;
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new AtlasError('VALIDATION_ERROR', 'confidence must be between 0 and 1', 400);
    }
    return this.repository.createEvent({
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
    });
  }

  listEvents(workspaceId, parentObjectId) {
    return this.repository.listEvents(workspaceId, parentObjectId);
  }

  expandGraph(workspaceId, objectId) {
    const root = this.repository.getObject(workspaceId, objectId);
    const relationships = this.repository.listRelationships(workspaceId)
      .filter((item) => item.fromObjectId === objectId || item.toObjectId === objectId);
    const ids = new Set(relationships.flatMap((item) => [item.fromObjectId, item.toObjectId]));
    ids.delete(objectId);
    return {
      root,
      nodes: [...ids].map((id) => this.repository.getObject(workspaceId, id)),
      relationships
    };
  }

  matterHealth(workspaceId, matterId) {
    const matter = this.repository.getObject(workspaceId, matterId);
    if (matter.dimension !== 'matter') throw new AtlasError('NOT_A_MATTER', 'Object is not a matter', 400);
    const reasons = [];
    if (!matter.state.clientId) reasons.push({ code: 'MISSING_CLIENT', deduction: 15 });
    if (!matter.state.nextDeadline) reasons.push({ code: 'MISSING_DEADLINE', deduction: 10 });
    if (!matter.state.ownerId) reasons.push({ code: 'MISSING_OWNER', deduction: 10 });
    const score = Math.max(0, 100 - reasons.reduce((sum, reason) => sum + reason.deduction, 0));
    return { matterId, score, status: score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red', reasons };
  }
}
