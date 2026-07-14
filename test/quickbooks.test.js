import test from 'node:test';
import assert from 'node:assert/strict';
import { QuickBooksOnlineConnector } from '../src/cms-provider-adapters.js';
import { AtlasService } from '../src/service.js';
import { InMemoryRepository } from '../src/repository.js';
import { CmsCoexistenceService, CmsConnectorRegistry, InMemoryCredentialVault } from '../src/cms-connectors.js';

const jsonResponse=(body,status=200)=>({ok:status>=200&&status<300,status,async json(){return body;}});

test('QuickBooks authorization uses Intuit accounting consent and preserves the company realm',async()=>{
  const requests=[];const connector=new QuickBooksOnlineConnector({clientId:'client-id',clientSecret:'client-secret',transport:async(url,options)=>{requests.push({url:String(url),options});return jsonResponse({access_token:'access',refresh_token:'refresh',expires_in:3600,x_refresh_token_expires_in:7200});}});
  const authorization=new URL(connector.beginAuthorization({state:'opaque-state',redirectUri:'https://atlas.example/v1/cms/oauth/callback'}));
  assert.equal(authorization.origin,'https://appcenter.intuit.com');
  assert.equal(authorization.searchParams.get('scope'),'com.intuit.quickbooks.accounting');
  assert.equal(authorization.searchParams.get('state'),'opaque-state');
  const credentials=await connector.exchangeCode({code:'grant',realmId:'company-123',redirectUri:'https://atlas.example/v1/cms/oauth/callback'});
  assert.equal(credentials.realmId,'company-123');
  assert.equal(requests[0].options.headers.authorization,`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
  assert.equal(requests[0].options.body.get('grant_type'),'authorization_code');
  await assert.rejects(()=>connector.exchangeCode({code:'grant',redirectUri:'https://atlas.example/v1/cms/oauth/callback'}),(error)=>error.code==='CMS_AUTHORIZATION_FAILED');
});

test('QuickBooks performs paged full import then advances to incremental change capture',async()=>{
  const urls=[];let queryCalls=0;const connector=new QuickBooksOnlineConnector({clientId:'id',clientSecret:'secret',entities:['Invoice'],pageSize:2,clock:()=> '2026-07-14T12:00:00.000Z',transport:async(url)=>{urls.push(String(url));if(String(url).includes('/query?')){queryCalls+=1;return jsonResponse({QueryResponse:{Invoice:queryCalls===1?[{Id:'1',SyncToken:'0',DocNumber:'1001',TotalAmt:125,Balance:75,TxnDate:'2026-07-13',MetaData:{LastUpdatedTime:'2026-07-13T10:00:00Z'}},{Id:'2',SyncToken:'1',DocNumber:'1002',TotalAmt:50,Balance:0,MetaData:{LastUpdatedTime:'2026-07-13T11:00:00Z'}}]:[]}});}return jsonResponse({CDCResponse:[{QueryResponse:[{Invoice:[{Id:'2',SyncToken:'2',DocNumber:'1002',TotalAmt:55,Balance:5,MetaData:{LastUpdatedTime:'2026-07-14T11:00:00Z'}}]}]}],time:'2026-07-14T12:01:00.000Z'});}});
  const credentials={access_token:'access',refresh_token:'refresh',realmId:'realm/one',expires_at:'2999-01-01T00:00:00.000Z'};
  const first=await connector.pull({credentials,cursor:null});assert.equal(first.records.length,2);assert.equal(first.records[0].type,'accounting');assert.equal(first.records[0].id,'Invoice:1');assert.equal(first.records[0].data.amountMinor,12500);assert.equal(first.records[0].data.balanceMinor,7500);assert.equal(first.hasMore,true);
  const second=await connector.pull({credentials,cursor:first.nextCursor});assert.equal(second.records.length,0);assert.equal(second.hasMore,false);assert.equal(second.nextCursor.mode,'cdc');
  const changed=await connector.pull({credentials,cursor:second.nextCursor});assert.equal(changed.records[0].data.balanceMinor,500);assert.equal(changed.nextCursor.changedSince,'2026-07-14T12:01:00.000Z');assert.ok(urls.some(url=>url.includes('/v3/company/realm%2Fone/query?')));assert.ok(urls.some(url=>url.includes('/cdc?')));
});

test('QuickBooks token refresh rotates the encrypted credential value returned to coexistence',async()=>{
  let tokenCalls=0;const connector=new QuickBooksOnlineConnector({clientId:'id',clientSecret:'secret',entities:['Account'],transport:async(url,options)=>{if(String(url).includes('/tokens/bearer')){tokenCalls+=1;assert.equal(options.body.get('refresh_token'),'old-refresh');return jsonResponse({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,x_refresh_token_expires_in:7200});}return jsonResponse({QueryResponse:{Account:[]}});}});
  const result=await connector.pull({credentials:{access_token:'old-access',refresh_token:'old-refresh',realmId:'realm-1',expires_at:'2020-01-01T00:00:00.000Z'},cursor:null});
  assert.equal(tokenCalls,1);assert.equal(result.credentials.access_token,'new-access');assert.equal(result.credentials.refresh_token,'new-refresh');assert.equal(result.credentials.realmId,'realm-1');
});

test('QuickBooks records enter one firm canonical graph with source provenance and idempotent refresh',async()=>{
  const repository=new InMemoryRepository();const atlas=new AtlasService(repository);const workspace=await atlas.createWorkspace({name:'QuickBooks Firm'});const vault=new InMemoryCredentialVault();let exchangedRealm=null;const connector={capabilities(){return {oauth2:true,readOnly:true,resources:['accounting']};},beginAuthorization(){return 'https://appcenter.intuit.com/connect/oauth2';},async exchangeCode(input){exchangedRealm=input.realmId;return {access_token:'token',realmId:input.realmId};},async pull(){return {records:[{type:'accounting',id:'Invoice:9',updatedAt:'2026-07-14T12:00:00Z',checksum:'qbo-9',data:{title:'QBO invoice 9',entryType:'invoice',amountMinor:90000,balanceMinor:30000,currency:'USD'}}],nextCursor:{mode:'cdc',changedSince:'2026-07-14T12:00:00Z'},hasMore:false};}};const coexistence=new CmsCoexistenceService(repository,new CmsConnectorRegistry().register('quickbooks',connector),vault,()=> '2026-07-14T12:00:00.000Z');const started=await coexistence.beginAuthorization(workspace.id,'quickbooks',{redirectUri:'https://atlas.example/v1/cms/oauth/callback'},'usr_owner');const connection=await coexistence.completeAuthorization({state:started.state,code:'code',realmId:'realm-9'});await coexistence.sync(workspace.id,connection.id);const repeated=await coexistence.sync(workspace.id,connection.id);const object=(await repository.listObjects(workspace.id,{}))[0];assert.equal(exchangedRealm,'realm-9');assert.equal(object.type,'accounting_entry');assert.equal(object.state.externalSource.provider,'quickbooks');assert.equal(object.state.externalSource.externalId,'Invoice:9');assert.equal(repeated.updated,0);assert.equal((await repository.listEvents(workspace.id)).length,1);assert.equal((await repository.listEvents(workspace.id))[0].source,'cms:quickbooks');
});
