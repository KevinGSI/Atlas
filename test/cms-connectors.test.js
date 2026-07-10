import test from 'node:test';
import assert from 'node:assert/strict';
import { CmsCoexistenceService, CmsConnectorRegistry, InMemoryCredentialVault, RepositoryCredentialVault, runCmsSyncScheduler } from '../src/cms-connectors.js';
import { ClioManageConnector, MyCaseOpenApiConnector } from '../src/cms-provider-adapters.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';
import { AesGcmContentCipher } from '../src/content-security.js';

async function fixture(){const repository=new InMemoryRepository();const workspace=await new AtlasService(repository).createWorkspace({name:'Transition Firm'});const vault=new InMemoryCredentialVault();let pull=0;const connector={capabilities(){return {oauth2:true,resources:['matter','contact','accounting']};},beginAuthorization({state,codeChallenge}){return `https://provider.example/authorize?state=${state}&challenge=${codeChallenge}`;},async exchangeCode({code}){assert.equal(code,'grant-code');return {access_token:'secret-token'};},async pull(){pull+=1;return {records:pull===1?[{type:'matter',id:'m1',updatedAt:'2026-07-01T00:00:00.000Z',data:{title:'Imported Matter',caseNumber:'CV-1'}},{type:'contact',id:'c1',data:{title:'Imported Client',email:'client@example.com'}},{type:'accounting',id:'a1',data:{title:'Invoice 1',amount:500}}]:[],nextCursor:{page:pull+1},hasMore:false};},async revoke(){}};const registry=new CmsConnectorRegistry().register('test-cms',connector);return {repository,workspace,vault,service:new CmsCoexistenceService(repository,registry,vault,()=> '2026-07-10T12:00:00.000Z')};}

test('CMS OAuth authorization stores PKCE and tokens only behind vault references',async()=>{const {repository,workspace,vault,service}=await fixture();const started=await service.beginAuthorization(workspace.id,'test-cms',{redirectUri:'https://atlas.example/callback'},'usr_1');assert.match(started.authorizationUrl,/provider\.example/);const connection=await service.completeAuthorization({state:started.state,code:'grant-code'});assert.equal(connection.status,'connected');assert.equal(connection.accessMode,'read_only');assert.equal('accessToken' in connection,false);assert.equal('credentialRef' in connection,false);const internal=await repository.getCmsConnection(workspace.id,connection.id);assert.deepEqual(await vault.get(internal.credentialRef),{access_token:'secret-token'});await assert.rejects(()=>service.completeAuthorization({state:started.state,code:'grant-code'}),(error)=>error.code==='CMS_AUTHORIZATION_INVALID');});

test('incremental coexistence sync populates matters contacts and accounting with provenance',async()=>{const {repository,workspace,service}=await fixture();const started=await service.beginAuthorization(workspace.id,'test-cms',{redirectUri:'https://atlas.example/callback'},'usr_1');const connection=await service.completeAuthorization({state:started.state,code:'grant-code'});const result=await service.sync(workspace.id,connection.id);assert.deepEqual({imported:result.imported,updated:result.updated,complete:result.complete},{imported:3,updated:0,complete:true});const objects=await repository.listObjects(workspace.id,{});assert.deepEqual(objects.map((item)=>item.dimension).sort(),['matter','operation','person']);assert.ok(objects.every((item)=>item.state.externalSource.provider==='test-cms'));assert.equal((await repository.listIntelligenceJobs(workspace.id)).filter((job)=>job.triggerType==='cms.record.synced').length,3);});

test('Clio adapter uses provider OAuth with PKCE and bearer API calls',async()=>{
  const calls=[];
  const transport=async(url,options)=>{
    calls.push({url:String(url),options});
    return {ok:true,async json(){return String(url).includes('/oauth/token')
      ? {access_token:'token'}
      : {data:[{id:1,name:'Matter'}],meta:{paging:{next:null}}};}};
  };
  const connector=new ClioManageConnector({clientId:'client',clientSecret:'secret',transport,resources:[{type:'matter',path:'/api/v4/matters'}]});
  const authorization=connector.beginAuthorization({state:'state',codeChallenge:'challenge',redirectUri:'https://atlas.example/callback'});
  assert.match(authorization,/app\.clio\.com\/oauth\/authorize/);assert.match(authorization,/code_challenge=challenge/);
  const credentials=await connector.exchangeCode({code:'code',codeVerifier:'verifier',redirectUri:'https://atlas.example/callback'});
  await connector.pull({credentials});assert.equal(calls[1].options.headers.authorization,'Bearer token');
});

test('MyCase connector requires provider-issued Open API configuration rather than passwords',()=>{assert.throws(()=>new MyCaseOpenApiConnector({}),(error)=>error.code==='CMS_CONNECTOR_CONFIGURATION_ERROR');const connector=new MyCaseOpenApiConnector({clientId:'id',authorizeEndpoint:'https://mycase.example/auth',tokenEndpoint:'https://mycase.example/token',apiBase:'https://mycase.example/api',resources:[]});assert.equal(connector.capabilities().oauth2,true);});

test('coexistence scheduler continuously syncs active connections and stops cleanly',async()=>{const controller=new AbortController();let cycles=0;const service={async syncAll(){cycles+=1;if(cycles===2)controller.abort();return [];}};await runCmsSyncScheduler(service,{signal:controller.signal,intervalMs:1});assert.equal(cycles,2);});

test('durable CMS vault stores only authenticated ciphertext in the repository',async()=>{const repository=new InMemoryRepository();const cipher=new AesGcmContentCipher({keys:{cms:Buffer.alloc(32,8).toString('base64')},activeKeyId:'cms'});const vault=new RepositoryCredentialVault(repository,cipher);const reference=await vault.put({access_token:'never-plaintext'});const stored=await repository.getEncryptedSecret(reference);assert.match(stored.ciphertext,/^atlas:v1:cms:/);assert.ok(!stored.ciphertext.includes('never-plaintext'));assert.deepEqual(await vault.get(reference),{access_token:'never-plaintext'});await vault.delete(reference);await assert.rejects(()=>vault.get(reference),(error)=>error.code==='CMS_CREDENTIAL_UNAVAILABLE');});
