import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler } from '../src/http.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { IdentityService, TokenService } from '../src/identity.js';
import { AtlasAssistant, AtlasToolRegistry } from '../src/assistant.js';

function fixture() {
  return createAtlasHandler(new AtlasService(new InMemoryRepository()), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: ['https://atlas.example'] },
    ready: async () => true
  });
}

async function json(handler, url, options = {}) {
  const request = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  request.method = options.method ?? 'GET';
  request.url = url;
  request.headers = options.headers ?? {};
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, body: JSON.parse(body), headers: this.headers }); }
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

test('health endpoint reports the running release', async () => {
  const response = await json(fixture(), '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { data: { status: 'ok', version: '0.13.0' } });
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
});

test('readiness returns 503 when its dependency fails', async () => {
  const handler = createAtlasHandler(new AtlasService(new InMemoryRepository()), {
    config: { maxBodyBytes: 100, corsOrigins: [] },
    ready: async () => { throw new Error('database unavailable'); }
  });
  const response = await json(handler, '/ready');
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'NOT_READY');
});

test('rejects oversized JSON bodies', async () => {
  const handler = createAtlasHandler(new AtlasService(new InMemoryRepository()), {
    config: { maxBodyBytes: 10, corsOrigins: [] }, ready: async () => true
  });
  const response = await json(handler, '/v1/workspaces', { method: 'POST', body: JSON.stringify({ name: 'far too large' }) });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('allows configured CORS origins and rejects others', async () => {
  const allowed = await json(fixture(), '/health', { headers: { origin: 'https://atlas.example' } });
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://atlas.example');
  const denied = await json(fixture(), '/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'CORS_ORIGIN_DENIED');
});

test('HTTP vertical slice creates workspace, matter, evidence, graph, timeline, and health', async () => {
    const handler = fixture();
    const workspaceResponse = await json(handler, '/v1/workspaces', { method: 'POST', body: JSON.stringify({ name: 'Atlas Test' }) });
    assert.equal(workspaceResponse.status, 201);
    const workspaceId = workspaceResponse.body.data.id;
    const createObject = (body) => json(handler, `/v1/workspaces/${workspaceId}/objects`, { method: 'POST', body: JSON.stringify(body) });
    const matter = (await createObject({ dimension: 'matter', type: 'criminal', title: 'State v. Atlas' })).body.data;
    const evidence = (await createObject({ dimension: 'evidence', type: 'video', title: 'Body camera' })).body.data;
    const relation = await json(handler, `/v1/workspaces/${workspaceId}/relationships`, { method: 'POST', body: JSON.stringify({ fromObjectId: evidence.id, toObjectId: matter.id, type: 'supports' }) });
    assert.equal(relation.status, 201);
    const graph = await json(handler, `/v1/workspaces/${workspaceId}/objects/${matter.id}/graph`);
    assert.equal(graph.body.data.nodes[0].id, evidence.id);
    const timeline = await json(handler, `/v1/workspaces/${workspaceId}/events?parentObjectId=${matter.id}`);
    assert.equal(timeline.body.data[0].type, 'object.created');
    const health = await json(handler, `/v1/workspaces/${workspaceId}/matters/${matter.id}/health`);
    assert.equal(health.body.data.score, 65);
});

test('HTTP errors have stable structured responses', async () => {
    const handler = fixture();
    const missing = await json(handler, '/v1/workspaces/wsp_missing');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'WORKSPACE_NOT_FOUND');
    const invalid = await json(handler, '/v1/workspaces', { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_JSON');
});

test('authenticated HTTP flow enforces workspace roles', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  const register = (email, name) => json(handler, '/v1/auth/register', {
    method: 'POST', body: JSON.stringify({ email, name, password: 'correct horse battery staple' })
  });
  const owner = (await register('owner@example.com', 'Owner')).body.data;
  const viewer = (await register('viewer@example.com', 'Viewer')).body.data;
  const bearer = (token) => ({ authorization: `Bearer ${token}` });
  const workspaceResponse = await json(handler, '/v1/workspaces', {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ name: 'Protected Firm' })
  });
  assert.equal(workspaceResponse.status, 201);
  const workspaceId = workspaceResponse.body.data.id;
  const addViewer = await json(handler, `/v1/workspaces/${workspaceId}/memberships`, {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ userId: viewer.user.id, role: 'viewer' })
  });
  assert.equal(addViewer.status, 201);
  const deniedWrite = await json(handler, `/v1/workspaces/${workspaceId}/objects`, {
    method: 'POST', headers: bearer(viewer.accessToken), body: JSON.stringify({ dimension: 'matter', type: 'civil', title: 'Denied' })
  });
  assert.equal(deniedWrite.status, 403);
  assert.equal(deniedWrite.body.error.code, 'ACCESS_DENIED');
  const allowedRead = await json(handler, `/v1/workspaces/${workspaceId}/objects`, { headers: bearer(viewer.accessToken) });
  assert.equal(allowedRead.status, 200);
  const created = await json(handler, `/v1/workspaces/${workspaceId}/objects`, {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ dimension: 'matter', type: 'civil', title: 'Versioned matter' })
  });
  const objectId = created.body.data.id;
  const updated = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}`, {
    method: 'PATCH', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 1, title: 'Updated matter' })
  });
  assert.equal(updated.body.data.version, 2);
  const stale = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}`, {
    method: 'PATCH', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 1, title: 'Stale update' })
  });
  assert.equal(stale.status, 409);
  const deleted = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}`, {
    method: 'DELETE', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 2 })
  });
  assert.equal(deleted.body.data.version, 3);
  const restored = await json(handler, `/v1/workspaces/${workspaceId}/objects/${objectId}/restore`, {
    method: 'POST', headers: bearer(owner.accessToken), body: JSON.stringify({ version: 3 })
  });
  assert.equal(restored.body.data.version, 4);
  const audits = await json(handler, `/v1/workspaces/${workspaceId}/audit?objectId=${objectId}`, { headers: bearer(owner.accessToken) });
  assert.deepEqual(audits.body.data.map((entry) => entry.action), ['object.updated', 'object.deleted', 'object.restored']);
  const missingToken = await json(handler, `/v1/workspaces/${workspaceId}`);
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.body.error.code, 'AUTHENTICATION_REQUIRED');
});

test('HTTP refresh rotates sessions and logout prevents further refresh', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  const registered = await json(handler, '/v1/auth/register', {
    method: 'POST', body: JSON.stringify({ email: 'session@example.com', name: 'Session', password: 'correct horse battery staple' })
  });
  const original = registered.body.data.refreshToken;
  const refreshed = await json(handler, '/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: original }) });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.data.refreshToken, original);
  const logout = await json(handler, '/v1/auth/logout', {
    method: 'POST', body: JSON.stringify({ refreshToken: refreshed.body.data.refreshToken })
  });
  assert.deepEqual(logout.body.data, { revoked: true });
  const denied = await json(handler, '/v1/auth/refresh', {
    method: 'POST', body: JSON.stringify({ refreshToken: refreshed.body.data.refreshToken })
  });
  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, 'REFRESH_TOKEN_REUSED');
});

test('HTTP password recovery uses the delivery boundary and replaces credentials', async () => {
  let delivered;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    deliverPasswordReset: async (message) => { delivered = message; }
  });
  const handler = createAtlasHandler(new AtlasService(repository), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'recover-http@example.com', name: 'Recover', password: 'original password long enough' }) });
  const requested = await json(handler, '/v1/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email: 'recover-http@example.com' }) });
  assert.deepEqual(requested.body.data, { accepted: true });
  assert.ok(delivered.resetToken);
  const completed = await json(handler, '/v1/auth/password-reset/complete', { method: 'POST', body: JSON.stringify({ resetToken: delivered.resetToken, password: 'replacement password long enough' }) });
  assert.deepEqual(completed.body.data, { reset: true });
  const login = await json(handler, '/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'recover-http@example.com', password: 'replacement password long enough' }) });
  assert.equal(login.status, 200);
});

test('HTTP session inventory supports individual and global logout', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(new AtlasService(repository), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  const credentials = { email: 'inventory@example.com', password: 'original password long enough' };
  const registered = (await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, name: 'Inventory' }) })).body.data;
  const loggedIn = (await json(handler, '/v1/auth/login', { method: 'POST', body: JSON.stringify(credentials) })).body.data;
  const headers = { authorization: `Bearer ${loggedIn.accessToken}` };
  const inventory = await json(handler, '/v1/auth/sessions', { headers });
  assert.equal(inventory.status, 200);
  assert.equal(inventory.body.data.length, 2);
  const current = inventory.body.data.find((session) => session.current);
  assert.ok(current);
  const revoked = await json(handler, `/v1/auth/sessions/${current.id}`, { method: 'DELETE', headers });
  assert.equal(revoked.body.data.sessionId, current.id);
  const immediatelyDenied = await json(handler, '/v1/auth/sessions', { headers });
  assert.equal(immediatelyDenied.body.error.code, 'ACCESS_TOKEN_REVOKED');
  const remainingHeaders = { authorization: `Bearer ${registered.accessToken}` };
  const all = await json(handler, '/v1/auth/sessions', { method: 'DELETE', headers: remainingHeaders });
  assert.deepEqual(all.body.data, { revoked: true });
  const globallyDenied = await json(handler, '/v1/auth/sessions', { headers: remainingHeaders });
  assert.equal(globallyDenied.body.error.code, 'ACCESS_TOKEN_REVOKED');
  const denied = await json(handler, '/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: registered.refreshToken }) });
  assert.equal(denied.body.error.code, 'REFRESH_TOKEN_REUSED');
});

test('HTTP login throttling returns a stable timed-lockout response', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    loginFailureThreshold: 2, loginFailureWindowSeconds: 300, loginLockSeconds: 60
  });
  const handler = createAtlasHandler(new AtlasService(repository), {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity
  });
  await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'locked-http@example.com', name: 'Locked', password: 'correct password long enough' }) });
  const fail = () => json(handler, '/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'locked-http@example.com', password: 'wrong password' }) });
  assert.equal((await fail()).body.error.code, 'INVALID_CREDENTIALS');
  const locked = await fail();
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
  assert.ok(locked.body.error.details.lockedUntil);
});

test('authenticated assistant endpoint is workspace-scoped and source-aware', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const model = { async complete(input) {
    assert.equal(input.context.userId.startsWith('usr_'), true);
    return { text: 'Your highest-priority matter is ready for review.' };
  } };
  const assistant = new AtlasAssistant(model, new AtlasToolRegistry(service), { repository });
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity, assistant
  });
  const registered = (await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'ai@example.com', name: 'AI User', password: 'correct password long enough' }) })).body.data;
  const headers = { authorization: `Bearer ${registered.accessToken}` };
  const workspace = (await json(handler, '/v1/workspaces', { method: 'POST', headers, body: JSON.stringify({ name: 'AI Firm' }) })).body.data;
  const response = await json(handler, `/v1/workspaces/${workspace.id}/assistant/query`, {
    method: 'POST', headers, body: JSON.stringify({ prompt: 'What matters today?' })
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.answer, 'Your highest-priority matter is ready for review.');
  const history = await json(handler, `/v1/workspaces/${workspace.id}/assistant/runs`, { headers });
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 1);
  assert.equal(history.body.data[0].status, 'completed');
  assert.equal(history.body.data[0].prompt, 'What matters today?');
});

test('assistant endpoint reports unavailable providers without pretending AI ran', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const handler = createAtlasHandler(service, {
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }, ready: async () => true, identity,
    assistant: new AtlasAssistant(null, new AtlasToolRegistry(service))
  });
  const registered = (await json(handler, '/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: 'no-ai@example.com', name: 'No AI', password: 'correct password long enough' }) })).body.data;
  const headers = { authorization: `Bearer ${registered.accessToken}` };
  const workspace = (await json(handler, '/v1/workspaces', { method: 'POST', headers, body: JSON.stringify({ name: 'No AI Firm' }) })).body.data;
  const response = await json(handler, `/v1/workspaces/${workspace.id}/assistant/query`, { method: 'POST', headers, body: JSON.stringify({ prompt: 'Help' }) });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'AI_NOT_CONFIGURED');
});
