import { createHash } from 'node:crypto';
import { AtlasError } from './errors.js';
import { createId } from './ids.js';

function embeddingText(item){return `${item.documentTitle}\n${item.kind}\n${JSON.stringify(item.data)}\n${JSON.stringify(item.sourceLocation??{})}`;}

export class DocumentKnowledgeIndexer {
  constructor(repository,embeddingProvider,clock=()=>new Date().toISOString()){if(typeof repository?.listUnembeddedDocumentObservations!=='function'||typeof repository?.createDocumentKnowledgeEmbedding!=='function')throw new AtlasError('DOCUMENT_INDEX_INVALID','Document index repository methods are required',500);if(typeof embeddingProvider?.embedTexts!=='function')throw new AtlasError('DOCUMENT_INDEX_PROVIDER_INVALID','An interchangeable embedding provider is required',500);this.repository=repository;this.embeddingProvider=embeddingProvider;this.clock=clock;}
  model(){const model=this.embeddingProvider.capabilities?.().embeddingModel??this.embeddingProvider.embeddingModel;if(!model)throw new AtlasError('DOCUMENT_INDEX_PROVIDER_INVALID','Embedding provider must identify its model',500);return model;}
  async indexWorkspace(workspaceId,{limit=50}={}){if(!Number.isInteger(limit)||limit<1||limit>100)throw new AtlasError('VALIDATION_ERROR','document index batch limit must be between 1 and 100',400);const configuredModel=this.model();const pending=await this.repository.listUnembeddedDocumentObservations(workspaceId,configuredModel,limit);if(!pending.length)return {workspaceId,indexed:0,model:configuredModel,usage:{inputTokens:0,outputTokens:0,totalTokens:0}};const result=await this.embeddingProvider.embedTexts(pending.map(embeddingText));if(result.vectors.length!==pending.length)throw new AtlasError('AI_PROVIDER_INVALID_RESPONSE','Embedding count does not match document findings',502);const model=result.indexModel??configuredModel;await Promise.all(pending.map((item,index)=>this.repository.createDocumentKnowledgeEmbedding({id:createId('dke'),workspaceId,observationId:item.id,provider:result.provider??'configured',model,dimensions:result.dimensions??result.vectors[index].length,embedding:result.vectors[index],createdAt:this.clock()})));return {workspaceId,indexed:pending.length,model,usage:result.usage??{inputTokens:0,outputTokens:0,totalTokens:0}};}
  async indexAll(options={}){const workspaces=await this.repository.listWorkspaces();const results=[];for(const workspace of workspaces)results.push(await this.indexWorkspace(workspace.id,options));return {indexed:results.reduce((total,item)=>total+item.indexed,0),workspaces:results};}
  async drain({limit=50,maxBatches=100}={}){const totals=[];for(let batch=0;batch<maxBatches;batch+=1){const result=await this.indexAll({limit});totals.push(result);if(!result.indexed)break;}return {indexed:totals.reduce((total,item)=>total+item.indexed,0),batches:totals.length,complete:totals.at(-1)?.indexed===0,workspaces:totals.flatMap(item=>item.workspaces)};}
}

export async function runDocumentKnowledgeBackfill(indexer,{signal,intervalMs=60000,limit=50,onError=()=>{}}={}){while(!signal?.aborted){try{await indexer.indexAll({limit});}catch(error){onError(error);}if(signal?.aborted)break;await new Promise(resolve=>{const timer=setTimeout(resolve,intervalMs);signal?.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});}}

function validateChunks(chunks){
  if(!Array.isArray(chunks)||!chunks.length||chunks.length>100)throw new AtlasError('DOCUMENT_CHUNKS_INVALID','Document extraction must return 1 to 100 source passages',502);
  let total=0;
  return chunks.map((chunk,index)=>{const text=String(chunk?.text??'').trim();total+=text.length;if(!text||text.length>4000||total>100000)throw new AtlasError('DOCUMENT_CHUNKS_INVALID','Document source passages exceed safe indexing limits',502);const sourceLocation=chunk.sourceLocation??null;if(sourceLocation!==null&&(typeof sourceLocation!=='object'||Array.isArray(sourceLocation)))throw new AtlasError('DOCUMENT_CHUNKS_INVALID','Document source location is invalid',502);return {text,sourceLocation,ordinal:index};});
}

