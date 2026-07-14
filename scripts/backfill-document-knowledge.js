import { loadConfig } from '../src/config.js';
import { createPostgresRuntime } from '../src/runtime.js';
import { createAiProviderRegistry } from '../src/ai-providers.js';
import { DocumentChunkIndexer, DocumentKnowledgeIndexer } from '../src/document-knowledge.js';
import { RepositoryBlobStore } from '../src/file-storage.js';
import { createContentCipher } from '../src/content-security.js';

const config=loadConfig(process.env);
if(!config.databaseUrl)throw new Error('DATABASE_URL is required for document knowledge backfill');
const runtime=await createPostgresRuntime(process.env);
try{const provider=createAiProviderRegistry(config).resolve(config.aiProvider);if(typeof provider?.embedTexts!=='function')throw new Error('Configured AI provider does not support embeddings');const observations=await new DocumentKnowledgeIndexer(runtime.repository,provider).drain({limit:Number(process.env.DOCUMENT_INDEX_BATCH_SIZE??50),maxBatches:Number(process.env.DOCUMENT_INDEX_MAX_BATCHES??100)});let documents={indexed:0,passages:0,complete:true};if(typeof provider.extractDocumentChunks==='function')documents=await new DocumentChunkIndexer(runtime.repository,provider,new RepositoryBlobStore(runtime.repository),createContentCipher(config)).drain({limit:Math.min(Number(process.env.DOCUMENT_INDEX_BATCH_SIZE??5),5),maxBatches:Number(process.env.DOCUMENT_INDEX_MAX_BATCHES??100)});console.log(JSON.stringify({observations,documents}));if(!observations.complete||!documents.complete)process.exitCode=2;}finally{await runtime.close();}
