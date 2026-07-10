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
function membership(row) { return { id: row.id, workspaceId: row.workspace_id, userId: row.user_id, role: row.role, createdAt: iso(row.created_at) }; }
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

export class PostgresRepository {
  constructor(executor, pool = executor) {
    this.executor = executor;
    this.pool = pool;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PostgresRepository(client, this.pool));
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
    const conditions = ['workspace_id = $1', 'deleted_at IS NULL'];
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
    return event(result.rows[0]);
  }

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
        `INSERT INTO atlas_workspace_membership (id, workspace_id, user_id, role, created_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [value.id, value.workspaceId, value.userId, value.role, value.createdAt]);
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
}
