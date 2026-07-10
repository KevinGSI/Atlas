import { AtlasError } from './errors.js';

function clone(value) {
  return structuredClone(value);
}

export class InMemoryRepository {
  #workspaces = new Map();
  #objects = new Map();
  #relationships = new Map();
  #events = new Map();
  #users = new Map();
  #memberships = new Map();
  #audits = new Map();
  #refreshSessions = new Map();
  #passwordResets = new Map();
  #loginThrottles = new Map();
  #aiRuns = new Map();
  #aiConversations = new Map();
  #aiMessages = new Map();
  #aiActionProposals = new Map();
  #intelligenceJobs = new Map();
  #intelligenceObservations = new Map();

  async transaction(work) {
    const snapshot = [this.#workspaces, this.#objects, this.#relationships, this.#events, this.#users, this.#memberships, this.#audits, this.#refreshSessions, this.#passwordResets, this.#loginThrottles, this.#aiRuns, this.#aiConversations, this.#aiMessages, this.#aiActionProposals, this.#intelligenceJobs, this.#intelligenceObservations]
      .map((map) => new Map([...map].map(([key, value]) => [key, clone(value)])));
    try { return await work(this); }
    catch (error) {
      [this.#workspaces, this.#objects, this.#relationships, this.#events, this.#users, this.#memberships, this.#audits, this.#refreshSessions, this.#passwordResets, this.#loginThrottles, this.#aiRuns, this.#aiConversations, this.#aiMessages, this.#aiActionProposals, this.#intelligenceJobs, this.#intelligenceObservations] = snapshot;
      throw error;
    }
  }

  createWorkspace(workspace) {
    this.#workspaces.set(workspace.id, clone(workspace));
    return clone(workspace);
  }

  getWorkspace(id) {
    const workspace = this.#workspaces.get(id);
    if (!workspace) throw new AtlasError('WORKSPACE_NOT_FOUND', 'Workspace not found', 404);
    return clone(workspace);
  }

  createObject(object) {
    this.getWorkspace(object.workspaceId);
    if (object.parentObjectId) this.getObject(object.workspaceId, object.parentObjectId);
    this.#objects.set(object.id, clone(object));
    return clone(object);
  }

  getObject(workspaceId, id, options = {}) {
    const object = this.#objects.get(id);
    if (!object || object.workspaceId !== workspaceId || (object.deletedAt && !options.includeDeleted)) {
      throw new AtlasError('OBJECT_NOT_FOUND', 'Object not found', 404);
    }
    return clone(object);
  }

  updateObject(workspaceId, id, expectedVersion, changes, updatedAt) {
    const current = this.getObject(workspaceId, id);
    if (current.version !== expectedVersion) throw new AtlasError('VERSION_CONFLICT', 'Object version is stale', 409, { currentVersion: current.version });
    const updated = { ...current, ...changes, state: changes.state ?? current.state, version: current.version + 1, updatedAt };
    this.#objects.set(id, clone(updated));
    return clone(updated);
  }

  softDeleteObject(workspaceId, id, expectedVersion, deletedAt) {
    const current = this.getObject(workspaceId, id);
    if (current.version !== expectedVersion) throw new AtlasError('VERSION_CONFLICT', 'Object version is stale', 409, { currentVersion: current.version });
    const updated = { ...current, deletedAt, updatedAt: deletedAt, version: current.version + 1 };
    this.#objects.set(id, clone(updated));
    return clone(updated);
  }

  restoreObject(workspaceId, id, expectedVersion, updatedAt) {
    const current = this.getObject(workspaceId, id, { includeDeleted: true });
    if (!current.deletedAt) throw new AtlasError('OBJECT_NOT_DELETED', 'Object is not deleted', 409);
    if (current.version !== expectedVersion) throw new AtlasError('VERSION_CONFLICT', 'Object version is stale', 409, { currentVersion: current.version });
    const updated = { ...current, deletedAt: null, updatedAt, version: current.version + 1 };
    this.#objects.set(id, clone(updated));
    return clone(updated);
  }

  listObjects(workspaceId, filters = {}) {
    this.getWorkspace(workspaceId);
    return [...this.#objects.values()]
      .filter((item) => item.workspaceId === workspaceId && !item.deletedAt)
      .filter((item) => !filters.type || item.type === filters.type)
      .filter((item) => !filters.dimension || item.dimension === filters.dimension)
      .map(clone);
  }

  createRelationship(relationship) {
    this.getObject(relationship.workspaceId, relationship.fromObjectId);
    this.getObject(relationship.workspaceId, relationship.toObjectId);
    const duplicate = [...this.#relationships.values()].some((item) =>
      item.workspaceId === relationship.workspaceId &&
      item.fromObjectId === relationship.fromObjectId &&
      item.toObjectId === relationship.toObjectId &&
      item.type === relationship.type);
    if (duplicate) throw new AtlasError('RELATIONSHIP_EXISTS', 'Relationship already exists', 409);
    this.#relationships.set(relationship.id, clone(relationship));
    return clone(relationship);
  }

  listRelationships(workspaceId) {
    return [...this.#relationships.values()]
      .filter((item) => item.workspaceId === workspaceId)
      .map(clone);
  }

  createEvent(event) {
    this.getWorkspace(event.workspaceId);
    if (event.parentObjectId) this.getObject(event.workspaceId, event.parentObjectId);
    this.#events.set(event.id, clone(event));
    return clone(event);
  }

  listEvents(workspaceId, parentObjectId) {
    this.getWorkspace(workspaceId);
    return [...this.#events.values()]
      .filter((item) => item.workspaceId === workspaceId)
      .filter((item) => !parentObjectId || item.parentObjectId === parentObjectId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map(clone);
  }

  createUser(user) {
    if ([...this.#users.values()].some((item) => item.email === user.email)) {
      throw new AtlasError('EMAIL_EXISTS', 'Email is already registered', 409);
    }
    this.#users.set(user.id, clone(user));
    return clone(user);
  }

  getUserByEmail(email) {
    const user = [...this.#users.values()].find((item) => item.email === email);
    if (!user) throw new AtlasError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    return clone(user);
  }

  getUser(id) {
    const user = this.#users.get(id);
    if (!user) throw new AtlasError('USER_NOT_FOUND', 'User not found', 404);
    return clone(user);
  }

  getLoginThrottle(principalHash) {
    const throttle = this.#loginThrottles.get(principalHash);
    return throttle ? clone(throttle) : null;
  }

  recordLoginFailure(principalHash, now, windowSeconds, threshold, lockSeconds) {
    const current = this.#loginThrottles.get(principalHash);
    const nowMs = new Date(now).getTime();
    const reset = !current || nowMs - new Date(current.windowStartedAt).getTime() >= windowSeconds * 1000
      || (current.lockedUntil && new Date(current.lockedUntil).getTime() <= nowMs);
    const failedCount = reset ? 1 : current.failedCount + 1;
    const throttle = {
      principalHash, failedCount, windowStartedAt: reset ? now : current.windowStartedAt,
      lockedUntil: failedCount >= threshold ? new Date(nowMs + lockSeconds * 1000).toISOString() : null,
      updatedAt: now
    };
    this.#loginThrottles.set(principalHash, throttle);
    return clone(throttle);
  }

  clearLoginThrottle(principalHash) {
    this.#loginThrottles.delete(principalHash);
  }

  updateUserPassword(id, passwordHash) {
    const user = this.getUser(id);
    const updated = { ...user, passwordHash };
    this.#users.set(id, updated);
    return clone(updated);
  }

  createRefreshSession(session) {
    this.#refreshSessions.set(session.id, clone(session));
    return clone(session);
  }

  getRefreshSessionByHash(tokenHash) {
    const session = [...this.#refreshSessions.values()].find((item) => item.tokenHash === tokenHash);
    if (!session) throw new AtlasError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
    return clone(session);
  }

  getRefreshSession(userId, id) {
    const session = this.#refreshSessions.get(id);
    if (!session || session.userId !== userId) throw new AtlasError('SESSION_NOT_FOUND', 'Session not found', 404);
    return clone(session);
  }

  listRefreshSessions(userId) {
    return [...this.#refreshSessions.values()]
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  consumeRefreshSession(id, usedAt, replacedBySessionId) {
    const session = this.#refreshSessions.get(id);
    if (!session || session.usedAt || session.revokedAt) throw new AtlasError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
    const updated = { ...session, usedAt, replacedBySessionId };
    this.#refreshSessions.set(id, updated);
    return clone(updated);
  }

  revokeRefreshSession(id, revokedAt) {
    const session = this.#refreshSessions.get(id);
    if (!session) throw new AtlasError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
    const updated = { ...session, revokedAt: session.revokedAt ?? revokedAt };
    this.#refreshSessions.set(id, updated);
    return clone(updated);
  }

  revokeRefreshFamily(familyId, revokedAt) {
    for (const [id, session] of this.#refreshSessions) {
      if (session.familyId === familyId && !session.revokedAt) this.#refreshSessions.set(id, { ...session, revokedAt });
    }
  }

  revokeRefreshSessionsForUser(userId, revokedAt) {
    for (const [id, session] of this.#refreshSessions) {
      if (session.userId === userId && !session.revokedAt) this.#refreshSessions.set(id, { ...session, revokedAt });
    }
  }

  createPasswordReset(reset) {
    this.#passwordResets.set(reset.id, clone(reset));
    return clone(reset);
  }

  getPasswordResetByHash(tokenHash) {
    const reset = [...this.#passwordResets.values()].find((item) => item.tokenHash === tokenHash);
    if (!reset) throw new AtlasError('INVALID_PASSWORD_RESET', 'Invalid password reset token', 401);
    return clone(reset);
  }

  consumePasswordReset(id, usedAt) {
    const reset = this.#passwordResets.get(id);
    if (!reset || reset.usedAt) throw new AtlasError('INVALID_PASSWORD_RESET', 'Invalid password reset token', 401);
    const updated = { ...reset, usedAt };
    this.#passwordResets.set(id, updated);
    return clone(updated);
  }

  invalidatePasswordResetsForUser(userId, usedAt) {
    for (const [id, reset] of this.#passwordResets) {
      if (reset.userId === userId && !reset.usedAt) this.#passwordResets.set(id, { ...reset, usedAt });
    }
  }

  createMembership(membership) {
    const key = `${membership.workspaceId}:${membership.userId}`;
    if (this.#memberships.has(key)) throw new AtlasError('MEMBERSHIP_EXISTS', 'Membership already exists', 409);
    this.getWorkspace(membership.workspaceId);
    this.getUser(membership.userId);
    this.#memberships.set(key, clone(membership));
    return clone(membership);
  }

  getMembership(workspaceId, userId) {
    const membership = this.#memberships.get(`${workspaceId}:${userId}`);
    if (!membership) throw new AtlasError('ACCESS_DENIED', 'Workspace access denied', 403);
    return clone(membership);
  }

  listMemberships(workspaceId) {
    return [...this.#memberships.values()].filter((item) => item.workspaceId === workspaceId).map(clone);
  }

  createAudit(audit) {
    this.#audits.set(audit.id, clone(audit));
    return clone(audit);
  }

  listAudits(workspaceId, objectId) {
    this.getWorkspace(workspaceId);
    return [...this.#audits.values()]
      .filter((item) => item.workspaceId === workspaceId)
      .filter((item) => !objectId || item.objectId === objectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }

  createAiRun(run) {
    this.getWorkspace(run.workspaceId);
    this.#aiRuns.set(run.id, clone(run));
    return clone(run);
  }

  listAiRuns(workspaceId, limit = 50) {
    this.getWorkspace(workspaceId);
    return [...this.#aiRuns.values()].filter((run) => run.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone);
  }

  createAiConversation(value) { this.getWorkspace(value.workspaceId); this.#aiConversations.set(value.id, clone(value)); return clone(value); }
  getAiConversation(workspaceId, actorId, id) {
    const value = this.#aiConversations.get(id);
    if (!value || value.workspaceId !== workspaceId || value.actorId !== actorId) throw new AtlasError('AI_CONVERSATION_NOT_FOUND', 'AI conversation not found', 404);
    return clone(value);
  }
  listAiConversations(workspaceId, actorId) { return [...this.#aiConversations.values()].filter((x) => x.workspaceId === workspaceId && x.actorId === actorId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(clone); }
  createAiMessage(value) { this.getAiConversation(value.workspaceId, value.actorId, value.conversationId); this.#aiMessages.set(value.id, clone(value)); return clone(value); }
  listAiMessages(workspaceId, actorId, conversationId) { this.getAiConversation(workspaceId, actorId, conversationId); return [...this.#aiMessages.values()].filter((x)=>x.conversationId===conversationId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(clone); }
  createAiActionProposal(value) { this.getWorkspace(value.workspaceId); this.#aiActionProposals.set(value.id, clone(value)); return clone(value); }
  getAiActionProposal(workspaceId, id) { const value=this.#aiActionProposals.get(id); if(!value||value.workspaceId!==workspaceId) throw new AtlasError('AI_ACTION_NOT_FOUND','AI action proposal not found',404); return clone(value); }
  listAiActionProposals(workspaceId, status) { return [...this.#aiActionProposals.values()].filter((x)=>x.workspaceId===workspaceId&&(!status||x.status===status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(clone); }
  decideAiActionProposal(workspaceId,id,version,status,decidedBy,resultObjectId,decidedAt) { const value=this.getAiActionProposal(workspaceId,id); if(value.status!=='pending') throw new AtlasError('AI_ACTION_ALREADY_DECIDED','AI action proposal has already been decided',409); if(value.version!==version) throw new AtlasError('VERSION_CONFLICT','AI action proposal version is stale',409,{currentVersion:value.version}); const updated={...value,status,decidedBy,resultObjectId,decidedAt,version:value.version+1}; this.#aiActionProposals.set(id,clone(updated)); return clone(updated); }
  createIntelligenceJob(value) { this.#intelligenceJobs.set(value.id,clone(value)); return clone(value); }
  listIntelligenceJobs(workspaceId) { return [...this.#intelligenceJobs.values()].filter((x)=>x.workspaceId===workspaceId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(clone); }
  claimIntelligenceJob(now) { const value=[...this.#intelligenceJobs.values()].find((x)=>x.status==='pending'&&x.availableAt<=now); if(!value)return null; const claimed={...value,status:'processing',attempts:value.attempts+1,lockedAt:now}; this.#intelligenceJobs.set(value.id,claimed); return clone(claimed); }
  completeIntelligenceJob(id,result,provider,now) { const value=this.#intelligenceJobs.get(id); const completed={...value,status:'completed',result,provider,errorCode:null,completedAt:now}; this.#intelligenceJobs.set(id,completed); return clone(completed); }
  failIntelligenceJob(id,errorCode,now,maxAttempts) { const value=this.#intelligenceJobs.get(id); const failed={...value,status:value.attempts>=maxAttempts?'failed':'pending',errorCode,lockedAt:null,availableAt:now}; this.#intelligenceJobs.set(id,failed); return clone(failed); }
  createIntelligenceObservation(value) { this.#intelligenceObservations.set(value.id,clone(value));return clone(value); }
  listIntelligenceObservations(workspaceId,status) { return [...this.#intelligenceObservations.values()].filter((x)=>x.workspaceId===workspaceId&&(!status||x.status===status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(clone); }
}
