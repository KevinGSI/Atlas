import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AtlasError } from './errors.js';
import { phaseOneAsset } from './phase-one-web.js';

async function readJson(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new AtlasError('PAYLOAD_TOO_LARGE', 'Request body is too large', 413);
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AtlasError('INVALID_JSON', 'Request body must be valid JSON', 400); }
}

function securityHeaders(requestId) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-atlas-request-id': requestId
  };
}

function corsHeaders(origin, config) {
  if (!origin) return {};
  if (!config.corsOrigins.includes(origin) && !config.corsOrigins.includes('*')) {
    throw new AtlasError('CORS_ORIGIN_DENIED', 'Origin is not allowed', 403);
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-atlas-request-id',
    'access-control-max-age': '600',
    vary: 'Origin'
  };
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { ...headers, 'content-length': Buffer.byteLength(JSON.stringify(body)) });
  response.end(JSON.stringify(body));
}

function sendAsset(response,asset,headers={}){response.writeHead(200,{...headers,'content-type':asset.contentType,'content-length':asset.content.length,'content-security-policy':"default-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'"});response.end(asset.content);}

function route(method, pathname) {
  const patterns = [
    ['GET', /^\/$/, 'frontendIndex'],
    ['GET', /^\/app\.js$/, 'frontendApp'],
    ['GET', /^\/health$/, 'health'],
    ['GET', /^\/live$/, 'live'],
    ['GET', /^\/ready$/, 'ready'],
    ['POST', /^\/v1\/auth\/register$/, 'register'],
    ['POST', /^\/v1\/auth\/login$/, 'login'],
    ['POST', /^\/v1\/auth\/refresh$/, 'refresh'],
    ['POST', /^\/v1\/auth\/logout$/, 'logout'],
    ['POST', /^\/v1\/auth\/password-reset\/request$/, 'requestPasswordReset'],
    ['POST', /^\/v1\/auth\/password-reset\/complete$/, 'resetPassword'],
    ['GET', /^\/v1\/cms\/oauth\/callback$/, 'cmsOAuthCallback'],
    ['GET', /^\/v1\/auth\/sessions$/, 'listSessions'],
    ['DELETE', /^\/v1\/auth\/sessions$/, 'revokeAllSessions'],
    ['DELETE', /^\/v1\/auth\/sessions\/([^/]+)$/, 'revokeSession'],
    ['POST', /^\/v1\/workspaces$/, 'createWorkspace'],
    ['GET', /^\/v1\/workspaces\/([^/]+)$/, 'getWorkspace'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/memberships$/, 'createMembership'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/memberships$/, 'listMemberships'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/objects$/, 'createObject'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/objects$/, 'listObjects'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)$/, 'getObject'],
    ['PATCH', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)$/, 'updateObject'],
    ['DELETE', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)$/, 'deleteObject'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)\/restore$/, 'restoreObject'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/audit$/, 'listAudits'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/relationships$/, 'createRelationship'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)\/graph$/, 'graph'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/events$/, 'createEvent'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/events$/, 'listEvents'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/matters\/([^/]+)\/health$/, 'matterHealth'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/assistant\/query$/, 'assistantQuery'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/assistant\/runs$/, 'listAssistantRuns'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/assistant\/conversations$/, 'listAssistantConversations'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/assistant\/conversations\/([^/]+)\/messages$/, 'listAssistantMessages']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/assistant\/actions$/, 'listAssistantActions']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/assistant\/actions\/([^/]+)\/decision$/, 'decideAssistantAction']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/intelligence\/review-inbox$/, 'intelligenceReviewInbox']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/ingestions\/email$/, 'ingestEmail']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/intelligence\/search$/, 'searchTwin']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/intelligence\/observations\/([^/]+)\/decision$/, 'decideIntelligenceObservation']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/cms\/([^/]+)\/authorize$/, 'beginCmsAuthorization']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/cms\/connections$/, 'listCmsConnections']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/cms\/connections\/([^/]+)\/sync$/, 'syncCmsConnection']
    ,['DELETE', /^\/v1\/workspaces\/([^/]+)\/cms\/connections\/([^/]+)$/, 'disconnectCmsConnection']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/home\/while-you-were-gone$/, 'whileYouWereGone']
    ,['PATCH', /^\/v1\/workspaces\/([^/]+)\/home\/while-you-were-gone\/([^/]+)$/, 'updateAwarenessStatus']
  ];
  for (const [expectedMethod, regex, name] of patterns) {
    const match = pathname.match(regex);
    if (method === expectedMethod && match) return { name, params: match.slice(1) };
  }
  return null;
}

