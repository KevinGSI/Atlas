import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler } from '../src/http.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

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
  assert.deepEqual(response.body, { data: { status: 'ok', version: '0.3.0' } });
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
