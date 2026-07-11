import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler } from '../src/http.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { IdentityService, TokenService } from '../src/identity.js';
import { AtlasAssistant, AtlasToolRegistry } from '../src/assistant.js';
import { AtlasIngestionService } from '../src/ingestion.js';

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

async function raw(handler,url){const request=Readable.from([]);request.method='GET';request.url=url;request.headers={};return new Promise((resolve,reject)=>{const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body:Buffer.from(body).toString('utf8')});}};Promise.resolve(handler(request,response)).catch(reject);});}

test('serves the connected phase-one client from the application origin',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.equal(page.status,200);assert.match(page.headers['content-type'],/text\/html/);assert.match(page.body,/While You Were Gone/);assert.match(page.body,/continuously aware digital twin/);assert.match(page.body,/commandForm/);assert.match(page.body,/app-shell/);assert.match(page.body,/data-view="matters"/);assert.match(page.body,/data-view="communications"/);assert.doesNotMatch(page.body,/data-view="deadlines"/);assert.match(page.body,/data-matter-tab="deadlines"/);assert.match(page.body,/matterCount/);assert.match(page.body,/matterList/);assert.match(page.body,/onboardingForm/);assert.match(page.body,/matterForm/);assert.match(page.body,/collectionForm/);assert.match(page.body,/Canonical scope/);assert.match(page.body,/data-matter-tab="timeline"/);const script=await raw(handler,'/app.js');assert.match(script.headers['content-type'],/javascript/);assert.match(script.body,/authorization:`Bearer/);assert.match(script.body,/assistant\/query/);assert.match(script.body,/conversationId/);assert.match(script.body,/actionProposals/);assert.match(script.body,/assistant\/actions/);assert.match(script.body,/Approve draft/);assert.match(script.body,/intelligence\/observations/);assert.match(script.body,/Accept/);assert.match(script.body,/loadPilotData/);assert.match(script.body,/register-firm/);assert.match(script.body,/openMatter/);assert.match(script.body,/collectionConfigs/);assert.match(script.body,/Select the matter that owns this legal work/);assert.match(script.body,/matters\/\$\{encodeURIComponent\(matter\.id\)\}\/health/);assert.match(script.body,/events\?parentObjectId/);});

test('frontend uses a versioned deferred script that executes in the local pilot browser',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/<script defer src="\.\/app\.js\?v=0\.36\.0-6"><\/script>/);});

test('Settings is an accessible gear at the bottom of the sidebar rather than a menu item',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.doesNotMatch(page.body,/data-view="settings">Settings/);assert.match(page.body,/id="settingsButton"/);assert.match(page.body,/aria-label="Settings"/);assert.match(page.body,/>⚙<\/button><button id="signOut"/);const script=await raw(handler,'/app.js');assert.match(script.body,/settingsButton/);assert.match(script.body,/showView\('settings'\)/);});

test('Evidence is absent from the user-facing navigation and case workspace',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.doesNotMatch(page.body,/data-view="evidence"/);assert.doesNotMatch(page.body,/data-matter-tab="evidence"/);assert.doesNotMatch(page.body,/>Evidence<\/button>/);const script=await raw(handler,'/app.js');assert.doesNotMatch(script.body,/evidence:\{title:'Evidence'/);assert.match(script.body,/object\.dimension!==\'evidence\'/);});

test('every authenticated view carries the same persistent digital-twin command dock',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/id="twinDock"/);assert.match(page.body,/id="twinForm"/);assert.match(page.body,/Ask Atlas from anywhere/);assert.match(page.body,/aria-label="Atlas digital twin"/);const script=await raw(handler,'/app.js');assert.match(script.body,/submitTwinCommand/);assert.match(script.body,/conversationId/);assert.match(script.body,/assistant\/query/);assert.match(script.body,/actionProposals/);assert.match(script.body,/twinToggle/);});

test('homepage keeps a left sidebar and delegates historical activity questions to Atlas',async()=>{const page=await raw(fixture(),'/');assert.match(page.body,/@media\(max-width:800px\)\{\.app-shell\{grid-template-columns:190px/);assert.doesNotMatch(page.body,/Show activity since/);assert.doesNotMatch(page.body,/id="refresh"/);const script=await raw(fixture(),'/app.js');assert.doesNotMatch(script.body,/byId\('since'\)/);assert.doesNotMatch(script.body,/byId\('refresh'\)/);});

test('sidebar presents Cases then Email then Calendar and local connectors use only fictional OAuth-shaped data',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="matters">Cases<\/button><button data-view="email">Email<\/button><button data-view="calendar">Calendar/);assert.match(page.body,/Connect Google Workspace/);assert.match(page.body,/Connect Microsoft 365/);assert.match(page.body,/never asks for or stores the mailbox password/);const script=await raw(handler,'/app.js');assert.match(script.body,/connectDemoEmail/);assert.match(script.body,/`demo-\$\{provider\}`/);assert.match(script.body,/ingestions\/email/);assert.match(script.body,/The deployed OAuth connector must be configured/);});

test('Tasks follows Calendar and lists canonical tasks created within case workspaces',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/data-view="calendar">Calendar<\/button><button data-view="tasks">Tasks<\/button><button data-view="clients">Clients/);const script=await raw(handler,'/app.js');assert.match(script.body,/tasks:\{title:'Tasks'/);assert.match(script.body,/item\.type==='task'/);assert.match(script.body,/matterTitleFor\(item\)/);});

test('local preview offers a fictional one-click firm without requesting real information',async()=>{const handler=fixture();const page=await raw(handler,'/');assert.match(page.body,/Open fictional demo firm/);assert.match(page.body,/No real information is needed/);const script=await raw(handler,'/app.js');assert.match(script.body,/Atlas Demo Law/);assert.match(script.body,/Demo Attorney/);assert.match(script.body,/fictional-demo-password-only/);});

test('firm onboarding atomically creates the owner subscription and authenticated workspace',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});
  const created=await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'New Law Firm',name:'First Owner',email:'owner@newfirm.test',password:'correct horse battery staple'})});
  assert.equal(created.status,201);assert.equal(created.body.data.workspace.name,'New Law Firm');assert.equal(created.body.data.subscription.status,'trialing');assert.equal(created.body.data.subscription.seatLimit,10);
  const {workspace,accessToken}=created.body.data;const headers={authorization:`Bearer ${accessToken}`};
  const subscription=await json(handler,`/v1/workspaces/${workspace.id}/subscription`,{headers});
  assert.equal(subscription.status,200);assert.equal(subscription.body.data.workspaceId,workspace.id);
  const firms=await json(handler,'/v1/me/workspaces',{headers});assert.equal(firms.status,200);assert.deepEqual(firms.body.data.map(item=>item.workspace.id),[workspace.id]);assert.equal(firms.body.data[0].role,'owner');
  const members=await json(handler,`/v1/workspaces/${workspace.id}/memberships`,{headers});
  assert.equal(members.body.data.length,1);assert.equal(members.body.data[0].role,'owner');
});

test('launch pilot journey enters the firm and creates matter-scoped daily work',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('b'.repeat(32)));const handler=createAtlasHandler(service,{identity,config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true});
  const signup=(await json(handler,'/v1/auth/register-firm',{method:'POST',body:JSON.stringify({firmName:'Pilot Firm',name:'Pilot Owner',email:'pilot@firm.test',password:'correct horse battery staple'})})).body.data;const headers={authorization:`Bearer ${signup.accessToken}`};const workspaceId=signup.workspace.id;
  const matter=(await json(handler,`/v1/workspaces/${workspaceId}/objects`,{method:'POST',headers,body:JSON.stringify({dimension:'matter',type:'civil',title:'Reed v. Northline',state:{caseNumber:'2026-CV-104',status:'open'}})})).body.data;
  for(const input of [{dimension:'client',type:'client',title:'Jordan Reed'},{dimension:'document',type:'document',title:'Initial disclosures'},{dimension:'evidence',type:'evidence',title:'Body camera'},{dimension:'operation',type:'communication',title:'Client status call'},{dimension:'operation',type:'task',title:'Review production'},{dimension:'operation',type:'deadline',title:'Discovery due'}]){const response=await json(handler,`/v1/workspaces/${workspaceId}/objects`,{method:'POST',headers,body:JSON.stringify({...input,parentObjectId:matter.id,state:{scope:'matter',matterId:matter.id,status:'open'}})});assert.equal(response.status,201);assert.equal(response.body.data.parentObjectId,matter.id);}
  const objects=(await json(handler,`/v1/workspaces/${workspaceId}/objects`,{headers})).body.data;assert.equal(objects.length,7);assert.equal(objects.filter(item=>item.parentObjectId===matter.id).length,6);
  const health=await json(handler,`/v1/workspaces/${workspaceId}/matters/${matter.id}/health`,{headers});assert.equal(health.status,200);assert.equal(typeof health.body.data.score,'number');
});

test('health endpoint reports the running release', async () => {
  const response = await json(fixture(), '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { data: { status: 'ok', version: '0.36.0' } });
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
  const sameOrigin=await json(fixture(),'/health',{headers:{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}});
  assert.equal(sameOrigin.status,200);
  assert.equal(sameOrigin.headers['access-control-allow-origin'],'http://127.0.0.1:3000');
  const hostMismatch=await json(fixture(),'/health',{headers:{origin:'http://localhost:3000',host:'127.0.0.1:3000'}});assert.equal(hostMismatch.status,403);
  const schemeMismatch=await json(fixture(),'/health',{headers:{origin:'https://127.0.0.1:3000',host:'127.0.0.1:3000'}});assert.equal(schemeMismatch.status,403);
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

test('platform exposes the shared native intelligence review inbox',async()=>{
  const handler=fixture();const workspace=(await json(handler,'/v1/workspaces',{method:'POST',body:JSON.stringify({name:'Review Firm'})})).body.data;
  const response=await json(handler,`/v1/workspaces/${workspace.id}/intelligence/review-inbox`);
  assert.equal(response.status,200);assert.deepEqual(response.body.data.counts,{observations:0,actions:0,failures:0});
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

test('authenticated homepage loads and reviews attorney awareness through HTTP',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'awareness@example.com',name:'Awareness Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Aware Firm'})})).body.data;
  await repository.createAwarenessItem({id:'awi_http',workspaceId:workspace.id,targetUserId:registered.user.id,sourceJobId:'inj_http',sourceObjectId:null,category:'incoming_email',priority:'high',headline:'Response email prepared',summary:'An unsent response is ready for attorney review.',observationIds:[],actionProposalIds:[],createdAt:'2026-07-10T12:00:00.000Z'});
  const feed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(feed.status,200);assert.equal(feed.body.data[0].reviewStatus,'unseen');assert.equal(feed.body.data[0].headline,'Response email prepared');
  const reviewed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone/awi_http`,{method:'PATCH',headers,body:JSON.stringify({status:'reviewed'})});assert.equal(reviewed.status,200);assert.equal(reviewed.body.data.status,'reviewed');const refreshed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(refreshed.body.data[0].reviewStatus,'reviewed');
});

