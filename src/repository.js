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

  async transaction(work) {
    const snapshot = [this.#workspaces, this.#objects, this.#relationships, this.#events, this.#users, this.#memberships]
      .map((map) => new Map([...map].map(([key, value]) => [key, clone(value)])));
    try { return await work(this); }
    catch (error) {
      [this.#workspaces, this.#objects, this.#relationships, this.#events, this.#users, this.#memberships] = snapshot;
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

  getObject(workspaceId, id) {
    const object = this.#objects.get(id);
    if (!object || object.workspaceId !== workspaceId || object.deletedAt) {
      throw new AtlasError('OBJECT_NOT_FOUND', 'Object not found', 404);
    }
    return clone(object);
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
}
