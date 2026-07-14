import { AtlasError } from './errors.js';

function iso(value) { return value instanceof Date ? value.toISOString() : value; }
function workspace(row) {
  return { id: row.id, name: row.name, version: row.version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function object(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, parentObjectId: row.parent_object_id,
    dimension: row.dimension, type: row.type, title: row.title, state: row.state,
    version: row.version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), deletedAt: iso(row.deleted_at)
  };
}
function relationship(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, fromObjectId: row.from_object_id,
    toObjectId: row.to_object_id, type: row.type, attributes: row.attributes, createdAt: iso(row.created_at)
  };
}
function event(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, parentObjectId: row.parent_object_id,
    type: row.type, actorId: row.actor_id, source: row.source, confidence: Number(row.confidence),
    visibility: row.visibility, relatedObjectIds: row.related_object_ids, data: row.data,
    occurredAt: iso(row.occurred_at), createdAt: iso(row.created_at)
  };
}
function user(row) { return { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash, createdAt: iso(row.created_at) }; }
function membership(row) { return { id: row.id, workspaceId: row.workspace_id, userId: row.user_id, role: row.role, active:row.active??true, deactivatedAt:iso(row.deactivated_at), deactivatedBy:row.deactivated_by??null, deactivationReason:row.deactivation_reason??null, createdAt: iso(row.created_at) }; }
function workspaceSecurityPolicy(row){return {workspaceId:row.workspace_id,requireMfa:row.require_mfa,updatedBy:row.updated_by??null,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};}
function workspaceInvitation(row){return {id:row.id,workspaceId:row.workspace_id,email:row.email,role:row.role,tokenHash:row.token_hash,status:row.status,invitedBy:row.invited_by,acceptedBy:row.accepted_by,expiresAt:iso(row.expires_at),createdAt:iso(row.created_at),acceptedAt:iso(row.accepted_at)};}
function subscription(row){return {id:row.id,workspaceId:row.workspace_id,plan:row.plan,status:row.status,seatLimit:row.seat_limit,trialEndsAt:iso(row.trial_ends_at),currentPeriodEndsAt:iso(row.current_period_ends_at),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};}
function audit(row) { return { id: row.id, workspaceId: row.workspace_id, objectId: row.object_id, actorId: row.actor_id, action: row.action, beforeSnapshot: row.before_snapshot, afterSnapshot: row.after_snapshot, createdAt: iso(row.created_at) }; }
function refreshSession(row) {
  return {
    id: row.id, userId: row.user_id, familyId: row.family_id, tokenHash: row.token_hash,
    expiresAt: iso(row.expires_at), createdAt: iso(row.created_at), usedAt: iso(row.used_at),
    revokedAt: iso(row.revoked_at), replacedBySessionId: row.replaced_by_session_id
  };
}
function passwordReset(row) {
  return { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: iso(row.expires_at), createdAt: iso(row.created_at), usedAt: iso(row.used_at) };
}
function loginThrottle(row) {
  return { principalHash: row.principal_hash, failedCount: row.failed_count, windowStartedAt: iso(row.window_started_at), lockedUntil: iso(row.locked_until), updatedAt: iso(row.updated_at) };
}
function rateLimitBucket(row){return {keyHash:row.key_hash,scope:row.scope,count:Number(row.request_count),windowStartedAt:iso(row.window_started_at),expiresAt:iso(row.expires_at),updatedAt:iso(row.updated_at)};}
function mfaFactor(row){return {userId:row.user_id,encryptedSecret:row.encrypted_secret,enabled:row.enabled,recoveryCodeHashes:row.recovery_code_hashes,createdAt:iso(row.created_at),verifiedAt:iso(row.verified_at),updatedAt:iso(row.updated_at)};}
function securityEvent(row){return {id:row.id,userId:row.user_id,workspaceId:row.workspace_id,type:row.type,outcome:row.outcome,ipAddress:row.ip_address,userAgent:row.user_agent,details:row.details,createdAt:iso(row.created_at)};}
function aiRun(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, actorId: row.actor_id, status: row.status,
    prompt: row.prompt, answer: row.answer, provider: row.provider, model: row.model,
    sources: row.sources, toolCalls: row.tool_calls, usage: row.usage,
    errorCode: row.error_code, createdAt: iso(row.created_at)
  };
}
function aiConversation(row) { return { id: row.id, workspaceId: row.workspace_id, actorId: row.actor_id, title: row.title, createdAt: iso(row.created_at) }; }
function aiMessage(row) { return { id: row.id, conversationId: row.conversation_id, workspaceId: row.workspace_id, actorId: row.actor_id, runId: row.run_id, role: row.role, content: row.content, sources: row.sources, createdAt: iso(row.created_at) }; }
function aiActionProposal(row) { return { id: row.id, workspaceId: row.workspace_id, runId: row.run_id, intelligenceJobId: row.intelligence_job_id, originType: row.origin_type, proposedBy: row.proposed_by, actionType: row.action_type, input: row.input, status: row.status, version: row.version, decidedBy: row.decided_by, resultObjectId: row.result_object_id, createdAt: iso(row.created_at), decidedAt: iso(row.decided_at) }; }
function intelligenceObservation(row) { return { id:row.id,workspaceId:row.workspace_id,jobId:row.job_id,sourceObjectId:row.source_object_id,kind:row.kind,data:row.data,confidence:Number(row.confidence),sourceLocation:row.source_location,provider:row.provider,status:row.status,reviewedBy:row.reviewed_by,reviewedAt:iso(row.reviewed_at),createdAt:iso(row.created_at) }; }
function ingestionRecord(row) { return {id:row.id,workspaceId:row.workspace_id,connector:row.connector,externalId:row.external_id,kind:row.kind,status:row.status,rootObjectId:row.root_object_id,metadata:row.metadata,errorCode:row.error_code,receivedAt:iso(row.received_at),createdAt:iso(row.created_at)}; }
function cmsAuthorization(row){return {stateHash:row.state_hash,workspaceId:row.workspace_id,provider:row.provider,actorId:row.actor_id,verifierRef:row.verifier_ref,redirectUri:row.redirect_uri,expiresAt:iso(row.expires_at),usedAt:iso(row.used_at),createdAt:iso(row.created_at)};}
function cmsConnection(row){return {id:row.id,workspaceId:row.workspace_id,provider:row.provider,credentialRef:row.credential_ref,status:row.status,accessMode:row.access_mode,cursor:row.cursor,lastSyncedAt:iso(row.last_synced_at),errorCode:row.error_code,createdBy:row.created_by,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};}
function cmsRecordLink(row){return {id:row.id,workspaceId:row.workspace_id,connectionId:row.connection_id,externalType:row.external_type,externalId:row.external_id,atlasObjectId:row.atlas_object_id,sourceUpdatedAt:iso(row.source_updated_at),sourceChecksum:row.source_checksum,lastSyncedAt:iso(row.last_synced_at),sourceDeletedAt:iso(row.source_deleted_at),reconciliationStatus:row.reconciliation_status??'active'};}
function awarenessItem(row){return {id:row.id,workspaceId:row.workspace_id,targetUserId:row.target_user_id,sourceJobId:row.source_job_id,sourceObjectId:row.source_object_id,category:row.category,priority:row.priority,headline:row.headline,summary:row.summary,observationIds:row.observation_ids,actionProposalIds:row.action_proposal_ids,createdAt:iso(row.created_at),...(row.review_status?{reviewStatus:row.review_status}:{})};}
function intelligenceJob(row) { return { id: row.id, workspaceId: row.workspace_id, triggerType: row.trigger_type, objectId: row.object_id, eventId: row.event_id, status: row.status, attempts: row.attempts, payload: row.payload, result: row.result, provider: row.provider, errorCode: row.error_code, availableAt: iso(row.available_at), lockedAt: iso(row.locked_at), createdAt: iso(row.created_at), completedAt: iso(row.completed_at) }; }
function canonicalEvent(row){return {id:row.id,workspaceId:row.workspace_id,eventType:row.event_type,actorId:row.actor_id,source:row.source,causationId:row.causation_id,correlationId:row.correlation_id,payload:row.payload,occurredAt:iso(row.occurred_at),createdAt:iso(row.created_at),affectedObjectIds:row.affected_object_ids??[]};}

