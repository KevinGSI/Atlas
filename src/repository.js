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
  #subscriptions = new Map();
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
  #ingestionRecords = new Map();
  #cmsAuthorizations = new Map();
  #cmsConnections = new Map();
  #cmsRecordLinks = new Map();
  #encryptedSecrets = new Map();
  #awarenessItems = new Map();
  #awarenessReceipts = new Map();
  #automationMarkers = new Set();
  #schedulerLeases = new Map();
  #canonicalEvents = new Map();
  #canonicalDeliveries = new Map();

  async transaction(work) {
    const markerSnapshot=new Set(this.#automationMarkers);const leaseSnapshot=new Map(this.#schedulerLeases);const canonicalEventSnapshot=new Map(this.#canonicalEvents);const canonicalDeliverySnapshot=new Map(this.#canonicalDeliveries);
    const snapshot = [this.#workspaces, this.#objects, this.#relationships, this.#events, this.#users, this.#memberships, this.#subscriptions, this.#audits, this.#refreshSessions, this.#passwordResets, this.#loginThrottles, this.#aiRuns, this.#aiConversations, this.#aiMessages, this.#aiActionProposals, this.#intelligenceJobs, this.#intelligenceObservations, this.#ingestionRecords,this.#cmsAuthorizations,this.#cmsConnections,this.#cmsRecordLinks,this.#encryptedSecrets,this.#awarenessItems,this.#awarenessReceipts]
      .map((map) => new Map([...map].map(([key, value]) => [key, clone(value)])));
    const beforeObjects=new Map([...this.#objects].map(([key,value])=>[key,JSON.stringify(value)]));const beforeRelationships=new Set(this.#relationships.keys());const beforeEvents=new Set(this.#canonicalEvents.keys());
    try { const result=await work(this);const mutated=new Set();for(const [id,value] of this.#objects)if(beforeObjects.get(id)!==JSON.stringify(value))mutated.add(id);for(const [id,relationship] of this.#relationships)if(!beforeRelationships.has(id)){mutated.add(relationship.fromObjectId);mutated.add(relationship.toObjectId);}const covered=new Set([...this.#canonicalEvents].filter(([id])=>!beforeEvents.has(id)).flatMap(([,event])=>event.affectedObjectIds));const missing=[...mutated].filter((id)=>!covered.has(id));if(missing.length)throw new AtlasError('CANONICAL_EVENT_REQUIRED','Material canonical mutations require event coverage',500,{objectIds:missing});return result; }
    catch (error) {
      [this.#workspaces, this.#objects, this.#relationships, this.#events, this.#users, this.#memberships, this.#subscriptions, this.#audits, this.#refreshSessions, this.#passwordResets, this.#loginThrottles, this.#aiRuns, this.#aiConversations, this.#aiMessages, this.#aiActionProposals, this.#intelligenceJobs, this.#intelligenceObservations, this.#ingestionRecords,this.#cmsAuthorizations,this.#cmsConnections,this.#cmsRecordLinks,this.#encryptedSecrets,this.#awarenessItems,this.#awarenessReceipts] = snapshot;
      this.#automationMarkers=markerSnapshot;this.#schedulerLeases=leaseSnapshot;this.#canonicalEvents=canonicalEventSnapshot;this.#canonicalDeliveries=canonicalDeliverySnapshot;
      throw error;
    }
  }

  createWorkspace(workspace) {
    this.#workspaces.set(workspace.id, clone(workspace));
    return clone(workspace);
  }
  listWorkspaces(){return [...this.#workspaces.values()].map(clone);}

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
    const affectedObjectIds=[...new Set([event.parentObjectId,...(event.relatedObjectIds??[])].filter(Boolean))];
    for(const objectId of affectedObjectIds)this.getObject(event.workspaceId,objectId,{includeDeleted:true});
    this.#canonicalEvents.set(event.id,clone({id:event.id,workspaceId:event.workspaceId,eventType:event.type,actorId:event.actorId,source:event.source,causationId:event.data?.causationId??null,correlationId:event.data?.correlationId??event.id,payload:event.data,occurredAt:event.occurredAt,createdAt:event.createdAt,affectedObjectIds}));
    return clone(event);
  }
  listCanonicalEventsForConsumer(consumerId,limit=100,now=new Date().toISOString()){return [...this.#canonicalEvents.values()].filter((event)=>{const delivery=this.#canonicalDeliveries.get(`${event.id}:${consumerId}`);return !delivery||(delivery.status==='failed'&&delivery.availableAt<=now);}).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).slice(0,limit).map(clone);}
  claimCanonicalEventDelivery(eventId,consumerId,now){const key=`${eventId}:${consumerId}`;const current=this.#canonicalDeliveries.get(key);if(current&&!['failed'].includes(current.status))return null;const delivery={eventId,consumerId,status:'processing',attempts:(current?.attempts??0)+1,availableAt:now,lockedAt:now,completedAt:null,errorCode:null};this.#canonicalDeliveries.set(key,delivery);return clone(delivery);}
  completeCanonicalEventDelivery(eventId,consumerId,now){const key=`${eventId}:${consumerId}`;const current=this.#canonicalDeliveries.get(key);if(!current||current.status!=='processing')return null;const result={...current,status:'completed',completedAt:now};this.#canonicalDeliveries.set(key,result);return clone(result);}
  failCanonicalEventDelivery(eventId,consumerId,errorCode,maxAttempts,now){const key=`${eventId}:${consumerId}`;const current=this.#canonicalDeliveries.get(key);const result={...current,status:current.attempts>=maxAttempts?'dead_letter':'failed',availableAt:now,lockedAt:null,errorCode};this.#canonicalDeliveries.set(key,result);return clone(result);}

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
  listMembershipsForUser(userId){return [...this.#memberships.values()].filter(item=>item.userId===userId).map(clone);}
  createSubscription(value){this.getWorkspace(value.workspaceId);if(this.#subscriptions.has(value.workspaceId))throw new AtlasError('SUBSCRIPTION_EXISTS','Firm subscription already exists',409);this.#subscriptions.set(value.workspaceId,clone(value));return clone(value);}
  getSubscription(workspaceId){this.getWorkspace(workspaceId);const value=this.#subscriptions.get(workspaceId);if(!value)throw new AtlasError('SUBSCRIPTION_NOT_FOUND','Firm subscription not found',404);return clone(value);}
  updateSubscription(workspaceId,changes,updatedAt){const current=this.getSubscription(workspaceId);const value={...current,...clone(changes),workspaceId,updatedAt};this.#subscriptions.set(workspaceId,value);return clone(value);}

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
  getIntelligenceObservation(workspaceId,id) { const value=this.#intelligenceObservations.get(id);if(!value||value.workspaceId!==workspaceId)throw new AtlasError('INTELLIGENCE_OBSERVATION_NOT_FOUND','Intelligence observation not found',404);return clone(value); }
  reviewIntelligenceObservation(workspaceId,id,status,reviewedBy,reviewedAt) { const value=this.getIntelligenceObservation(workspaceId,id);if(value.status!=='candidate')throw new AtlasError('INTELLIGENCE_OBSERVATION_ALREADY_REVIEWED','Intelligence observation has already been reviewed',409);const updated={...value,status,reviewedBy,reviewedAt};this.#intelligenceObservations.set(id,clone(updated));return clone(updated); }
  findIngestionRecord(workspaceId,connector,externalId) { const value=this.#ingestionRecords.get(`${workspaceId}:${connector}:${externalId}`);return value?clone(value):null; }
  createIngestionRecord(value) { const key=`${value.workspaceId}:${value.connector}:${value.externalId}`;if(this.#ingestionRecords.has(key))throw new AtlasError('INGESTION_EXISTS','Ingestion record already exists',409);this.#ingestionRecords.set(key,clone(value));return clone(value); }
  createCmsAuthorization(value){this.#cmsAuthorizations.set(value.stateHash,clone(value));return clone(value);}
  consumeCmsAuthorization(stateHash,usedAt){const value=this.#cmsAuthorizations.get(stateHash);if(!value||value.usedAt)throw new AtlasError('CMS_AUTHORIZATION_INVALID','CMS authorization is invalid or already used',400);const updated={...value,usedAt};this.#cmsAuthorizations.set(stateHash,updated);return clone(updated);}
  createCmsConnection(value){if([...this.#cmsConnections.values()].some((x)=>x.workspaceId===value.workspaceId&&x.provider===value.provider))throw new AtlasError('CMS_CONNECTION_EXISTS','CMS provider is already connected',409);this.#cmsConnections.set(value.id,clone(value));return clone(value);}
  getCmsConnection(workspaceId,id){const value=this.#cmsConnections.get(id);if(!value||value.workspaceId!==workspaceId)throw new AtlasError('CMS_CONNECTION_NOT_FOUND','CMS connection not found',404);return clone(value);}
  listCmsConnections(workspaceId){return [...this.#cmsConnections.values()].filter((x)=>x.workspaceId===workspaceId).map(clone);}
  listActiveCmsConnections(){return [...this.#cmsConnections.values()].filter((x)=>x.status==='connected'||x.status==='error').map(clone);}
  updateCmsConnection(id,changes){const value=this.#cmsConnections.get(id);if(!value)throw new AtlasError('CMS_CONNECTION_NOT_FOUND','CMS connection not found',404);const updated={...value,...changes};this.#cmsConnections.set(id,clone(updated));return clone(updated);}
  findCmsRecordLink(connectionId,externalType,externalId){const value=this.#cmsRecordLinks.get(`${connectionId}:${externalType}:${externalId}`);return value?clone(value):null;}
  createCmsRecordLink(value){this.#cmsRecordLinks.set(`${value.connectionId}:${value.externalType}:${value.externalId}`,clone(value));return clone(value);}
  updateCmsRecordLink(id,changes){const entry=[...this.#cmsRecordLinks.entries()].find(([,value])=>value.id===id);if(!entry)throw new AtlasError('CMS_RECORD_LINK_NOT_FOUND','CMS record link not found',404);const updated={...entry[1],...changes};this.#cmsRecordLinks.set(entry[0],clone(updated));return clone(updated);}
  createEncryptedSecret(value){this.#encryptedSecrets.set(value.id,clone(value));return clone(value);}
  getEncryptedSecret(id){const value=this.#encryptedSecrets.get(id);if(!value)throw new AtlasError('CMS_CREDENTIAL_UNAVAILABLE','CMS credential is unavailable',503);return clone(value);}
  deleteEncryptedSecret(id){this.#encryptedSecrets.delete(id);return {deleted:true};}
  createAwarenessItem(value){if([...this.#awarenessItems.values()].some((x)=>x.sourceJobId===value.sourceJobId))throw new AtlasError('AWARENESS_ITEM_EXISTS','Awareness item already exists for job',409);this.#awarenessItems.set(value.id,clone(value));return clone(value);}
  listAwarenessItems(workspaceId,userId,since){return [...this.#awarenessItems.values()].filter((x)=>x.workspaceId===workspaceId&&(!x.targetUserId||x.targetUserId===userId)&&(!since||x.createdAt>since)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map((item)=>({...clone(item),reviewStatus:this.#awarenessReceipts.get(`${item.id}:${userId}`)?.status??'unseen'}));}
  updateAwarenessReceipt(workspaceId,itemId,userId,status,updatedAt){const item=this.#awarenessItems.get(itemId);if(!item||item.workspaceId!==workspaceId||item.targetUserId&&item.targetUserId!==userId)throw new AtlasError('AWARENESS_ITEM_NOT_FOUND','Awareness item not found',404);const value={itemId,userId,status,updatedAt};this.#awarenessReceipts.set(`${itemId}:${userId}`,value);return clone(value);}
  createAutomationMarker(workspaceId,markerKey){const key=`${workspaceId}:${markerKey}`;if(this.#automationMarkers.has(key))return false;this.#automationMarkers.add(key);return true;}
  acquireSchedulerLease(leaseKey,ownerId,now,expiresAt){const current=this.#schedulerLeases.get(leaseKey);if(current&&current.ownerId!==ownerId&&new Date(current.expiresAt)>new Date(now))return false;this.#schedulerLeases.set(leaseKey,{leaseKey,ownerId,acquiredAt:now,expiresAt});return true;}
  renewSchedulerLease(leaseKey,ownerId,now,expiresAt){const current=this.#schedulerLeases.get(leaseKey);if(!current||current.ownerId!==ownerId||new Date(current.expiresAt)<=new Date(now))return false;this.#schedulerLeases.set(leaseKey,{...current,expiresAt});return true;}
  releaseSchedulerLease(leaseKey,ownerId){const current=this.#schedulerLeases.get(leaseKey);if(!current||current.ownerId!==ownerId)return false;this.#schedulerLeases.delete(leaseKey);return true;}
}