export function createAtlasHandler(service, options = {}) {
  const config = options.config ?? { maxBodyBytes: 1_048_576, corsOrigins: [] };
  const ready = options.ready ?? (async () => true);
  const identity = options.identity;
  const assistant = options.assistant;
  const ingestion = options.ingestion;
  const cms = options.cms;
  return async (request, response) => {
    const requestId = request.headers?.['x-atlas-request-id'] || randomUUID();
    let headers = securityHeaders(requestId);
    try {
      headers = { ...headers, ...corsHeaders(request.headers?.origin, config) };
      if (request.method === 'OPTIONS') return send(response, 204, {}, headers);
      const url = new URL(request.url, 'http://atlas.local');
      const match = route(request.method, url.pathname);
      if (!match) throw new AtlasError('ROUTE_NOT_FOUND', 'Route not found', 404);
      const [workspaceId, objectId] = match.params;
      const publicRoute = ['frontendIndex', 'frontendApp', 'health', 'live', 'ready', 'register', 'login', 'refresh', 'logout', 'requestPasswordReset', 'resetPassword', 'cmsOAuthCallback'].includes(match.name);
      const user = identity && !publicRoute ? await identity.authenticate(request.headers?.authorization) : null;
      if (identity && workspaceId && url.pathname.startsWith('/v1/workspaces/')) {
        const permission = ['getWorkspace', 'listObjects', 'getObject', 'graph', 'listEvents', 'matterHealth', 'listMemberships', 'listAudits', 'assistantQuery', 'listAssistantRuns', 'listAssistantConversations', 'listAssistantMessages', 'listAssistantActions', 'intelligenceReviewInbox', 'searchTwin', 'listCmsConnections', 'whileYouWereGone', 'updateAwarenessStatus'].includes(match.name)
          ? 'workspace:read' : match.name === 'createMembership' ? 'members:admin' : 'workspace:write';
        await identity.authorize(workspaceId, user.id, permission);
      }
      let result;
      switch (match.name) {
        case 'frontendIndex': case 'frontendApp': return sendAsset(response,await phaseOneAsset(match.name),headers);
        case 'health': case 'live': result = { status: 'ok', version: '0.22.1' }; break;
        case 'ready': await ready(); result = { status: 'ready', version: '0.22.1' }; break;
        case 'register': result = await identity.register(await readJson(request, config.maxBodyBytes)); break;
        case 'login': result = await identity.login(await readJson(request, config.maxBodyBytes)); break;
        case 'refresh': result = await identity.refresh(await readJson(request, config.maxBodyBytes)); break;
        case 'logout': result = await identity.logout(await readJson(request, config.maxBodyBytes)); break;
        case 'requestPasswordReset': result = await identity.requestPasswordReset(await readJson(request, config.maxBodyBytes)); break;
        case 'resetPassword': result = await identity.resetPassword(await readJson(request, config.maxBodyBytes)); break;
        case 'cmsOAuthCallback': result = await cms.completeAuthorization({state:url.searchParams.get('state'),code:url.searchParams.get('code')}); break;
        case 'listSessions': result = await identity.listSessions(user.id, user.sessionId); break;
        case 'revokeSession': result = await identity.revokeSession(user.id, workspaceId); break;
        case 'revokeAllSessions': result = await identity.revokeAllSessions(user.id); break;
        case 'createWorkspace': result = await service.createWorkspace(await readJson(request, config.maxBodyBytes), user?.id); break;
        case 'getWorkspace': result = await service.getWorkspace(workspaceId); break;
        case 'createMembership': { const input = await readJson(request, config.maxBodyBytes); result = await identity.addMembership(workspaceId, input.userId, input.role); break; }
        case 'listMemberships': result = await identity.repository.listMemberships(workspaceId); break;
        case 'createObject': result = await service.createObject(workspaceId, await readJson(request, config.maxBodyBytes)); break;
        case 'listObjects': result = await service.listObjects(workspaceId, { type: url.searchParams.get('type'), dimension: url.searchParams.get('dimension') }); break;
        case 'getObject': result = await service.getObject(workspaceId, objectId); break;
        case 'updateObject': result = await service.updateObject(workspaceId, objectId, await readJson(request, config.maxBodyBytes), user?.id); break;
        case 'deleteObject': result = await service.deleteObject(workspaceId, objectId, await readJson(request, config.maxBodyBytes), user?.id); break;
        case 'restoreObject': result = await service.restoreObject(workspaceId, objectId, await readJson(request, config.maxBodyBytes), user?.id); break;
        case 'listAudits': result = await service.listAudits(workspaceId, url.searchParams.get('objectId')); break;
        case 'createRelationship': result = await service.createRelationship(workspaceId, await readJson(request, config.maxBodyBytes)); break;
        case 'graph': result = await service.expandGraph(workspaceId, objectId); break;
        case 'createEvent': result = await service.createEvent(workspaceId, await readJson(request, config.maxBodyBytes)); break;
        case 'listEvents': result = await service.listEvents(workspaceId, url.searchParams.get('parentObjectId')); break;
        case 'matterHealth': result = await service.matterHealth(workspaceId, objectId); break;
        case 'assistantQuery': { const input = await readJson(request, config.maxBodyBytes); result = await assistant.query({ workspaceId, userId: user.id, prompt: input.prompt, conversationId: input.conversationId }); break; }
        case 'listAssistantRuns': result = await assistant.listRuns(workspaceId, Number(url.searchParams.get('limit') ?? 50)); break;
        case 'listAssistantConversations': result = await assistant.listConversations(workspaceId,user.id); break;
        case 'listAssistantMessages': result = await assistant.listMessages(workspaceId,user.id,objectId); break;
        case 'listAssistantActions': result = await service.listAiActionProposals(workspaceId,url.searchParams.get('status')); break;
        case 'decideAssistantAction': result = await service.decideAiActionProposal(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'intelligenceReviewInbox': result = await service.intelligenceReviewInbox(workspaceId); break;
        case 'ingestEmail': result = await ingestion.ingestEmail(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'searchTwin': result = await service.searchTwin(workspaceId,url.searchParams.get('q')); break;
        case 'decideIntelligenceObservation': result = await service.decideIntelligenceObservation(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'beginCmsAuthorization': result = await cms.beginAuthorization(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'listCmsConnections': result = await cms.listConnections(workspaceId); break;
        case 'syncCmsConnection': result = await cms.sync(workspaceId,objectId); break;
        case 'disconnectCmsConnection': result = await cms.disconnect(workspaceId,objectId); break;
        case 'whileYouWereGone': result = await service.whileYouWereGone(workspaceId,user.id,url.searchParams.get('since')); break;
        case 'updateAwarenessStatus': {const input=await readJson(request,config.maxBodyBytes);result=await service.updateAwarenessStatus(workspaceId,objectId,user.id,input.status);break;}
      }
      send(response, match.name.startsWith('create') ? 201 : 200, { data: result }, headers);
    } catch (error) {
      const known = error instanceof AtlasError;
      const status = known ? error.status : (request.url === '/ready' ? 503 : 500);
      send(response, status, {
        error: { code: known ? error.code : (status === 503 ? 'NOT_READY' : 'INTERNAL_ERROR'), message: known ? error.message : (status === 503 ? 'Service is not ready' : 'Internal server error'), ...(known && error.details ? { details: error.details } : {}) }
      }, headers);
    }
  };
}

export function createAtlasServer(service, options) {
  return createServer(createAtlasHandler(service, options));
}