test('homepage review approves an AI legal draft but never files it',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'review@example.com',name:'Review Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Review Firm'})})).body.data;
  const proposal=await repository.createAiActionProposal({id:'aap_home_document',workspaceId:workspace.id,runId:null,intelligenceJobId:'inj_home',originType:'native_intelligence',proposedBy:'atlas',actionType:'create_document',input:{title:'Motion to Compel',documentType:'motion_to_compel',content:'DRAFT FOR ATTORNEY REVIEW'},status:'pending',version:1,decidedBy:null,resultObjectId:null,createdAt:'2026-07-10T12:00:00.000Z',decidedAt:null});await repository.createAwarenessItem({id:'awi_home_document',workspaceId:workspace.id,targetUserId:registered.user.id,sourceJobId:'inj_home',sourceObjectId:null,category:'missed_deadline',priority:'urgent',headline:'Motion requires review',summary:'An unfiled motion draft is ready.',observationIds:[],actionProposalIds:[proposal.id],createdAt:'2026-07-10T12:00:00.000Z'});
  const feed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(feed.body.data[0].actions[0].status,'pending');const approved=await json(handler,`/v1/workspaces/${workspace.id}/assistant/actions/${proposal.id}/decision`,{method:'POST',headers,body:JSON.stringify({version:1,decision:'approve'})});assert.equal(approved.body.data.proposal.status,'approved');assert.equal(approved.body.data.result.type,'motion_to_compel');assert.equal(approved.body.data.result.state.filed,false);assert.equal(approved.body.data.result.state.status,'draft');const refreshed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.equal(refreshed.body.data[0].actions[0].status,'approved');
});

