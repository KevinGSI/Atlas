import { loadConfig } from '../src/config.js';
import { createPostgresRuntime } from '../src/runtime.js';
import { createAiProviderRegistry } from '../src/ai-providers.js';
import { DocumentKnowledgeIndexer } from '../src/document-knowledge.js';

const config=loadConfig(process.env);
if(!config.databaseUrl)throw new Error('DATABASE_URL is required for document knowledge backfill');
const runtime=await createPostgresRuntime(process.env);
try{const provider=createAiProviderRegistry(config).resolve(config.aiProvider);if(typeof provider?.embedTexts!=='function')throw new Error('Configured AI provider does not support embeddings');const indexer=new DocumentKnowledgeIndexer(runtime.repository,provider);const result=await indexer.drain({limit:Number(process.env.DOCUMENT_INDEX_BATCH_SIZE??50),maxBatches:Number(process.env.DOCUMENT_INDEX_MAX_BATCHES??100)});console.log(JSON.stringify(result));if(!result.complete)process.exitCode=2;}finally{await runtime.close();}
