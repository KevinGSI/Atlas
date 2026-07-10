import { loadConfig } from '../src/config.js';
import { createPostgresRuntime } from '../src/runtime.js';
import { createAiProviderRegistry } from '../src/ai-providers.js';
import { AtlasIntelligenceRuntime, IntelligenceProviderRegistry, StructuredModelIntelligenceProvider, runIntelligenceWorker } from '../src/intelligence.js';
import { IntelligenceProjectionService } from '../src/intelligence-projection.js';
import { AtlasResolver } from '../src/resolution.js';

const config=loadConfig(process.env);
if(!config.databaseUrl)throw new Error('DATABASE_URL is required for the intelligence worker');
const runtime=await createPostgresRuntime(process.env);
const model=createAiProviderRegistry(config).resolve(config.aiProvider);
if(!model)throw new Error('AI_PROVIDER and its credentials are required for the default intelligence worker');
const providers=new IntelligenceProviderRegistry().register('configured-model',new StructuredModelIntelligenceProvider(model));
const intelligence=new AtlasIntelligenceRuntime(runtime.repository,providers,{providerName:config.intelligenceProvider??'configured-model',projector:new IntelligenceProjectionService(),resolver:new AtlasResolver(runtime.repository)});
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
try{await runIntelligenceWorker(intelligence,{signal:controller.signal,onError:(error)=>console.error(error.code??'INTELLIGENCE_WORKER_ERROR',error.message)});}finally{await runtime.close();}