test('homepage review accepts verified observations into firm knowledge and rejects others',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'knowledge@example.com',name:'Knowledge Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Knowledge Firm'})})).body.data;
  const candidate=(id,kind,data)=>repository.createIntelligenceObservation({id,workspaceId:workspace.id,jobId:'inj_knowledge',sourceObjectId:null,kind,data,confidence:.91,sourceLocation:{page:2},provider:'test-provider',status:'candidate',reviewedBy:null,reviewedAt:null,createdAt:'2026-07-10T12:00:00.000Z'});const risk=await candidate('ino_home_risk','risk',{title:'Discovery sanctions risk',description:'Response remains overdue.'});const fact=await candidate('ino_home_fact','fact',{title:'Unverified allegation',description:'Requires corroboration.'});await repository.createAwarenessItem({id:'awi_home_knowledge',workspaceId:workspace.id,targetUserId:registered.user.id,sourceJobId:'inj_knowledge',sourceObjectId:null,category:'document_upload',priority:'high',headline:'New findings require verification',summary:'Two candidate findings are ready.',observationIds:[risk.id,fact.id],actionProposalIds:[],createdAt:'2026-07-10T12:00:00.000Z'});
  const feed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.deepEqual(feed.body.data[0].observations.map((item)=>item.status),['candidate','candidate']);const accepted=await json(handler,`/v1/workspaces/${workspace.id}/intelligence/observations/${risk.id}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'accept'})});assert.equal(accepted.body.data.observation.status,'accepted');assert.equal(accepted.body.data.result.type,'risk');const rejected=await json(handler,`/v1/workspaces/${workspace.id}/intelligence/observations/${fact.id}/decision`,{method:'POST',headers,body:JSON.stringify({decision:'reject'})});assert.equal(rejected.body.data.observation.status,'rejected');assert.equal(rejected.body.data.result,null);const refreshed=await json(handler,`/v1/workspaces/${workspace.id}/home/while-you-were-gone`,{headers});assert.deepEqual(refreshed.body.data[0].observations.map((item)=>item.status),['accepted','rejected']);
});

test('authenticated ingestion routes accept phone calls and standalone documents idempotently',async()=>{
  const repository=new InMemoryRepository();const service=new AtlasService(repository);const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const ingestion=new AtlasIngestionService(repository,()=> '2026-07-10T12:00:00.000Z');const handler=createAtlasHandler(service,{config:{maxBodyBytes:1_048_576,corsOrigins:[]},ready:async()=>true,identity,ingestion});
  const registered=(await json(handler,'/v1/auth/register',{method:'POST',body:JSON.stringify({email:'events@example.com',name:'Event Attorney',password:'correct password long enough'})})).body.data;const headers={authorization:`Bearer ${registered.accessToken}`};const workspace=(await json(handler,'/v1/workspaces',{method:'POST',headers,body:JSON.stringify({name:'Event Firm'})})).body.data;
  const callBody={connector:'test-phone',externalId:'call-http-1',direction:'incoming',from:'+15551230000',to:'+15559870000',transcript:'Please call me about discovery.',durationSeconds:45};const call=await json(handler,`/v1/workspaces/${workspace.id}/ingestions/phone-calls`,{method:'POST',headers,body:JSON.stringify(callBody)});assert.equal(call.status,200);assert.equal(call.body.data.root.type,'phone_call');const duplicate=await json(handler,`/v1/workspaces/${workspace.id}/ingestions/phone-calls`,{method:'POST',headers,body:JSON.stringify(callBody)});assert.equal(duplicate.body.data.duplicate,true);
  const document=await json(handler,`/v1/workspaces/${workspace.id}/ingestions/documents`,{method:'POST',headers,body:JSON.stringify({connector:'test-portal',externalId:'doc-http-1',filename:'notice.pdf',storageRef:'blob://notice',sha256:'abc123',mediaType:'application/pdf',size:512})});assert.equal(document.status,200);assert.equal(document.body.data.root.type,'uploaded_document');assert.equal((await repository.listIntelligenceJobs(workspace.id)).filter((job)=>['phone_call.received','attachment.received'].includes(job.triggerType)).length,2);
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
  let turn = 0;
  const model = { async complete(input) {
    assert.equal(input.context.userId.startsWith('usr_'), true);
    turn += 1;
    return turn === 1 ? { toolCalls: [{ id: 'task_1', name: 'propose_create_task', arguments: { title: 'Review priority matter' } }] }
      : { text: 'Your highest-priority matter is ready for review.' };
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
  assert.match(response.body.data.conversationId, /^aic_/);
  assert.equal(response.body.data.actionProposals[0].status, 'pending');
  const actions = await json(handler, `/v1/workspaces/${workspace.id}/assistant/actions?status=pending`, { headers });
  assert.equal(actions.body.data.length, 1);
  const approved = await json(handler, `/v1/workspaces/${workspace.id}/assistant/actions/${actions.body.data[0].id}/decision`, { method: 'POST', headers, body: JSON.stringify({ version: 1, decision: 'approve' }) });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.proposal.status, 'approved');
  assert.equal(approved.body.data.result.type, 'task');
  const history = await json(handler, `/v1/workspaces/${workspace.id}/assistant/runs`, { headers });
  assert.equal(history.status, 200);
  assert.equal(history.body.data.length, 1);
  assert.equal(history.body.data[0].status, 'completed');
  assert.equal(history.body.data[0].prompt, 'What matters today?');
  const conversations = await json(handler, `/v1/workspaces/${workspace.id}/assistant/conversations`, { headers });
  assert.equal(conversations.body.data.length, 1);
  const messages = await json(handler, `/v1/workspaces/${workspace.id}/assistant/conversations/${response.body.data.conversationId}/messages`, { headers });
  assert.deepEqual(messages.body.data.map((message) => message.role), ['user', 'assistant']);
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