export class DocumentChunkIndexer {
  constructor(repository,provider,blobStore,contentCipher,clock=()=>new Date().toISOString()){
    if(typeof repository?.listUnchunkedStoredDocuments!=='function'||typeof repository?.createDocumentKnowledgeChunk!=='function')throw new AtlasError('DOCUMENT_INDEX_INVALID','Document chunk repository methods are required',500);
    if(typeof provider?.extractDocumentChunks!=='function'||typeof provider?.embedTexts!=='function')throw new AtlasError('DOCUMENT_INDEX_PROVIDER_INVALID','A file-capable interchangeable AI provider with embeddings is required',500);
    if(typeof blobStore?.read!=='function')throw new AtlasError('BLOB_STORE_INVALID','Document chunk indexing requires readable storage',500);
    this.repository=repository;this.provider=provider;this.blobStore=blobStore;this.contentCipher=contentCipher??{encrypt:value=>value};this.clock=clock;
  }
  model(){const model=this.provider.capabilities?.().embeddingModel??this.provider.embeddingModel;if(!model)throw new AtlasError('DOCUMENT_INDEX_PROVIDER_INVALID','Embedding provider must identify its model',500);return model;}
  async indexWorkspace(workspaceId,{limit=5}={}){
    if(!Number.isInteger(limit)||limit<1||limit>10)throw new AtlasError('VALIDATION_ERROR','document chunk batch limit must be between 1 and 10',400);
    const configuredModel=this.model();const documents=await this.repository.listUnchunkedStoredDocuments(workspaceId,configuredModel,limit);let indexed=0;let passages=0;const usage={inputTokens:0,outputTokens:0,totalTokens:0};
    for(const document of documents){
      const content=await this.blobStore.read(document.state.storageRef);if(content.length!==document.state.size||createHash('sha256').update(content).digest('hex')!==document.state.sha256)throw new AtlasError('FILE_INTEGRITY_FAILED','Stored file integrity verification failed',500);
      const extraction=await this.provider.extractDocumentChunks({content,filename:document.title,mediaType:document.state.mediaType,context:{workspaceId,objectId:document.id}});const chunks=validateChunks(extraction.retrievalChunks);const embedded=await this.provider.embedTexts(chunks.map(chunk=>chunk.text));
      if(!Array.isArray(embedded.vectors)||embedded.vectors.length!==chunks.length)throw new AtlasError('AI_PROVIDER_INVALID_RESPONSE','Embedding count does not match document source passages',502);
      const model=embedded.indexModel??configuredModel;
      for(let index=0;index<chunks.length;index+=1){const chunk=chunks[index];const id=createId('dkc');await this.repository.createDocumentKnowledgeChunk({id,workspaceId,sourceObjectId:document.id,ordinal:chunk.ordinal,content:this.contentCipher.encrypt(chunk.text,`document-chunk:${id}:content`),sourceLocation:chunk.sourceLocation,provider:embedded.provider??extraction.provider??'configured',model,dimensions:embedded.dimensions??embedded.vectors[index].length,embedding:embedded.vectors[index],createdAt:this.clock()});}
      indexed+=1;passages+=chunks.length;for(const key of Object.keys(usage))usage[key]+=(extraction.usage?.[key]??0)+(embedded.usage?.[key]??0);
    }
    return {workspaceId,indexed,passages,model:configuredModel,usage};
  }
  async indexAll(options={}){const results=[];for(const workspace of await this.repository.listWorkspaces())results.push(await this.indexWorkspace(workspace.id,options));return {indexed:results.reduce((sum,item)=>sum+item.indexed,0),passages:results.reduce((sum,item)=>sum+item.passages,0),workspaces:results};}
  async drain({limit=5,maxBatches=100}={}){const totals=[];for(let batch=0;batch<maxBatches;batch+=1){const result=await this.indexAll({limit});totals.push(result);if(!result.indexed)break;}return {indexed:totals.reduce((sum,item)=>sum+item.indexed,0),passages:totals.reduce((sum,item)=>sum+item.passages,0),batches:totals.length,complete:totals.at(-1)?.indexed===0,workspaces:totals.flatMap(item=>item.workspaces)};}
}
