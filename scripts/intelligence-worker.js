import { loadConfig } from '../src/config.js';
import { createPostgresRuntime } from '../src/runtime.js';
import { createAiProviderRegistry } from '../src/ai-providers.js';
import { AtlasIntelligenceRuntime, DocumentIntelligenceProvider, IntelligenceProviderRegistry, StructuredModelIntelligenceProvider, runIntelligenceWorker } from '../src/intelligence.js';
import { IntelligenceProjectionService } from '../src/intelligence-projection.js';
import { AtlasResolver } from '../src/resolution.js';
import { SituationalPlaybookEngine } from '../src/situational-awareness.js';
import { RepositoryBlobStore } from '../src/file-storage.js';
import { DocumentChunkIndexer, DocumentKnowledgeIndexer, runDocumentKnowledgeBackfill } from '../src/document-knowledge.js';
import { createContentCipher } from '../src/content-security.js';

const config=loadConfig(process.env);
if(!config.databaseUrl)throw new Error('DATABASE_URL is required for the intelligence worker');
const runtime=await createPostgresRuntime(process.env);
const model=createAiProviderRegistry(config).resolve(config.aiProvider);
const contentCipher=createContentCipher(config);
if(!model)throw new Error('AI_PROVIDER and its credentials are required for the default intelligence worker');
const providers=new IntelligenceProviderRegistry();
if(typeof model.analyzeFile==='function')providers.register('document-analysis',new DocumentIntelligenceProvider(model,new RepositoryBlobStore(runtime.repository)));
providers.register('configured-model',new StructuredModelIntelligenceProvider(model));
const intelligence=new AtlasIntelligenceRuntime(runtime.repository,providers,{providerName:config.intelligenceProvider??'configured-model',projector:new IntelligenceProjectionService(undefined,{contentCipher}),resolver:new AtlasResolver(runtime.repository),playbooks:new SituationalPlaybookEngine()});
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
const onError=(error)=>console.error(error.code??'INTELLIGENCE_WORKER_ERROR',error.message);
const backfill=typeof model.embedTexts==='function'?runDocumentKnowledgeBackfill(new DocumentKnowledgeIndexer(runtime.repository,model),{signal:controller.signal,intervalMs:config.documentIndexIntervalMs,limit:config.documentIndexBatchSize,onError}):Promise.resolve();
const chunkBackfill=typeof model.extractDocumentChunks==='function'&&typeof model.embedTexts==='function'?runDocumentKnowledgeBackfill(new DocumentChunkIndexer(runtime.repository,model,new RepositoryBlobStore(runtime.repository),contentCipher),{signal:controller.signal,intervalMs:config.documentIndexIntervalMs,limit:Math.min(config.documentIndexBatchSize,5),onError}):Promise.resolve();
try{await Promise.all([runIntelligenceWorker(intelligence,{signal:controller.signal,onError}),backfill,chunkBackfill]);}finally{await runtime.close();}
