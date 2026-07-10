import { loadConfig } from '../src/config.js';
import { createAiProviderRegistry } from '../src/ai-providers.js';
import { runAiEvaluation } from '../src/ai-evaluation.js';

let config;try{config=loadConfig(process.env);}catch(error){console.error(error.message);process.exit(1);}
if(!config.aiProvider){console.error('AI_PROVIDER and provider credentials are required for live AI evaluation');process.exit(1);}
const provider=createAiProviderRegistry(config).resolve(config.aiProvider);const report=await runAiEvaluation(provider);console.log(JSON.stringify(report,null,2));if(!report.passed)process.exit(1);
