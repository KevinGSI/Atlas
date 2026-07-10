import { createHash, randomBytes } from 'node:crypto';
import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';

const hash=(value)=>createHash('sha256').update(value).digest('hex');
const b64url=(value)=>Buffer.from(value).toString('base64url');
const safeConnection=(value)=>{const {credentialRef,...safe}=value;return safe;};

export class CmsConnectorRegistry {
  #connectors=new Map();
  register(name,connector){if(!name||typeof connector?.beginAuthorization!=='function'||typeof connector?.exchangeCode!=='function'||typeof connector?.pull!=='function'||typeof connector?.capabilities!=='function')throw new AtlasError('CMS_CONNECTOR_INVALID','CMS connectors must implement authorization, exchange, pull, and capabilities',500);if(this.#connectors.has(name))throw new AtlasError('CMS_CONNECTOR_EXISTS','CMS connector already exists',409,{provider:name});this.#connectors.set(name,connector);return this;}
  resolve(name){const value=this.#connectors.get(name);if(!value)throw new AtlasError('CMS_CONNECTOR_NOT_FOUND','CMS connector is not registered',503,{provider:name});return value;}
  list(){return [...this.#connectors.entries()].map(([name,connector])=>({name,capabilities:connector.capabilities()}));}
}

export class InMemoryCredentialVault {
  #values=new Map();
  async put(value){const reference=createId('sec');this.#values.set(reference,structuredClone(value));return reference;}
  async get(reference){if(!this.#values.has(reference))throw new AtlasError('CMS_CREDENTIAL_UNAVAILABLE','CMS credential is unavailable',503);return structuredClone(this.#values.get(reference));}
  async delete(reference){this.#values.delete(reference);}
}

export class RepositoryCredentialVault {
  constructor(repository,cipher,clock=()=>new Date().toISOString()){this.repository=repository;this.cipher=cipher;this.clock=clock;}
  async put(value){const id=createId('sec');await this.repository.createEncryptedSecret({id,purpose:'cms_credential',ciphertext:this.cipher.encrypt(JSON.stringify(value),`cms-secret:${id}`),createdAt:this.clock()});return id;}
  async get(id){const value=await this.repository.getEncryptedSecret(id);try{return JSON.parse(this.cipher.decrypt(value.ciphertext,`cms-secret:${id}`));}catch(error){if(error instanceof AtlasError)throw error;throw new AtlasError('CMS_CREDENTIAL_UNAVAILABLE','CMS credential could not be decoded',500);}}
  async delete(id){await this.repository.deleteEncryptedSecret(id);}
}

function mapping(record){
  const map={matter:['matter',record.data.matterType??'matter'],contact:[record.data.contactType==='organization'?'organization':'person','contact'],accounting:['operation','accounting_entry'],task:['operation','task'],calendar:['operation','calendar_event'],document:['document',record.data.documentType??'external_document'],communication:['operation','communication']};
  const value=map[record.type];if(!value)throw new AtlasError('CMS_RECORD_TYPE_UNSUPPORTED','CMS record type is unsupported',422,{type:record.type});return {dimension:value[0],type:value[1]};
}

export class CmsCoexistenceService {
  constructor(repository,connectors,vault,clock=()=>new Date().toISOString()){this.repository=repository;this.connectors=connectors;this.vault=vault;this.clock=clock;}
  async beginAuthorization(workspaceId,provider,input,actorId){
    await this.repository.getWorkspace(workspaceId);const connector=this.connectors.resolve(provider);const state=b64url(randomBytes(32));const verifier=b64url(randomBytes(64));const challenge=b64url(createHash('sha256').update(verifier).digest());const verifierRef=await this.vault.put({verifier});const now=this.clock();const expiresAt=new Date(new Date(now).getTime()+10*60*1000).toISOString();
    await this.repository.createCmsAuthorization({stateHash:hash(state),workspaceId,provider,actorId,verifierRef,redirectUri:required(input.redirectUri,'redirectUri'),expiresAt,usedAt:null,createdAt:now});
    return {authorizationUrl:connector.beginAuthorization({state,codeChallenge:challenge,redirectUri:input.redirectUri}),state,expiresAt};
  }
  async completeAuthorization(input){
    const now=this.clock();const authorization=await this.repository.consumeCmsAuthorization(hash(required(input.state,'state')),now);if(new Date(authorization.expiresAt)<=new Date(now))throw new AtlasError('CMS_AUTHORIZATION_EXPIRED','CMS authorization expired',400);const connector=this.connectors.resolve(authorization.provider);const secret=await this.vault.get(authorization.verifierRef);const credentials=await connector.exchangeCode({code:required(input.code,'code'),codeVerifier:secret.verifier,redirectUri:authorization.redirectUri});const credentialRef=await this.vault.put(credentials);await this.vault.delete(authorization.verifierRef);
    return safeConnection(await this.repository.createCmsConnection({id:createId('cms'),workspaceId:authorization.workspaceId,provider:authorization.provider,credentialRef,status:'connected',accessMode:'read_only',cursor:null,lastSyncedAt:null,errorCode:null,createdBy:authorization.actorId,createdAt:now,updatedAt:now}));
  }
  async listConnections(workspaceId){return (await this.repository.listCmsConnections(workspaceId)).map(safeConnection);}
  async syncAll(){const connections=await this.repository.listActiveCmsConnections();const results=[];for(const connection of connections){try{results.push({connectionId:connection.id,ok:true,result:await this.sync(connection.workspaceId,connection.id)});}catch(error){await this.repository.updateCmsConnection(connection.id,{status:'error',errorCode:error.code??'CMS_SYNC_FAILED',updatedAt:this.clock()});results.push({connectionId:connection.id,ok:false,errorCode:error.code??'CMS_SYNC_FAILED'});}}return results;}
  async sync(workspaceId,connectionId,{maxPages=100}={}){
    const connection=await this.repository.getCmsConnection(workspaceId,connectionId);if(connection.status==='disconnected')throw new AtlasError('CMS_CONNECTION_DISCONNECTED','CMS connection is disconnected',409);const connector=this.connectors.resolve(connection.provider);const credentials=await this.vault.get(connection.credentialRef);let cursor=connection.cursor;let imported=0,updated=0;
    for(let page=0;page<maxPages;page+=1){const batch=await connector.pull({credentials,cursor,accessMode:connection.accessMode});if(!Array.isArray(batch?.records))throw new AtlasError('CMS_SYNC_INVALID_RESPONSE','CMS connector returned invalid records',502);const counts=await this.repository.transaction(async(repository)=>{let created=0,changed=0;for(const record of batch.records){const existing=await repository.findCmsRecordLink(connection.id,record.type,record.id);const shape=mapping(record);const now=this.clock();let object;let triggerType;if(existing){const current=await repository.getObject(workspaceId,existing.atlasObjectId);object=await repository.updateObject(workspaceId,current.id,current.version,{title:record.data.title??current.title,state:{...current.state,...record.data,externalSource:{provider:connection.provider,externalId:record.id}}},now);await repository.updateCmsRecordLink(existing.id,{sourceUpdatedAt:record.updatedAt??null,sourceChecksum:record.checksum??null,lastSyncedAt:now});changed+=1;triggerType='cms.record.updated';}else{object={id:createId('obj'),workspaceId,parentObjectId:null,dimension:shape.dimension,type:shape.type,title:record.data.title??`${record.type} ${record.id}`,state:{...record.data,externalSource:{provider:connection.provider,externalId:record.id}},version:1,createdAt:now,updatedAt:now,deletedAt:null};await repository.createObject(object);await repository.createCmsRecordLink({id:createId('cml'),workspaceId,connectionId:connection.id,externalType:record.type,externalId:record.id,atlasObjectId:object.id,sourceUpdatedAt:record.updatedAt??null,sourceChecksum:record.checksum??null,lastSyncedAt:now});created+=1;triggerType='cms.record.imported';}const event={id:createId('evt'),workspaceId,parentObjectId:object.id,type:triggerType,actorId:connection.createdBy,source:`cms:${connection.provider}`,confidence:1,visibility:'workspace',relatedObjectIds:[],data:{connectionId:connection.id,externalType:record.type,externalId:record.id},occurredAt:record.updatedAt??now,createdAt:now};await repository.createEvent(event);await repository.createIntelligenceJob({id:createId('inj'),workspaceId,triggerType:'cms.record.synced',objectId:object.id,eventId:event.id,status:'pending',attempts:0,payload:{provider:connection.provider,recordType:record.type,object},result:null,provider:null,errorCode:null,availableAt:now,lockedAt:null,createdAt:now,completedAt:null});}return {created,changed};});imported+=counts.created;updated+=counts.changed;cursor=batch.nextCursor??cursor;await this.repository.updateCmsConnection(connection.id,{status:'connected',cursor,lastSyncedAt:this.clock(),errorCode:null,updatedAt:this.clock()});if(!batch.hasMore)return {connectionId,imported,updated,cursor,complete:true};}
    return {connectionId,imported,updated,cursor,complete:false};
  }
  async disconnect(workspaceId,connectionId){const connection=await this.repository.getCmsConnection(workspaceId,connectionId);const connector=this.connectors.resolve(connection.provider);const credentials=await this.vault.get(connection.credentialRef);if(typeof connector.revoke==='function')await connector.revoke({credentials});await this.vault.delete(connection.credentialRef);return safeConnection(await this.repository.updateCmsConnection(connection.id,{status:'disconnected',errorCode:null,updatedAt:this.clock()}));}
}

export async function runCmsSyncScheduler(service,options={}){const signal=options.signal;const intervalMs=options.intervalMs??300000;const onCycle=options.onCycle??(()=>{});while(!signal?.aborted){onCycle(await service.syncAll());if(signal?.aborted)break;await new Promise((resolve)=>{const timer=setTimeout(resolve,intervalMs);signal?.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});}}
