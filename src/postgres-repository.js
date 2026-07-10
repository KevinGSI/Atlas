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

  async getObject(workspaceId, id) {
    const result = await this.executor.query(
      'SELECT * FROM atlas_object WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL', [workspaceId, id]);
    if (!result.rows[0]) throw new AtlasError('OBJECT_NOT_FOUND', 'Object not found', 404);
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
}
