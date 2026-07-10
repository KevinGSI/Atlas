import { createServer } from 'node:http';
import { AtlasError } from './errors.js';

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AtlasError('INVALID_JSON', 'Request body must be valid JSON', 400); }
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function route(method, pathname) {
  const patterns = [
    ['GET', /^\/health$/, 'health'],
    ['POST', /^\/v1\/workspaces$/, 'createWorkspace'],
    ['GET', /^\/v1\/workspaces\/([^/]+)$/, 'getWorkspace'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/objects$/, 'createObject'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/objects$/, 'listObjects'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)$/, 'getObject'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/relationships$/, 'createRelationship'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)\/graph$/, 'graph'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/events$/, 'createEvent'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/events$/, 'listEvents'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/matters\/([^/]+)\/health$/, 'matterHealth']
  ];
  for (const [expectedMethod, regex, name] of patterns) {
    const match = pathname.match(regex);
    if (method === expectedMethod && match) return { name, params: match.slice(1) };
  }
  return null;
}

export function createAtlasHandler(service) {
  return async (request, response) => {
    try {
      const url = new URL(request.url, 'http://atlas.local');
      const match = route(request.method, url.pathname);
      if (!match) throw new AtlasError('ROUTE_NOT_FOUND', 'Route not found', 404);
      const [workspaceId, objectId] = match.params;
      let result;
      switch (match.name) {
        case 'health': result = { status: 'ok', version: '0.1.0' }; break;
        case 'createWorkspace': result = service.createWorkspace(await readJson(request)); break;
        case 'getWorkspace': result = service.getWorkspace(workspaceId); break;
        case 'createObject': result = service.createObject(workspaceId, await readJson(request)); break;
        case 'listObjects': result = service.listObjects(workspaceId, { type: url.searchParams.get('type'), dimension: url.searchParams.get('dimension') }); break;
        case 'getObject': result = service.getObject(workspaceId, objectId); break;
        case 'createRelationship': result = service.createRelationship(workspaceId, await readJson(request)); break;
        case 'graph': result = service.expandGraph(workspaceId, objectId); break;
        case 'createEvent': result = service.createEvent(workspaceId, await readJson(request)); break;
        case 'listEvents': result = service.listEvents(workspaceId, url.searchParams.get('parentObjectId')); break;
        case 'matterHealth': result = service.matterHealth(workspaceId, objectId); break;
      }
      send(response, match.name.startsWith('create') ? 201 : 200, { data: result });
    } catch (error) {
      const known = error instanceof AtlasError;
      send(response, known ? error.status : 500, {
        error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Internal server error', ...(known && error.details ? { details: error.details } : {}) }
      });
    }
  };
}

export function createAtlasServer(service) {
  return createServer(createAtlasHandler(service));
}
