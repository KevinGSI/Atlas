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

async function readForm(request,maxBodyBytes){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>maxBodyBytes)throw new AtlasError('PAYLOAD_TOO_LARGE','Request body is too large',413);chunks.push(chunk);}const params=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));return Object.fromEntries(params.entries());}
async function readRawBody(request,maxBodyBytes){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>maxBodyBytes)throw new AtlasError('PAYLOAD_TOO_LARGE','Request body is too large',413);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}

function securityHeaders(requestId) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-atlas-request-id': requestId
  };
}

function requestContext(request){return {ipAddress:request.socket?.remoteAddress??null,userAgent:request.headers?.['user-agent']??null};}

function corsHeaders(request, config) {
  const origin=request.headers?.origin;
  if (!origin) return {};
  let sameOrigin=false;
  try{const protocol=request.socket?.encrypted?'https:':'http:';sameOrigin=Boolean(request.headers?.host)&&new URL(origin).origin===new URL(`${protocol}//${request.headers.host}`).origin;}catch{}
  if (!sameOrigin&&!config.corsOrigins.includes(origin) && !config.corsOrigins.includes('*')) {
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

function sendXml(response,status,content,headers={}){response.writeHead(status,{...headers,'content-type':'application/xml; charset=utf-8','content-length':Buffer.byteLength(content),'content-security-policy':"default-src 'none'; frame-ancestors 'none'"});response.end(content);}

function sendAsset(response,asset,headers={}){response.writeHead(200,{...headers,'content-type':asset.contentType,'content-length':asset.content.length,'content-security-policy':"default-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'"});response.end(asset.content);}
function sendPaymentAsset(response,asset,headers={}){response.writeHead(200,{...headers,'content-type':asset.contentType,'content-length':asset.content.length,'cross-origin-opener-policy':'same-origin-allow-popups','content-security-policy':"default-src 'self'; script-src 'self' https://js.stripe.com; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://hooks.stripe.com"});response.end(asset.content);}
function sendFile(response,file,headers={}){const safe=String(file.document.title).replace(/["\\\r\n]/g,'_');response.writeHead(200,{...headers,'content-type':file.document.state.mediaType,'content-length':file.content.length,'content-disposition':`attachment; filename="${safe}"`,'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});response.end(file.content);}

function sendOAuthCompletion(response,connection,headers={}){const provider=String(connection.provider??'External provider').replace(/[<>&"']/g,'');const content=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas connection complete</title><style>body{font:16px system-ui;background:#f5f7fb;color:#10233f;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;border:1px solid #dbe3ee;border-radius:18px;padding:32px;max-width:520px;box-shadow:0 16px 48px #10233f18}h1{margin-top:0}</style></head><body><main class="card"><h1>Connection complete</h1><p>${provider} is securely connected to Atlas with read-only access.</p><p>You may close this window and return to Atlas. The Email and Calendar pages will detect the connection and begin synchronization.</p></main></body></html>`;response.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8','content-length':Buffer.byteLength(content),'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});response.end(content);}

function route(method, pathname) {
  const patterns = [
    ['GET', /^\/$/, 'frontendIndex'],
    ['GET', /^\/app\.js$/, 'frontendApp'],
    ['GET', /^\/pay\/?$/, 'paymentPage'],
    ['GET', /^\/payment\.js$/, 'paymentApp'],
    ['POST', /^\/v1\/payments\/stripe\/webhook$/, 'stripePaymentWebhook'],
    ['GET', /^\/v1\/payments\/stripe\/checkout\/([^/]+)$/, 'stripePaymentCheckout'],
    ['GET', /^\/template-editor\/?$/, 'templateEditor'],
    ['GET', /^\/template-editor\.js$/, 'templateEditorApp'],
    ['GET', /^\/health$/, 'health'],
    ['GET', /^\/live$/, 'live'],
    ['GET', /^\/ready$/, 'ready'],
    ['POST', /^\/v1\/auth\/register$/, 'register'],
    ['POST', /^\/v1\/auth\/register-firm$/, 'registerFirm'],
    ['POST', /^\/v1\/auth\/login$/, 'login'],
    ['POST', /^\/v1\/auth\/refresh$/, 'refresh'],
    ['POST', /^\/v1\/auth\/logout$/, 'logout'],
    ['POST', /^\/v1\/auth\/password-reset\/request$/, 'requestPasswordReset'],
    ['POST', /^\/v1\/auth\/password-reset\/complete$/, 'resetPassword'],
    ['POST', /^\/v1\/auth\/invitations\/accept$/, 'acceptInvitation'],
    ['GET', /^\/v1\/me\/workspaces$/, 'listUserWorkspaces'],
    ['GET', /^\/v1\/cms\/oauth\/callback$/, 'cmsOAuthCallback'],
    ['GET', /^\/v1\/auth\/sessions$/, 'listSessions'],
    ['DELETE', /^\/v1\/auth\/sessions$/, 'revokeAllSessions'],
    ['DELETE', /^\/v1\/auth\/sessions\/([^/]+)$/, 'revokeSession'],
    ['GET', /^\/v1\/auth\/mfa$/, 'mfaStatus'],
    ['POST', /^\/v1\/auth\/mfa\/enroll$/, 'beginMfa'],
    ['POST', /^\/v1\/auth\/mfa\/confirm$/, 'confirmMfa'],
    ['DELETE', /^\/v1\/auth\/mfa$/, 'disableMfa'],
    ['POST', /^\/v1\/workspaces$/, 'createWorkspace'],
    ['GET', /^\/v1\/workspaces\/([^/]+)$/, 'getWorkspace'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/subscription$/, 'getSubscription'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/memberships$/, 'createMembership'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/memberships$/, 'listMemberships'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/memberships\/([^/]+)\/deactivate$/, 'deactivateMembership'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/memberships\/([^/]+)\/reactivate$/, 'reactivateMembership'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/security\/policy$/, 'getWorkspaceSecurityPolicy'],
    ['PATCH', /^\/v1\/workspaces\/([^/]+)\/security\/policy$/, 'updateWorkspaceSecurityPolicy'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/security\/events$/, 'listWorkspaceSecurityEvents'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/security\/sessions$/, 'listWorkspaceSessions'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/security\/sign-out-all$/, 'revokeWorkspaceSessions'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/invitations$/, 'inviteMember'],
    ['GET', /^\/v1\/workspaces\/([^/]+)\/invitations$/, 'listWorkspaceInvitations'],
    ['POST', /^\/v1\/workspaces\/([^/]+)\/exports$/, 'createFirmExport'],
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
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/ingestions\/phone-calls$/, 'ingestPhoneCall']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/ingestions\/documents$/, 'ingestDocument']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/files$/, 'uploadFile']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/objects\/([^/]+)\/content$/, 'downloadFile']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/webhooks\/([^/]+)\/(email|phone-calls|documents)$/, 'ingestWebhook']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/intelligence\/search$/, 'searchTwin']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/intelligence\/observations\/([^/]+)\/decision$/, 'decideIntelligenceObservation']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/cms\/([^/]+)\/authorize$/, 'beginCmsAuthorization']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/cms\/providers$/, 'listCmsProviders']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/cms\/connections$/, 'listCmsConnections']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/cms\/connections\/([^/]+)\/sync$/, 'syncCmsConnection']
    ,['DELETE', /^\/v1\/workspaces\/([^/]+)\/cms\/connections\/([^/]+)$/, 'disconnectCmsConnection']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/migration\/preview$/, 'previewMigration']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/migration\/imports$/, 'importMigration']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/migration\/imports$/, 'listMigrations']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/home\/while-you-were-gone$/, 'whileYouWereGone']
    ,['PATCH', /^\/v1\/workspaces\/([^/]+)\/home\/while-you-were-gone\/([^/]+)$/, 'updateAwarenessStatus']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/accounting\/summary$/, 'accountingSummary']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/accounting\/providers$/, 'accountingProviders']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/invoices$/, 'createInvoice']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/payment-requests$/, 'createPaymentRequest']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/payments\/external$/, 'recordExternalPayment']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/refunds$/, 'recordRefund']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/time-entries$/, 'createTimeEntry']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/expenses$/, 'createExpense']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/trust-transactions$/, 'createTrustTransaction']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/journal-entries$/, 'createJournalEntry']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/banks\/([^/]+)\/authorize$/, 'beginBankAuthorization']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/financing\/([^/]+)\/applications$/, 'beginFinancingApplication']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/crypto\/accounts$/, 'createCryptoReceivingAccount']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/crypto\/invoice-requests$/, 'createInvoiceCryptoRequest']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/crypto\/subscription-requests$/, 'createSubscriptionCryptoRequest']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/accounting\/crypto\/confirmations$/, 'confirmCryptoPayment']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/voice-assistant$/, 'voiceStatus']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/voice-assistant\/configuration$/, 'configureVoice']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/voice-assistant\/simulate\/start$/, 'simulateVoiceStart']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/voice-assistant\/simulate\/turn$/, 'simulateVoiceTurn']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/voice-assistant\/simulate\/complete$/, 'simulateVoiceComplete']
    ,['POST', /^\/v1\/voice\/twilio\/([^/]+)\/incoming$/, 'twilioVoiceIncoming']
    ,['POST', /^\/v1\/voice\/twilio\/([^/]+)\/turn$/, 'twilioVoiceTurn']
    ,['POST', /^\/v1\/voice\/twilio\/([^/]+)\/status$/, 'twilioVoiceStatus']
    ,['GET', /^\/v1\/workspaces\/([^/]+)\/communications\/sms$/, 'smsStatus']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/communications\/sms\/configuration$/, 'configureSms']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/communications\/sms\/drafts$/, 'createSmsDraft']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/communications\/sms\/drafts\/([^/]+)\/send$/, 'sendSmsDraft']
    ,['POST', /^\/v1\/workspaces\/([^/]+)\/communications\/sms\/simulate$/, 'simulateSms']
    ,['POST', /^\/v1\/messaging\/twilio\/([^/]+)\/incoming$/, 'twilioSmsIncoming']
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
  const files = options.files;
  const webhooks = options.webhooks;
  const cms = options.cms;
  const migration=options.migration;
  const accounting = options.accounting;
  const voice=options.voice;
  const sms=options.sms;
  const telephony=options.telephony;
  const firmExport=options.firmExport;
  return async (request, response) => {
    const requestId = request.headers?.['x-atlas-request-id'] || randomUUID();
    let headers = securityHeaders(requestId);
    try {
      headers = { ...headers, ...corsHeaders(request, config) };
      if (request.method === 'OPTIONS') return send(response, 204, {}, headers);
      const url = new URL(request.url, 'http://atlas.local');
      const match = route(request.method, url.pathname);
      if (!match) throw new AtlasError('ROUTE_NOT_FOUND', 'Route not found', 404);
      const [workspaceId, objectId] = match.params;
      const publicRoute = ['frontendIndex', 'frontendApp', 'templateEditor', 'templateEditorApp','paymentPage','paymentApp', 'health', 'live', 'ready', 'register', 'registerFirm', 'login', 'refresh', 'logout', 'requestPasswordReset', 'resetPassword', 'acceptInvitation', 'cmsOAuthCallback', 'ingestWebhook','twilioVoiceIncoming','twilioVoiceTurn','twilioVoiceStatus','twilioSmsIncoming','stripePaymentWebhook','stripePaymentCheckout'].includes(match.name);
      const user = identity && !publicRoute ? await identity.authenticate(request.headers?.authorization) : null;
      if (identity && workspaceId && url.pathname.startsWith('/v1/workspaces/') && match.name!=='ingestWebhook') {
        const permission = ['getWorkspace', 'getSubscription', 'listObjects', 'getObject', 'downloadFile', 'graph', 'listEvents', 'matterHealth', 'listMemberships', 'listAudits', 'assistantQuery', 'listAssistantRuns', 'listAssistantConversations', 'listAssistantMessages', 'listAssistantActions', 'intelligenceReviewInbox', 'searchTwin', 'listCmsProviders', 'listCmsConnections','listMigrations', 'whileYouWereGone', 'updateAwarenessStatus', 'accountingSummary', 'accountingProviders','voiceStatus','smsStatus'].includes(match.name)
          ? 'workspace:read' : ['createMembership','inviteMember','listWorkspaceInvitations','listWorkspaceSecurityEvents','listWorkspaceSessions','revokeWorkspaceSessions','deactivateMembership','reactivateMembership','getWorkspaceSecurityPolicy','updateWorkspaceSecurityPolicy','createFirmExport'].includes(match.name) ? 'members:admin' : 'workspace:write';
        await identity.authorize(workspaceId, user.id, permission);
      }
      let result;
      switch (match.name) {
        case 'frontendIndex': case 'frontendApp': case 'templateEditor': case 'templateEditorApp': return sendAsset(response,await phaseOneAsset(match.name),headers);
        case 'paymentPage': case 'paymentApp': return sendPaymentAsset(response,await phaseOneAsset(match.name),headers);
        case 'stripePaymentWebhook': {if(!accounting)throw new AtlasError('PAYMENT_PROVIDER_NOT_CONFIGURED','Payment processing is not configured',503);result=await accounting.processPaymentWebhook('stripe',await readRawBody(request,config.maxBodyBytes),request.headers?.['stripe-signature']);break;}
        case 'stripePaymentCheckout': {if(!accounting)throw new AtlasError('PAYMENT_PROVIDER_NOT_CONFIGURED','Payment processing is not configured',503);result=await accounting.paymentCheckoutConfiguration('stripe',workspaceId);break;}
        case 'health': case 'live': result = { status: 'ok', version: '0.46.0' }; break;
        case 'ready': await ready(); result = { status: 'ready', version: '0.46.0' }; break;
        case 'register': result = await identity.register(await readJson(request, config.maxBodyBytes)); break;
        case 'registerFirm': result = await identity.registerFirm(await readJson(request,config.maxBodyBytes)); break;
        case 'login': result = await identity.login(await readJson(request, config.maxBodyBytes),requestContext(request)); break;
        case 'refresh': result = await identity.refresh(await readJson(request, config.maxBodyBytes)); break;
        case 'logout': result = await identity.logout(await readJson(request, config.maxBodyBytes)); break;
        case 'requestPasswordReset': result = await identity.requestPasswordReset(await readJson(request, config.maxBodyBytes)); break;
        case 'resetPassword': result = await identity.resetPassword(await readJson(request, config.maxBodyBytes)); break;
        case 'acceptInvitation': result = await identity.acceptInvitation(await readJson(request,config.maxBodyBytes)); break;
        case 'listUserWorkspaces': result = await identity.listUserWorkspaces(user.id); break;
        case 'cmsOAuthCallback': result = await cms.completeAuthorization({state:url.searchParams.get('state'),code:url.searchParams.get('code')}); return sendOAuthCompletion(response,result,headers);
        case 'listSessions': result = await identity.listSessions(user.id, user.sessionId); break;
        case 'revokeSession': result = await identity.revokeSession(user.id, workspaceId); break;
        case 'revokeAllSessions': result = await identity.revokeAllSessions(user.id); break;
        case 'mfaStatus': result=await identity.mfaStatus(user.id); break;
        case 'beginMfa': result=await identity.beginMfa(user.id,await readJson(request,config.maxBodyBytes)); break;
        case 'confirmMfa': result=await identity.confirmMfa(user.id,await readJson(request,config.maxBodyBytes)); break;
        case 'disableMfa': result=await identity.disableMfa(user.id,await readJson(request,config.maxBodyBytes)); break;
        case 'createWorkspace': result = await service.createWorkspace(await readJson(request, config.maxBodyBytes), user?.id); break;
        case 'getWorkspace': result = await service.getWorkspace(workspaceId); break;
        case 'getSubscription': result = await identity.repository.getSubscription(workspaceId); break;
        case 'createMembership': { const input = await readJson(request, config.maxBodyBytes); result = await identity.addMembership(workspaceId, input.userId, input.role); break; }
        case 'listMemberships': result = await identity.listWorkspaceMembers(workspaceId); break;
        case 'deactivateMembership': result=await identity.deactivateMembership(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'reactivateMembership': result=await identity.reactivateMembership(workspaceId,objectId,user.id); break;
        case 'getWorkspaceSecurityPolicy': result=await identity.getWorkspaceSecurityPolicy(workspaceId); break;
        case 'updateWorkspaceSecurityPolicy': result=await identity.updateWorkspaceSecurityPolicy(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'listWorkspaceSecurityEvents': result=await identity.listWorkspaceSecurityEvents(workspaceId,url.searchParams.get('limit')); break;
        case 'listWorkspaceSessions': result=await identity.listWorkspaceSessions(workspaceId,user.sessionId); break;
        case 'revokeWorkspaceSessions': result=await identity.revokeWorkspaceSessions(workspaceId,user.id); break;
        case 'inviteMember': result = await identity.inviteMember(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'listWorkspaceInvitations': result = await identity.listWorkspaceInvitations(workspaceId); break;
        case 'createFirmExport': {if(!firmExport)throw new AtlasError('FIRM_EXPORT_NOT_CONFIGURED','Firm export is unavailable',503);result=await firmExport.create(workspaceId,await readJson(request,config.maxBodyBytes));await identity.recordSecurityEvent({userId:user.id,workspaceId,type:'firm.export_created',outcome:'success',context:requestContext(request),details:{digest:result.manifest.digest,counts:result.manifest.counts}});break;}
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
        case 'ingestPhoneCall': result = await ingestion.ingestPhoneCall(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'ingestDocument': result = await ingestion.ingestDocument(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'uploadFile': {if(!files)throw new AtlasError('FILE_STORAGE_NOT_CONFIGURED','File storage is unavailable',503);result=await files.upload(workspaceId,await readJson(request,Math.ceil(config.documentMaxBytes*1.4)+100_000),user.id);break;}
        case 'downloadFile': {if(!files)throw new AtlasError('FILE_STORAGE_NOT_CONFIGURED','File storage is unavailable',503);return sendFile(response,await files.download(workspaceId,objectId),headers);}
        case 'ingestWebhook': {const connector=objectId;const kind=match.params[2];const input=await webhooks.verifyAndParse(request,workspaceId,connector,config.maxBodyBytes);const secured={...input,connector};result=kind==='email'?await ingestion.ingestEmail(workspaceId,secured,`connector:${connector}`):kind==='phone-calls'?await ingestion.ingestPhoneCall(workspaceId,secured,`connector:${connector}`):await ingestion.ingestDocument(workspaceId,secured,`connector:${connector}`);break;}
        case 'searchTwin': result = await service.searchTwin(workspaceId,url.searchParams.get('q')); break;
        case 'decideIntelligenceObservation': result = await service.decideIntelligenceObservation(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'beginCmsAuthorization': result = await cms.beginAuthorization(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'listCmsProviders': result = cms.listProviders(); break;
        case 'listCmsConnections': result = await cms.listConnections(workspaceId); break;
        case 'syncCmsConnection': result = await cms.sync(workspaceId,objectId); break;
        case 'disconnectCmsConnection': result = await cms.disconnect(workspaceId,objectId); break;
        case 'previewMigration': result=migration.preview(await readJson(request,config.migrationMaxBodyBytes??config.maxBodyBytes)); break;
        case 'importMigration': result=await migration.import(workspaceId,await readJson(request,config.migrationMaxBodyBytes??config.maxBodyBytes),user?.id??'system'); break;
        case 'listMigrations': result=await migration.list(workspaceId); break;
        case 'whileYouWereGone': result = await service.whileYouWereGone(workspaceId,user.id,url.searchParams.get('since')); break;
        case 'updateAwarenessStatus': {const input=await readJson(request,config.maxBodyBytes);result=await service.updateAwarenessStatus(workspaceId,objectId,user.id,input.status);break;}
        case 'accountingSummary': result=await accounting.summary(workspaceId); break;
        case 'accountingProviders': result=accounting.listProviders(); break;
        case 'createInvoice': result=await accounting.createInvoice(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createPaymentRequest': result=await accounting.createPaymentRequest(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'recordExternalPayment': result=await accounting.recordExternalPayment(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'recordRefund': result=await accounting.recordRefund(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createTimeEntry': result=await accounting.createTimeEntry(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createExpense': result=await accounting.createExpense(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createTrustTransaction': result=await accounting.createTrustTransaction(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createJournalEntry': result=await accounting.createJournalEntry(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'beginBankAuthorization': result=await accounting.beginBankAuthorization(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'beginFinancingApplication': result=await accounting.beginFinancingApplication(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createCryptoReceivingAccount': result=await accounting.createCryptoReceivingAccount(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createInvoiceCryptoRequest': result=await accounting.createInvoiceCryptoRequest(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'createSubscriptionCryptoRequest': result=await accounting.createSubscriptionCryptoRequest(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'confirmCryptoPayment': result=await accounting.confirmCryptoPayment(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'voiceStatus': result=await voice.status(workspaceId); break;
        case 'configureVoice': result=await voice.configure(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'simulateVoiceStart': result=await voice.startCall(workspaceId,{...(await readJson(request,config.maxBodyBytes)),provider:'atlas-simulator'},user.id); break;
        case 'simulateVoiceTurn': result=await voice.handleTurn(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'simulateVoiceComplete': result=await voice.completeCall(workspaceId,await readJson(request,config.maxBodyBytes),user.id); break;
        case 'twilioVoiceIncoming': {if(!telephony)throw new AtlasError('TELEPHONY_NOT_CONFIGURED','Live telephony is not configured',503);const input=await readForm(request,config.maxBodyBytes);telephony.verify(url.pathname,input,request.headers?.['x-twilio-signature']);const answer=await voice.startCall(workspaceId,telephony.incoming(input));return sendXml(response,200,telephony.render(answer,{turnPath:`/v1/voice/twilio/${workspaceId}/turn`,statusPath:`/v1/voice/twilio/${workspaceId}/status`}),headers);}
        case 'twilioVoiceTurn': {if(!telephony)throw new AtlasError('TELEPHONY_NOT_CONFIGURED','Live telephony is not configured',503);const input=await readForm(request,config.maxBodyBytes);telephony.verify(url.pathname,input,request.headers?.['x-twilio-signature']);const answer=await voice.handleTurn(workspaceId,telephony.turn(input));return sendXml(response,200,telephony.render(answer,{turnPath:`/v1/voice/twilio/${workspaceId}/turn`,statusPath:`/v1/voice/twilio/${workspaceId}/status`}),headers);}
        case 'twilioVoiceStatus': {if(!telephony)throw new AtlasError('TELEPHONY_NOT_CONFIGURED','Live telephony is not configured',503);const input=await readForm(request,config.maxBodyBytes);telephony.verify(url.pathname,input,request.headers?.['x-twilio-signature']);await voice.completeCall(workspaceId,telephony.status(input));return sendXml(response,200,'<?xml version="1.0" encoding="UTF-8"?><Response/>',headers);}
        case 'smsStatus': result=await sms.status(workspaceId); break;
        case 'configureSms': result=await sms.configure(workspaceId,await readJson(request,config.maxBodyBytes),user?.id??'system'); break;
        case 'createSmsDraft': result=await sms.createDraft(workspaceId,await readJson(request,config.maxBodyBytes),user?.id??'system'); break;
        case 'sendSmsDraft': result=await sms.sendDraft(workspaceId,objectId,await readJson(request,config.maxBodyBytes),user?.id??'system'); break;
        case 'simulateSms': {const input=await readJson(request,config.maxBodyBytes);result=await sms.receive(workspaceId,{externalMessageId:input.externalMessageId??`demo-sms-${Date.now()}`,from:input.from??'+15550102026',to:input.to??'+15550109999',body:input.body,provider:'atlas-simulator'},user?.id??'system');break;}
        case 'twilioSmsIncoming': {if(!telephony||!sms)throw new AtlasError('SMS_PROVIDER_NOT_CONFIGURED','Live text messaging is not configured',503);const input=await readForm(request,config.maxBodyBytes);telephony.verify(url.pathname,input,request.headers?.['x-twilio-signature']);const received=await sms.receive(workspaceId,telephony.incomingMessage(input));return sendXml(response,200,telephony.renderMessageResponse(received.reply),headers);}
      }
      send(response, match.name.startsWith('create')||['registerFirm','inviteMember','importMigration'].includes(match.name) ? 201 : 200, { data: result }, headers);
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