export class PostgresRepository {
  constructor(executor, pool = executor) {
    this.executor = executor;
    this.pool = pool;
  }

  async createDocumentBlob(workspaceId,sha256,content,createdAt){const r=await this.executor.query('INSERT INTO atlas_document_blob (workspace_id,sha256,content,size,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (workspace_id,sha256) DO UPDATE SET sha256=EXCLUDED.sha256 RETURNING workspace_id,sha256,size,created_at',[workspaceId,sha256,content,content.length,createdAt]);return {workspaceId:r.rows[0].workspace_id,sha256:r.rows[0].sha256,size:Number(r.rows[0].size),createdAt:iso(r.rows[0].created_at)};}
  async getDocumentBlob(workspaceId,sha256){const r=await this.executor.query('SELECT workspace_id,sha256,content,size,created_at FROM atlas_document_blob WHERE workspace_id=$1 AND sha256=$2',[workspaceId,sha256]);if(!r.rows[0])throw new AtlasError('FILE_NOT_FOUND','Stored file was not found',404);return {workspaceId:r.rows[0].workspace_id,sha256:r.rows[0].sha256,content:Buffer.from(r.rows[0].content),size:Number(r.rows[0].size),createdAt:iso(r.rows[0].created_at)};}
  async deleteDocumentBlob(workspaceId,sha256){const r=await this.executor.query('DELETE FROM atlas_document_blob WHERE workspace_id=$1 AND sha256=$2 RETURNING sha256',[workspaceId,sha256]);return Boolean(r.rows[0]);}

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transactionRepository=new PostgresRepository(client,this.pool);const result = await work(transactionRepository);
      const uncovered=await client.query(`WITH mutated AS (SELECT id FROM atlas_object WHERE xmin=txid_current()::text::xid UNION SELECT from_object_id FROM atlas_relationship WHERE xmin=txid_current()::text::xid UNION SELECT to_object_id FROM atlas_relationship WHERE xmin=txid_current()::text::xid), covered AS (SELECT object_id FROM atlas_canonical_event_object WHERE xmin=txid_current()::text::xid) SELECT id FROM mutated EXCEPT SELECT object_id FROM covered`);
      if(uncovered.rows.length)throw new AtlasError('CANONICAL_EVENT_REQUIRED','Material canonical mutations require event coverage',500,{objectIds:uncovered.rows.map((row)=>row.id)});
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async createWorkspace(value) {
    const result = await this.executor.query(
      `INSERT INTO atlas_workspace (id, name, version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [value.id, value.name, value.version, value.createdAt, value.updatedAt]);
    return workspace(result.rows[0]);
  }

  async getWorkspace(id) {
    const result = await this.executor.query('SELECT * FROM atlas_workspace WHERE id = $1', [id]);
    if (!result.rows[0]) throw new AtlasError('WORKSPACE_NOT_FOUND', 'Workspace not found', 404);
    return workspace(result.rows[0]);
  }
  async listWorkspaces(){const r=await this.executor.query('SELECT * FROM atlas_workspace ORDER BY created_at,id');return r.rows.map(workspace);}

  async createObject(value) {
    await this.getWorkspace(value.workspaceId);
    if (value.parentObjectId) await this.getObject(value.workspaceId, value.parentObjectId);
    const result = await this.executor.query(
      `INSERT INTO atlas_object
       (id, workspace_id, parent_object_id, dimension, type, title, state, version, created_at, updated_at, deleted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [value.id, value.workspaceId, value.parentObjectId, value.dimension, value.type, value.title,
        value.state, value.version, value.createdAt, value.updatedAt, value.deletedAt]);
    return object(result.rows[0]);
  }

  async getObject(workspaceId, id, options = {}) {
    const result = await this.executor.query(
      `SELECT * FROM atlas_object WHERE workspace_id = $1 AND id = $2${options.includeDeleted ? '' : ' AND deleted_at IS NULL'}`, [workspaceId, id]);
    if (!result.rows[0]) throw new AtlasError('OBJECT_NOT_FOUND', 'Object not found', 404);
    return object(result.rows[0]);
  }

  async updateObject(workspaceId, id, expectedVersion, changes, updatedAt) {
    const current = await this.getObject(workspaceId, id);
    const result = await this.executor.query(
      `UPDATE atlas_object SET title = $4, state = $5, version = version + 1, updated_at = $6
       WHERE workspace_id = $1 AND id = $2 AND version = $3 AND deleted_at IS NULL RETURNING *`,
      [workspaceId, id, expectedVersion, changes.title ?? current.title, changes.state ?? current.state, updatedAt]);
    if (!result.rows[0]) throw new AtlasError('VERSION_CONFLICT', 'Object version is stale', 409, { currentVersion: current.version });
    return object(result.rows[0]);
  }

  async softDeleteObject(workspaceId, id, expectedVersion, deletedAt) {
    const current = await this.getObject(workspaceId, id);
    const result = await this.executor.query(
      `UPDATE atlas_object SET deleted_at = $4, updated_at = $4, version = version + 1
       WHERE workspace_id = $1 AND id = $2 AND version = $3 AND deleted_at IS NULL RETURNING *`,
      [workspaceId, id, expectedVersion, deletedAt]);
    if (!result.rows[0]) throw new AtlasError('VERSION_CONFLICT', 'Object version is stale', 409, { currentVersion: current.version });
    return object(result.rows[0]);
  }

  async restoreObject(workspaceId, id, expectedVersion, updatedAt) {
    const current = await this.getObject(workspaceId, id, { includeDeleted: true });
    if (!current.deletedAt) throw new AtlasError('OBJECT_NOT_DELETED', 'Object is not deleted', 409);
    const result = await this.executor.query(
      `UPDATE atlas_object SET deleted_at = NULL, updated_at = $4, version = version + 1
       WHERE workspace_id = $1 AND id = $2 AND version = $3 AND deleted_at IS NOT NULL RETURNING *`,
      [workspaceId, id, expectedVersion, updatedAt]);
    if (!result.rows[0]) throw new AtlasError('VERSION_CONFLICT', 'Object version is stale', 409, { currentVersion: current.version });
    return object(result.rows[0]);
  }

  async listObjects(workspaceId, filters = {}) {
    await this.getWorkspace(workspaceId);
    const values = [workspaceId];
    const conditions = ['workspace_id = $1'];
    if (!filters.includeDeleted) conditions.push('deleted_at IS NULL');
    if (filters.type) { values.push(filters.type); conditions.push(`type = $${values.length}`); }
    if (filters.dimension) { values.push(filters.dimension); conditions.push(`dimension = $${values.length}`); }
    const result = await this.executor.query(
      `SELECT * FROM atlas_object WHERE ${conditions.join(' AND ')} ORDER BY created_at, id`, values);
    return result.rows.map(object);
  }

  async createRelationship(value) {
    await this.getObject(value.workspaceId, value.fromObjectId);
    await this.getObject(value.workspaceId, value.toObjectId);
    try {
      const result = await this.executor.query(
        `INSERT INTO atlas_relationship
         (id, workspace_id, from_object_id, to_object_id, type, attributes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [value.id, value.workspaceId, value.fromObjectId, value.toObjectId, value.type, value.attributes, value.createdAt]);
      return relationship(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') throw new AtlasError('RELATIONSHIP_EXISTS', 'Relationship already exists', 409);
      throw error;
    }
  }

  async listRelationships(workspaceId) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_relationship WHERE workspace_id = $1 ORDER BY created_at, id', [workspaceId]);
    return result.rows.map(relationship);
  }

  async createEvent(value) {
    await this.getWorkspace(value.workspaceId);
    if (value.parentObjectId) await this.getObject(value.workspaceId, value.parentObjectId);
    const result = await this.executor.query(
      `INSERT INTO atlas_timeline_event
       (id, workspace_id, parent_object_id, type, actor_id, source, confidence, visibility, related_object_ids, data, occurred_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [value.id, value.workspaceId, value.parentObjectId, value.type, value.actorId, value.source,
        value.confidence, value.visibility, value.relatedObjectIds, value.data, value.occurredAt, value.createdAt]);
    const created=event(result.rows[0]);const affected=[...new Set([value.parentObjectId,...(value.relatedObjectIds??[])].filter(Boolean))];
    for(const objectId of affected)await this.getObject(value.workspaceId,objectId,{includeDeleted:true});
    await this.executor.query('INSERT INTO atlas_canonical_event (id,workspace_id,event_type,actor_id,source,causation_id,correlation_id,payload,occurred_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[value.id,value.workspaceId,value.type,value.actorId,value.source,value.data?.causationId??null,value.data?.correlationId??value.id,value.data,value.occurredAt,value.createdAt]);
    for(const objectId of affected)await this.executor.query('INSERT INTO atlas_canonical_event_object (workspace_id,event_id,object_id,role) VALUES ($1,$2,$3,$4)',[value.workspaceId,value.id,objectId,objectId===value.parentObjectId?'primary':'affected']);
    return created;
  }

  async listCanonicalEventsForConsumer(consumerId,limit=100,now=new Date().toISOString()){const r=await this.executor.query(`SELECT e.*,COALESCE(array_agg(o.object_id) FILTER (WHERE o.object_id IS NOT NULL),'{}') affected_object_ids FROM atlas_canonical_event e LEFT JOIN atlas_canonical_event_object o ON o.event_id=e.id WHERE NOT EXISTS (SELECT 1 FROM atlas_canonical_event_delivery d WHERE d.event_id=e.id AND d.consumer_id=$1 AND (d.status IN ('processing','completed','dead_letter') OR d.available_at>$3)) GROUP BY e.id ORDER BY e.created_at,e.id LIMIT $2`,[consumerId,limit,now]);return r.rows.map(canonicalEvent);}
  async claimCanonicalEventDelivery(eventId,consumerId,now){const r=await this.executor.query(`INSERT INTO atlas_canonical_event_delivery (event_id,consumer_id,status,attempts,available_at,locked_at) VALUES ($1,$2,'processing',1,$3,$3) ON CONFLICT (event_id,consumer_id) DO UPDATE SET status='processing',attempts=atlas_canonical_event_delivery.attempts+1,locked_at=$3,error_code=NULL WHERE atlas_canonical_event_delivery.status='failed' AND atlas_canonical_event_delivery.available_at<=$3 RETURNING *`,[eventId,consumerId,now]);return r.rows[0]??null;}
  async completeCanonicalEventDelivery(eventId,consumerId,now){const r=await this.executor.query("UPDATE atlas_canonical_event_delivery SET status='completed',completed_at=$3,locked_at=NULL WHERE event_id=$1 AND consumer_id=$2 AND status='processing' RETURNING *",[eventId,consumerId,now]);return r.rows[0]??null;}
  async failCanonicalEventDelivery(eventId,consumerId,errorCode,maxAttempts,now){const r=await this.executor.query("UPDATE atlas_canonical_event_delivery SET status=CASE WHEN attempts >= $4 THEN 'dead_letter' ELSE 'failed' END,available_at=$5,locked_at=NULL,error_code=$3 WHERE event_id=$1 AND consumer_id=$2 AND status='processing' RETURNING *",[eventId,consumerId,errorCode,maxAttempts,now]);return r.rows[0]??null;}

  async listEvents(workspaceId, parentObjectId) {
    await this.getWorkspace(workspaceId);
    const values = [workspaceId];
    let sql = 'SELECT * FROM atlas_timeline_event WHERE workspace_id = $1';
    if (parentObjectId) { values.push(parentObjectId); sql += ' AND parent_object_id = $2'; }
    const result = await this.executor.query(`${sql} ORDER BY occurred_at, id`, values);
    return result.rows.map(event);
  }

  async createUser(value) {
    try {
      const result = await this.executor.query(
        'INSERT INTO atlas_user (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [value.id, value.email, value.name, value.passwordHash, value.createdAt]);
      return user(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') throw new AtlasError('EMAIL_EXISTS', 'Email is already registered', 409);
      throw error;
    }
  }

  async getUserByEmail(email) {
    const result = await this.executor.query('SELECT * FROM atlas_user WHERE lower(email) = lower($1)', [email]);
    if (!result.rows[0]) throw new AtlasError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    return user(result.rows[0]);
  }

  async getUser(id) {
    const result = await this.executor.query('SELECT * FROM atlas_user WHERE id = $1', [id]);
    if (!result.rows[0]) throw new AtlasError('USER_NOT_FOUND', 'User not found', 404);
    return user(result.rows[0]);
  }

  async getLoginThrottle(principalHash) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_login_throttle WHERE principal_hash = $1', [principalHash]);
    return result.rows[0] ? loginThrottle(result.rows[0]) : null;
  }

  async recordLoginFailure(principalHash, now, windowSeconds, threshold, lockSeconds) {
    const reset = `(atlas_login_throttle.window_started_at <= $2::timestamptz - $3 * interval '1 second'
      OR (atlas_login_throttle.locked_until IS NOT NULL AND atlas_login_throttle.locked_until <= $2))`;
    const nextCount = `(CASE WHEN ${reset} THEN 1 ELSE atlas_login_throttle.failed_count + 1 END)`;
    const result = await this.executor.query(
      `INSERT INTO atlas_login_throttle
       (principal_hash, failed_count, window_started_at, locked_until, updated_at)
       VALUES ($1, 1, $2, CASE WHEN 1 >= $4 THEN $2::timestamptz + $5 * interval '1 second' ELSE NULL END, $2)
       ON CONFLICT (principal_hash) DO UPDATE SET
         failed_count = ${nextCount},
         window_started_at = CASE WHEN ${reset} THEN $2 ELSE atlas_login_throttle.window_started_at END,
         locked_until = CASE WHEN ${nextCount} >= $4 THEN $2::timestamptz + $5 * interval '1 second' ELSE NULL END,
         updated_at = $2
       RETURNING *`, [principalHash, now, windowSeconds, threshold, lockSeconds]);
    return loginThrottle(result.rows[0]);
  }

  async clearLoginThrottle(principalHash) {
    await this.executor.query('DELETE FROM atlas_login_throttle WHERE principal_hash = $1', [principalHash]);
  }

  async consumeRateLimitBucket({keyHash,scope,now,windowSeconds}){const result=await this.executor.query(`INSERT INTO atlas_rate_limit_bucket (key_hash,scope,request_count,window_started_at,expires_at,updated_at) VALUES ($1,$2,1,$3,$3::timestamptz+$4*interval '1 second',$3) ON CONFLICT (key_hash) DO UPDATE SET scope=EXCLUDED.scope,request_count=CASE WHEN atlas_rate_limit_bucket.expires_at<=EXCLUDED.updated_at THEN 1 ELSE atlas_rate_limit_bucket.request_count+1 END,window_started_at=CASE WHEN atlas_rate_limit_bucket.expires_at<=EXCLUDED.updated_at THEN EXCLUDED.window_started_at ELSE atlas_rate_limit_bucket.window_started_at END,expires_at=CASE WHEN atlas_rate_limit_bucket.expires_at<=EXCLUDED.updated_at THEN EXCLUDED.expires_at ELSE atlas_rate_limit_bucket.expires_at END,updated_at=EXCLUDED.updated_at RETURNING *`,[keyHash,scope,now,windowSeconds]);return rateLimitBucket(result.rows[0]);}

  async updateUserPassword(id, passwordHash) {
    const result = await this.executor.query(
      'UPDATE atlas_user SET password_hash = $2 WHERE id = $1 RETURNING *', [id, passwordHash]);
    if (!result.rows[0]) throw new AtlasError('USER_NOT_FOUND', 'User not found', 404);
    return user(result.rows[0]);
  }

  async createRefreshSession(value) {
    const result = await this.executor.query(
      `INSERT INTO atlas_refresh_session
       (id, user_id, family_id, token_hash, expires_at, created_at, used_at, revoked_at, replaced_by_session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [value.id, value.userId, value.familyId, value.tokenHash, value.expiresAt, value.createdAt,
        value.usedAt, value.revokedAt, value.replacedBySessionId]);
    return refreshSession(result.rows[0]);
  }

  async getRefreshSessionByHash(tokenHash) {
    const result = await this.executor.query('SELECT * FROM atlas_refresh_session WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
    if (!result.rows[0]) throw new AtlasError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
    return refreshSession(result.rows[0]);
  }

  async getRefreshSession(userId, id) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_refresh_session WHERE user_id = $1 AND id = $2', [userId, id]);
    if (!result.rows[0]) throw new AtlasError('SESSION_NOT_FOUND', 'Session not found', 404);
    return refreshSession(result.rows[0]);
  }

  async listRefreshSessions(userId) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_refresh_session WHERE user_id = $1 ORDER BY created_at DESC, id', [userId]);
    return result.rows.map(refreshSession);
  }

  async consumeRefreshSession(id, usedAt, replacedBySessionId) {
    const result = await this.executor.query(
      `UPDATE atlas_refresh_session SET used_at = $2, replaced_by_session_id = $3
       WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING *`, [id, usedAt, replacedBySessionId]);
    if (!result.rows[0]) throw new AtlasError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
    return refreshSession(result.rows[0]);
  }

  async revokeRefreshSession(id, revokedAt) {
    const result = await this.executor.query(
      'UPDATE atlas_refresh_session SET revoked_at = COALESCE(revoked_at, $2) WHERE id = $1 RETURNING *', [id, revokedAt]);
    if (!result.rows[0]) throw new AtlasError('INVALID_REFRESH_TOKEN', 'Invalid refresh token', 401);
    return refreshSession(result.rows[0]);
  }

  async revokeRefreshFamily(familyId, revokedAt) {
    await this.executor.query(
      'UPDATE atlas_refresh_session SET revoked_at = COALESCE(revoked_at, $2) WHERE family_id = $1', [familyId, revokedAt]);
  }

  async revokeRefreshSessionsForUser(userId, revokedAt) {
    await this.executor.query(
      'UPDATE atlas_refresh_session SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1', [userId, revokedAt]);
  }

  async listWorkspaceRefreshSessions(workspaceId){const result=await this.executor.query(`SELECT s.*,u.email AS user_email,u.name AS user_name FROM atlas_refresh_session s JOIN atlas_workspace_membership m ON m.user_id=s.user_id JOIN atlas_user u ON u.id=s.user_id WHERE m.workspace_id=$1 ORDER BY s.created_at DESC,s.id`,[workspaceId]);return result.rows.map(row=>({...refreshSession(row),user:{id:row.user_id,email:row.user_email,name:row.user_name}}));}

  async revokeRefreshSessionsForWorkspace(workspaceId,revokedAt){await this.executor.query(`UPDATE atlas_refresh_session s SET revoked_at=COALESCE(s.revoked_at,$2) WHERE EXISTS (SELECT 1 FROM atlas_workspace_membership m WHERE m.workspace_id=$1 AND m.user_id=s.user_id)`,[workspaceId,revokedAt]);}

  async upsertMfaFactor(value){const result=await this.executor.query(`INSERT INTO atlas_mfa_factor (user_id,encrypted_secret,enabled,recovery_code_hashes,created_at,verified_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET encrypted_secret=EXCLUDED.encrypted_secret,enabled=EXCLUDED.enabled,recovery_code_hashes=EXCLUDED.recovery_code_hashes,verified_at=EXCLUDED.verified_at,updated_at=EXCLUDED.updated_at RETURNING *`,[value.userId,value.encryptedSecret,value.enabled,JSON.stringify(value.recoveryCodeHashes),value.createdAt,value.verifiedAt,value.updatedAt]);return mfaFactor(result.rows[0]);}
  async getMfaFactor(userId){const result=await this.executor.query('SELECT * FROM atlas_mfa_factor WHERE user_id=$1',[userId]);if(!result.rows[0])throw new AtlasError('MFA_NOT_CONFIGURED','Multi-factor authentication is not configured',404);return mfaFactor(result.rows[0]);}
  async deleteMfaFactor(userId){const result=await this.executor.query('DELETE FROM atlas_mfa_factor WHERE user_id=$1 RETURNING user_id',[userId]);if(!result.rows[0])throw new AtlasError('MFA_NOT_CONFIGURED','Multi-factor authentication is not configured',404);return {deleted:true};}
  async createSecurityEvent(value){const result=await this.executor.query(`INSERT INTO atlas_security_event (id,user_id,workspace_id,type,outcome,ip_address,user_agent,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[value.id,value.userId,value.workspaceId,value.type,value.outcome,value.ipAddress,value.userAgent,value.details,value.createdAt]);return securityEvent(result.rows[0]);}
  async listSecurityEvents(workspaceId,limit=100){const result=await this.executor.query(`SELECT e.* FROM atlas_security_event e WHERE e.workspace_id=$1 OR EXISTS (SELECT 1 FROM atlas_workspace_membership m WHERE m.workspace_id=$1 AND m.user_id=e.user_id) ORDER BY e.created_at DESC,e.id LIMIT $2`,[workspaceId,limit]);return result.rows.map(securityEvent);}

  async createPasswordReset(value) {
    const result = await this.executor.query(
      `INSERT INTO atlas_password_reset (id, user_id, token_hash, expires_at, created_at, used_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [value.id, value.userId, value.tokenHash, value.expiresAt, value.createdAt, value.usedAt]);
    return passwordReset(result.rows[0]);
  }

  async getPasswordResetByHash(tokenHash) {
    const result = await this.executor.query('SELECT * FROM atlas_password_reset WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
    if (!result.rows[0]) throw new AtlasError('INVALID_PASSWORD_RESET', 'Invalid password reset token', 401);
    return passwordReset(result.rows[0]);
  }

  async consumePasswordReset(id, usedAt) {
    const result = await this.executor.query(
      'UPDATE atlas_password_reset SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING *', [id, usedAt]);
    if (!result.rows[0]) throw new AtlasError('INVALID_PASSWORD_RESET', 'Invalid password reset token', 401);
    return passwordReset(result.rows[0]);
  }

  async invalidatePasswordResetsForUser(userId, usedAt) {
    await this.executor.query(
      'UPDATE atlas_password_reset SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL', [userId, usedAt]);
  }

  async createMembership(value) {
    try {
      const result = await this.executor.query(
        `INSERT INTO atlas_workspace_membership (id, workspace_id, user_id, role, active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [value.id, value.workspaceId, value.userId, value.role, value.active??true, value.createdAt]);
      return membership(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') throw new AtlasError('MEMBERSHIP_EXISTS', 'Membership already exists', 409);
      throw error;
    }
  }

  async getMembership(workspaceId, userId) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_workspace_membership WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
    if (!result.rows[0]) throw new AtlasError('ACCESS_DENIED', 'Workspace access denied', 403);
    return membership(result.rows[0]);
  }

  async listMemberships(workspaceId) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_workspace_membership WHERE workspace_id = $1 ORDER BY created_at, id', [workspaceId]);
    return result.rows.map(membership);
  }
  async listMembershipsForUser(userId){const result=await this.executor.query('SELECT * FROM atlas_workspace_membership WHERE user_id = $1 ORDER BY created_at, id',[userId]);return result.rows.map(membership);}
  async updateMembershipRole(workspaceId,userId,role){const result=await this.executor.query('UPDATE atlas_workspace_membership SET role=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING *',[workspaceId,userId,role]);if(!result.rows[0])throw new AtlasError('ACCESS_DENIED','Workspace access denied',403);return membership(result.rows[0]);}
  async updateMembershipAccess(workspaceId,userId,changes){const result=await this.executor.query('UPDATE atlas_workspace_membership SET active=$3,deactivated_at=$4,deactivated_by=$5,deactivation_reason=$6 WHERE workspace_id=$1 AND user_id=$2 RETURNING *',[workspaceId,userId,changes.active,changes.deactivatedAt??null,changes.deactivatedBy??null,changes.deactivationReason??null]);if(!result.rows[0])throw new AtlasError('ACCESS_DENIED','Workspace access denied',403);return membership(result.rows[0]);}
  async getWorkspaceSecurityPolicy(workspaceId){const result=await this.executor.query('SELECT * FROM atlas_workspace_security_policy WHERE workspace_id=$1',[workspaceId]);return result.rows[0]?workspaceSecurityPolicy(result.rows[0]):{workspaceId,requireMfa:false,updatedBy:null,createdAt:null,updatedAt:null};}
  async upsertWorkspaceSecurityPolicy(value){const result=await this.executor.query('INSERT INTO atlas_workspace_security_policy (workspace_id,require_mfa,updated_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (workspace_id) DO UPDATE SET require_mfa=EXCLUDED.require_mfa,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING *',[value.workspaceId,value.requireMfa,value.updatedBy,value.createdAt,value.updatedAt]);return workspaceSecurityPolicy(result.rows[0]);}
  async createWorkspaceInvitation(v){try{const result=await this.executor.query('INSERT INTO atlas_workspace_invitation (id,workspace_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,created_at,accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[v.id,v.workspaceId,v.email,v.role,v.tokenHash,v.status,v.invitedBy,v.acceptedBy,v.expiresAt,v.createdAt,v.acceptedAt]);return workspaceInvitation(result.rows[0]);}catch(error){if(error.code==='23505')throw new AtlasError('INVITATION_EXISTS','A pending invitation already exists for this email',409);throw error;}}
  async listWorkspaceInvitations(workspaceId){const result=await this.executor.query('SELECT * FROM atlas_workspace_invitation WHERE workspace_id=$1 ORDER BY created_at DESC,id',[workspaceId]);return result.rows.map(workspaceInvitation);}
  async getWorkspaceInvitation(workspaceId,id){const result=await this.executor.query('SELECT * FROM atlas_workspace_invitation WHERE workspace_id=$1 AND id=$2',[workspaceId,id]);if(!result.rows[0])throw new AtlasError('INVITATION_NOT_FOUND','Invitation was not found',404);return workspaceInvitation(result.rows[0]);}
  async cancelWorkspaceInvitation(workspaceId,id){const result=await this.executor.query("UPDATE atlas_workspace_invitation SET status='canceled' WHERE workspace_id=$1 AND id=$2 AND status='pending' RETURNING *",[workspaceId,id]);if(result.rows[0])return workspaceInvitation(result.rows[0]);await this.getWorkspaceInvitation(workspaceId,id);throw new AtlasError('INVITATION_NOT_PENDING','Only a pending invitation can be canceled',409);}
  async cancelExpiredWorkspaceInvitations(workspaceId,now){const result=await this.executor.query("UPDATE atlas_workspace_invitation SET status='canceled' WHERE workspace_id=$1 AND status='pending' AND expires_at<=$2 RETURNING id",[workspaceId,now]);return result.rows.length;}
  async getWorkspaceInvitationByTokenHash(tokenHash){const result=await this.executor.query('SELECT * FROM atlas_workspace_invitation WHERE token_hash=$1 FOR UPDATE',[tokenHash]);if(!result.rows[0])throw new AtlasError('INVITATION_INVALID','Invitation is invalid',401);return workspaceInvitation(result.rows[0]);}
  async acceptWorkspaceInvitation(id,userId,acceptedAt){const result=await this.executor.query("UPDATE atlas_workspace_invitation SET status='accepted',accepted_by=$2,accepted_at=$3 WHERE id=$1 AND status='pending' RETURNING *",[id,userId,acceptedAt]);if(!result.rows[0])throw new AtlasError('INVITATION_INVALID','Invitation is invalid or already used',401);return workspaceInvitation(result.rows[0]);}

  async createSubscription(value){try{const result=await this.executor.query(`INSERT INTO atlas_subscription (id,workspace_id,plan,status,seat_limit,trial_ends_at,current_period_ends_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[value.id,value.workspaceId,value.plan,value.status,value.seatLimit,value.trialEndsAt,value.currentPeriodEndsAt,value.createdAt,value.updatedAt]);return subscription(result.rows[0]);}catch(error){if(error.code==='23505')throw new AtlasError('SUBSCRIPTION_EXISTS','Firm subscription already exists',409);throw error;}}
  async getSubscription(workspaceId){const result=await this.executor.query('SELECT * FROM atlas_subscription WHERE workspace_id = $1',[workspaceId]);if(!result.rows[0])throw new AtlasError('SUBSCRIPTION_NOT_FOUND','Firm subscription not found',404);return subscription(result.rows[0]);}
  async updateSubscription(workspaceId,changes,updatedAt){const current=await this.getSubscription(workspaceId);const result=await this.executor.query(`UPDATE atlas_subscription SET plan=$2,status=$3,seat_limit=$4,trial_ends_at=$5,current_period_ends_at=$6,updated_at=$7 WHERE workspace_id=$1 RETURNING *`,[workspaceId,changes.plan??current.plan,changes.status??current.status,changes.seatLimit??current.seatLimit,changes.trialEndsAt??current.trialEndsAt,changes.currentPeriodEndsAt??current.currentPeriodEndsAt,updatedAt]);return subscription(result.rows[0]);}

  async createAudit(value) {
    const result = await this.executor.query(
      `INSERT INTO atlas_audit_entry
       (id, workspace_id, object_id, actor_id, action, before_snapshot, after_snapshot, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [value.id, value.workspaceId, value.objectId, value.actorId, value.action, value.beforeSnapshot, value.afterSnapshot, value.createdAt]);
    return audit(result.rows[0]);
  }

  async listAudits(workspaceId, objectId) {
    const values = [workspaceId];
    let sql = 'SELECT * FROM atlas_audit_entry WHERE workspace_id = $1';
    if (objectId) { values.push(objectId); sql += ' AND object_id = $2'; }
    const result = await this.executor.query(`${sql} ORDER BY created_at, id`, values);
    return result.rows.map(audit);
  }

  async createAiRun(value) {
    const result = await this.executor.query(
      `INSERT INTO atlas_ai_run
       (id, workspace_id, actor_id, status, prompt, answer, provider, model, sources, tool_calls, usage, error_code, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [value.id, value.workspaceId, value.actorId, value.status, value.prompt, value.answer,
        value.provider, value.model, value.sources, value.toolCalls, value.usage, value.errorCode, value.createdAt]);
    return aiRun(result.rows[0]);
  }

  async listAiRuns(workspaceId, limit = 50) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_ai_run WHERE workspace_id = $1 ORDER BY created_at DESC, id LIMIT $2', [workspaceId, limit]);
    return result.rows.map(aiRun);
  }

  async createAiConversation(v) { const r=await this.executor.query('INSERT INTO atlas_ai_conversation (id,workspace_id,actor_id,title,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',[v.id,v.workspaceId,v.actorId,v.title,v.createdAt]); return aiConversation(r.rows[0]); }
  async getAiConversation(workspaceId,actorId,id) { const r=await this.executor.query('SELECT * FROM atlas_ai_conversation WHERE workspace_id=$1 AND actor_id=$2 AND id=$3',[workspaceId,actorId,id]); if(!r.rows[0]) throw new AtlasError('AI_CONVERSATION_NOT_FOUND','AI conversation not found',404); return aiConversation(r.rows[0]); }
  async listAiConversations(workspaceId,actorId) { const r=await this.executor.query('SELECT * FROM atlas_ai_conversation WHERE workspace_id=$1 AND actor_id=$2 ORDER BY created_at DESC,id',[workspaceId,actorId]); return r.rows.map(aiConversation); }
  async createAiMessage(v) { const r=await this.executor.query('INSERT INTO atlas_ai_message (id,conversation_id,workspace_id,actor_id,run_id,role,content,sources,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[v.id,v.conversationId,v.workspaceId,v.actorId,v.runId,v.role,v.content,v.sources,v.createdAt]); return aiMessage(r.rows[0]); }
  async listAiMessages(workspaceId,actorId,conversationId) { await this.getAiConversation(workspaceId,actorId,conversationId); const r=await this.executor.query('SELECT * FROM atlas_ai_message WHERE conversation_id=$1 ORDER BY created_at,id',[conversationId]); return r.rows.map(aiMessage); }
  async createAiActionProposal(v) { const r=await this.executor.query('INSERT INTO atlas_ai_action_proposal (id,workspace_id,run_id,intelligence_job_id,origin_type,proposed_by,action_type,input,status,version,decided_by,result_object_id,created_at,decided_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',[v.id,v.workspaceId,v.runId,v.intelligenceJobId,v.originType,v.proposedBy,v.actionType,v.input,v.status,v.version,v.decidedBy,v.resultObjectId,v.createdAt,v.decidedAt]); return aiActionProposal(r.rows[0]); }
  async getAiActionProposal(workspaceId,id) { const r=await this.executor.query('SELECT * FROM atlas_ai_action_proposal WHERE workspace_id=$1 AND id=$2',[workspaceId,id]); if(!r.rows[0]) throw new AtlasError('AI_ACTION_NOT_FOUND','AI action proposal not found',404); return aiActionProposal(r.rows[0]); }
  async listAiActionProposals(workspaceId,status) { const values=[workspaceId]; let sql='SELECT * FROM atlas_ai_action_proposal WHERE workspace_id=$1'; if(status){values.push(status);sql+=' AND status=$2';} const r=await this.executor.query(`${sql} ORDER BY created_at DESC,id`,values); return r.rows.map(aiActionProposal); }
  async decideAiActionProposal(workspaceId,id,version,status,decidedBy,resultObjectId,decidedAt) { const r=await this.executor.query("UPDATE atlas_ai_action_proposal SET status=$4,version=version+1,decided_by=$5,result_object_id=$6,decided_at=$7 WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='pending' RETURNING *",[workspaceId,id,version,status,decidedBy,resultObjectId,decidedAt]); if(!r.rows[0]){const current=await this.getAiActionProposal(workspaceId,id); if(current.status!=='pending') throw new AtlasError('AI_ACTION_ALREADY_DECIDED','AI action proposal has already been decided',409); throw new AtlasError('VERSION_CONFLICT','AI action proposal version is stale',409,{currentVersion:current.version});} return aiActionProposal(r.rows[0]); }
  async createIntelligenceJob(v) { const r=await this.executor.query('INSERT INTO atlas_intelligence_job (id,workspace_id,trigger_type,object_id,event_id,status,attempts,payload,result,provider,error_code,available_at,locked_at,created_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[v.id,v.workspaceId,v.triggerType,v.objectId,v.eventId,v.status,v.attempts,v.payload,v.result,v.provider,v.errorCode,v.availableAt,v.lockedAt,v.createdAt,v.completedAt]); return intelligenceJob(r.rows[0]); }
  async listIntelligenceJobs(workspaceId) { const r=await this.executor.query('SELECT * FROM atlas_intelligence_job WHERE workspace_id=$1 ORDER BY created_at,id',[workspaceId]); return r.rows.map(intelligenceJob); }
  async claimIntelligenceJob(now) { const r=await this.executor.query("WITH next AS (SELECT id FROM atlas_intelligence_job WHERE status='pending' AND available_at<=$1 ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE atlas_intelligence_job j SET status='processing',attempts=j.attempts+1,locked_at=$1 FROM next WHERE j.id=next.id RETURNING j.*",[now]); return r.rows[0]?intelligenceJob(r.rows[0]):null; }
  async completeIntelligenceJob(id,result,provider,now) { const r=await this.executor.query("UPDATE atlas_intelligence_job SET status='completed',result=$2,provider=$3,error_code=NULL,completed_at=$4 WHERE id=$1 AND status='processing' RETURNING *",[id,result,provider,now]); if(!r.rows[0])throw new AtlasError('INTELLIGENCE_JOB_STATE_CONFLICT','Intelligence job is not processing',409); return intelligenceJob(r.rows[0]); }
  async failIntelligenceJob(id,errorCode,now,maxAttempts) { const r=await this.executor.query("UPDATE atlas_intelligence_job SET status=CASE WHEN attempts >= $4 THEN 'failed' ELSE 'pending' END,error_code=$2,locked_at=NULL,available_at=$3 WHERE id=$1 AND status='processing' RETURNING *",[id,errorCode,now,maxAttempts]); if(!r.rows[0])throw new AtlasError('INTELLIGENCE_JOB_STATE_CONFLICT','Intelligence job is not processing',409); return intelligenceJob(r.rows[0]); }
  async createIntelligenceObservation(v) { const r=await this.executor.query('INSERT INTO atlas_intelligence_observation (id,workspace_id,job_id,source_object_id,kind,data,confidence,source_location,provider,status,reviewed_by,reviewed_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[v.id,v.workspaceId,v.jobId,v.sourceObjectId,v.kind,v.data,v.confidence,v.sourceLocation,v.provider,v.status,v.reviewedBy,v.reviewedAt,v.createdAt]); return intelligenceObservation(r.rows[0]); }
  async createDocumentKnowledgeEmbedding(v){const r=await this.executor.query('INSERT INTO atlas_document_knowledge_embedding (id,workspace_id,observation_id,provider,model,dimensions,embedding,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (observation_id,provider,model) DO UPDATE SET observation_id=EXCLUDED.observation_id RETURNING *',[v.id,v.workspaceId,v.observationId,v.provider,v.model,v.dimensions,JSON.stringify(v.embedding),v.createdAt]);const row=r.rows[0];return {id:row.id,workspaceId:row.workspace_id,observationId:row.observation_id,provider:row.provider,model:row.model,dimensions:row.dimensions,embedding:row.embedding,createdAt:iso(row.created_at)};}
  async listDocumentKnowledgeEmbeddings(workspaceId,model){const values=[workspaceId];let sql='SELECT * FROM atlas_document_knowledge_embedding WHERE workspace_id=$1';if(model){values.push(model);sql+=' AND model=$2';}const r=await this.executor.query(`${sql} ORDER BY created_at DESC,id`,values);return r.rows.map(row=>({id:row.id,workspaceId:row.workspace_id,observationId:row.observation_id,provider:row.provider,model:row.model,dimensions:row.dimensions,embedding:row.embedding,createdAt:iso(row.created_at)}));}
  async listUnembeddedDocumentObservations(workspaceId,model,limit){const r=await this.executor.query("SELECT o.*,d.title document_title FROM atlas_intelligence_observation o JOIN atlas_object d ON d.id=o.source_object_id AND d.workspace_id=o.workspace_id AND d.dimension='document' AND d.deleted_at IS NULL LEFT JOIN atlas_document_knowledge_embedding e ON e.observation_id=o.id AND e.model=$2 WHERE o.workspace_id=$1 AND o.status<>'rejected' AND e.id IS NULL ORDER BY o.created_at,o.id LIMIT $3",[workspaceId,model,limit]);return r.rows.map(row=>({...intelligenceObservation(row),documentTitle:row.document_title}));}
  async createDocumentKnowledgeChunk(v){const r=await this.executor.query('INSERT INTO atlas_document_knowledge_chunk (id,workspace_id,source_object_id,ordinal,content,source_location,provider,model,dimensions,embedding,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (workspace_id,source_object_id,model,ordinal) DO UPDATE SET source_object_id=EXCLUDED.source_object_id RETURNING *',[v.id,v.workspaceId,v.sourceObjectId,v.ordinal,v.content,v.sourceLocation,v.provider,v.model,v.dimensions,JSON.stringify(v.embedding),v.createdAt]);const row=r.rows[0];return {id:row.id,workspaceId:row.workspace_id,sourceObjectId:row.source_object_id,ordinal:row.ordinal,content:row.content,sourceLocation:row.source_location,provider:row.provider,model:row.model,dimensions:row.dimensions,embedding:row.embedding,createdAt:iso(row.created_at)};}
  async listDocumentKnowledgeChunks(workspaceId,model){const values=[workspaceId];let sql='SELECT * FROM atlas_document_knowledge_chunk WHERE workspace_id=$1';if(model){values.push(model);sql+=' AND model=$2';}const r=await this.executor.query(`${sql} ORDER BY source_object_id,ordinal`,values);return r.rows.map(row=>({id:row.id,workspaceId:row.workspace_id,sourceObjectId:row.source_object_id,ordinal:row.ordinal,content:row.content,sourceLocation:row.source_location,provider:row.provider,model:row.model,dimensions:row.dimensions,embedding:row.embedding,createdAt:iso(row.created_at)}));}
  async listUnchunkedStoredDocuments(workspaceId,model,limit){const r=await this.executor.query("SELECT d.* FROM atlas_object d WHERE d.workspace_id=$1 AND d.dimension='document' AND d.deleted_at IS NULL AND d.state->>'storageRef' LIKE ('atlas-blob://' || $1 || '/%') AND NOT EXISTS (SELECT 1 FROM atlas_document_knowledge_chunk c WHERE c.workspace_id=$1 AND c.source_object_id=d.id AND c.model=$2) ORDER BY d.created_at,d.id LIMIT $3",[workspaceId,model,limit]);return r.rows.map(object);}
  async listIntelligenceObservations(workspaceId,status) { const values=[workspaceId];let sql='SELECT * FROM atlas_intelligence_observation WHERE workspace_id=$1';if(status){values.push(status);sql+=' AND status=$2';}const r=await this.executor.query(`${sql} ORDER BY created_at DESC,id`,values);return r.rows.map(intelligenceObservation); }
  async getIntelligenceObservation(workspaceId,id) { const r=await this.executor.query('SELECT * FROM atlas_intelligence_observation WHERE workspace_id=$1 AND id=$2',[workspaceId,id]);if(!r.rows[0])throw new AtlasError('INTELLIGENCE_OBSERVATION_NOT_FOUND','Intelligence observation not found',404);return intelligenceObservation(r.rows[0]); }
  async reviewIntelligenceObservation(workspaceId,id,status,reviewedBy,reviewedAt) { const r=await this.executor.query("UPDATE atlas_intelligence_observation SET status=$3,reviewed_by=$4,reviewed_at=$5 WHERE workspace_id=$1 AND id=$2 AND status='candidate' RETURNING *",[workspaceId,id,status,reviewedBy,reviewedAt]);if(!r.rows[0]){const current=await this.getIntelligenceObservation(workspaceId,id);if(current.status!=='candidate')throw new AtlasError('INTELLIGENCE_OBSERVATION_ALREADY_REVIEWED','Intelligence observation has already been reviewed',409);}return intelligenceObservation(r.rows[0]); }
  async findIngestionRecord(workspaceId,connector,externalId) { const r=await this.executor.query('SELECT * FROM atlas_ingestion_record WHERE workspace_id=$1 AND connector=$2 AND external_id=$3',[workspaceId,connector,externalId]);return r.rows[0]?ingestionRecord(r.rows[0]):null; }
  async createIngestionRecord(v) { try{const r=await this.executor.query('INSERT INTO atlas_ingestion_record (id,workspace_id,connector,external_id,kind,status,root_object_id,metadata,error_code,received_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[v.id,v.workspaceId,v.connector,v.externalId,v.kind,v.status,v.rootObjectId,v.metadata,v.errorCode,v.receivedAt,v.createdAt]);return ingestionRecord(r.rows[0]);}catch(error){if(error.code==='23505')throw new AtlasError('INGESTION_EXISTS','Ingestion record already exists',409);throw error;} }
  async createCmsAuthorization(v){const r=await this.executor.query('INSERT INTO atlas_cms_authorization (state_hash,workspace_id,provider,actor_id,verifier_ref,redirect_uri,expires_at,used_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[v.stateHash,v.workspaceId,v.provider,v.actorId,v.verifierRef,v.redirectUri,v.expiresAt,v.usedAt,v.createdAt]);return cmsAuthorization(r.rows[0]);}
  async consumeCmsAuthorization(stateHash,usedAt){const r=await this.executor.query('UPDATE atlas_cms_authorization SET used_at=$2 WHERE state_hash=$1 AND used_at IS NULL RETURNING *',[stateHash,usedAt]);if(!r.rows[0])throw new AtlasError('CMS_AUTHORIZATION_INVALID','CMS authorization is invalid or already used',400);return cmsAuthorization(r.rows[0]);}
  async createCmsConnection(v){try{const r=await this.executor.query('INSERT INTO atlas_cms_connection (id,workspace_id,provider,credential_ref,status,access_mode,cursor,last_synced_at,error_code,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[v.id,v.workspaceId,v.provider,v.credentialRef,v.status,v.accessMode,v.cursor,v.lastSyncedAt,v.errorCode,v.createdBy,v.createdAt,v.updatedAt]);return cmsConnection(r.rows[0]);}catch(error){if(error.code==='23505')throw new AtlasError('CMS_CONNECTION_EXISTS','CMS provider is already connected',409);throw error;}}
  async getCmsConnection(workspaceId,id){const r=await this.executor.query('SELECT * FROM atlas_cms_connection WHERE workspace_id=$1 AND id=$2',[workspaceId,id]);if(!r.rows[0])throw new AtlasError('CMS_CONNECTION_NOT_FOUND','CMS connection not found',404);return cmsConnection(r.rows[0]);}
  async listCmsConnections(workspaceId){const r=await this.executor.query('SELECT * FROM atlas_cms_connection WHERE workspace_id=$1 ORDER BY created_at,id',[workspaceId]);return r.rows.map(cmsConnection);}
  async listActiveCmsConnections(){const r=await this.executor.query("SELECT * FROM atlas_cms_connection WHERE status IN ('connected','error') ORDER BY updated_at,id");return r.rows.map(cmsConnection);}
  async updateCmsConnection(id,changes){const r=await this.executor.query('UPDATE atlas_cms_connection SET status=COALESCE($2,status),cursor=COALESCE($3,cursor),last_synced_at=COALESCE($4,last_synced_at),error_code=$5,updated_at=COALESCE($6,updated_at) WHERE id=$1 RETURNING *',[id,changes.status??null,changes.cursor??null,changes.lastSyncedAt??null,changes.errorCode??null,changes.updatedAt??null]);if(!r.rows[0])throw new AtlasError('CMS_CONNECTION_NOT_FOUND','CMS connection not found',404);return cmsConnection(r.rows[0]);}
  async findCmsRecordLink(connectionId,externalType,externalId){const r=await this.executor.query('SELECT * FROM atlas_cms_record_link WHERE connection_id=$1 AND external_type=$2 AND external_id=$3',[connectionId,externalType,externalId]);return r.rows[0]?cmsRecordLink(r.rows[0]):null;}
  async createCmsRecordLink(v){const r=await this.executor.query('INSERT INTO atlas_cms_record_link (id,workspace_id,connection_id,external_type,external_id,atlas_object_id,source_updated_at,source_checksum,last_synced_at,source_deleted_at,reconciliation_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[v.id,v.workspaceId,v.connectionId,v.externalType,v.externalId,v.atlasObjectId,v.sourceUpdatedAt,v.sourceChecksum,v.lastSyncedAt,v.sourceDeletedAt??null,v.reconciliationStatus??'active']);return cmsRecordLink(r.rows[0]);}
  async updateCmsRecordLink(id,changes){const r=await this.executor.query('UPDATE atlas_cms_record_link SET source_updated_at=$2,source_checksum=$3,last_synced_at=$4,source_deleted_at=$5,reconciliation_status=$6 WHERE id=$1 RETURNING *',[id,changes.sourceUpdatedAt,changes.sourceChecksum,changes.lastSyncedAt,changes.sourceDeletedAt??null,changes.reconciliationStatus??'active']);if(!r.rows[0])throw new AtlasError('CMS_RECORD_LINK_NOT_FOUND','CMS record link not found',404);return cmsRecordLink(r.rows[0]);}
  async createEncryptedSecret(v){const r=await this.executor.query('INSERT INTO atlas_encrypted_secret (id,purpose,ciphertext,created_at) VALUES ($1,$2,$3,$4) RETURNING *',[v.id,v.purpose,v.ciphertext,v.createdAt]);return r.rows[0];}
  async getEncryptedSecret(id){const r=await this.executor.query('SELECT * FROM atlas_encrypted_secret WHERE id=$1',[id]);if(!r.rows[0])throw new AtlasError('CMS_CREDENTIAL_UNAVAILABLE','CMS credential is unavailable',503);return {id:r.rows[0].id,purpose:r.rows[0].purpose,ciphertext:r.rows[0].ciphertext,createdAt:iso(r.rows[0].created_at)};}
  async updateEncryptedSecret(id,changes){const r=await this.executor.query('UPDATE atlas_encrypted_secret SET ciphertext=$2 WHERE id=$1 RETURNING *',[id,changes.ciphertext]);if(!r.rows[0])throw new AtlasError('CMS_CREDENTIAL_UNAVAILABLE','CMS credential is unavailable',503);return {id:r.rows[0].id,purpose:r.rows[0].purpose,ciphertext:r.rows[0].ciphertext,createdAt:iso(r.rows[0].created_at)};}
  async deleteEncryptedSecret(id){await this.executor.query('DELETE FROM atlas_encrypted_secret WHERE id=$1',[id]);return {deleted:true};}
  async createAwarenessItem(v){try{const r=await this.executor.query('INSERT INTO atlas_awareness_item (id,workspace_id,target_user_id,source_job_id,source_object_id,category,priority,headline,summary,observation_ids,action_proposal_ids,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[v.id,v.workspaceId,v.targetUserId,v.sourceJobId,v.sourceObjectId,v.category,v.priority,v.headline,v.summary,v.observationIds,v.actionProposalIds,v.createdAt]);return awarenessItem(r.rows[0]);}catch(error){if(error.code==='23505')throw new AtlasError('AWARENESS_ITEM_EXISTS','Awareness item already exists for job',409);throw error;}}
  async listAwarenessItems(workspaceId,userId,since){const r=await this.executor.query("SELECT i.*,COALESCE(r.status,'unseen') review_status FROM atlas_awareness_item i LEFT JOIN atlas_awareness_receipt r ON r.item_id=i.id AND r.user_id=$2 WHERE i.workspace_id=$1 AND (i.target_user_id IS NULL OR i.target_user_id=$2) AND ($3::timestamptz IS NULL OR i.created_at>$3) ORDER BY i.created_at DESC,i.id",[workspaceId,userId,since??null]);return r.rows.map(awarenessItem);}
  async updateAwarenessReceipt(workspaceId,itemId,userId,status,updatedAt){const r=await this.executor.query("INSERT INTO atlas_awareness_receipt (item_id,user_id,status,updated_at) SELECT id,$3,$4,$5 FROM atlas_awareness_item WHERE workspace_id=$1 AND id=$2 AND (target_user_id IS NULL OR target_user_id=$3) ON CONFLICT (item_id,user_id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at RETURNING *",[workspaceId,itemId,userId,status,updatedAt]);if(!r.rows[0])throw new AtlasError('AWARENESS_ITEM_NOT_FOUND','Awareness item not found',404);return {itemId:r.rows[0].item_id,userId:r.rows[0].user_id,status:r.rows[0].status,updatedAt:iso(r.rows[0].updated_at)};}
  async createAutomationMarker(workspaceId,markerKey,createdAt){const r=await this.executor.query('INSERT INTO atlas_automation_marker (workspace_id,marker_key,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING marker_key',[workspaceId,markerKey,createdAt]);return Boolean(r.rows[0]);}
  async acquireSchedulerLease(leaseKey,ownerId,now,expiresAt){const r=await this.executor.query(`INSERT INTO atlas_scheduler_lease (lease_key,owner_id,acquired_at,expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (lease_key) DO UPDATE SET owner_id=EXCLUDED.owner_id,acquired_at=EXCLUDED.acquired_at,expires_at=EXCLUDED.expires_at WHERE atlas_scheduler_lease.expires_at <= $3 OR atlas_scheduler_lease.owner_id = $2 RETURNING lease_key`,[leaseKey,ownerId,now,expiresAt]);return Boolean(r.rows[0]);}
  async renewSchedulerLease(leaseKey,ownerId,now,expiresAt){const r=await this.executor.query('UPDATE atlas_scheduler_lease SET expires_at=$4 WHERE lease_key=$1 AND owner_id=$2 AND expires_at>$3 RETURNING lease_key',[leaseKey,ownerId,now,expiresAt]);return Boolean(r.rows[0]);}
  async releaseSchedulerLease(leaseKey,ownerId){const r=await this.executor.query('DELETE FROM atlas_scheduler_lease WHERE lease_key=$1 AND owner_id=$2 RETURNING lease_key',[leaseKey,ownerId]);return Boolean(r.rows[0]);}
}
