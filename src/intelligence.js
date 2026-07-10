import { AtlasError } from './errors.js';

export class StructuredModelIntelligenceProvider {
  constructor(model, options={}) { if(typeof model?.complete!=='function')throw new AtlasError('INTELLIGENCE_PROVIDER_INVALID','Structured model provider requires a model',500);this.model=model;this.triggers=options.triggers??['*']; }
  capabilities(){return {triggers:this.triggers,structuredExtraction:true,providerNeutralModel:true};}
  async analyze({event,context}){
    const response=await this.model.complete({messages:[{role:'user',content:JSON.stringify({instruction:'Analyze this authorized Atlas event without waiting for a user prompt. Return JSON only with arrays observations and actionProposals plus optional awareness. Perform classification, entity/matter matching, fact/deadline/duty/risk extraction, and safe work preparation in tandem. Observation kinds: classification, entity, matter_match, fact, deadline, duty, conflict, risk, recommendation. Each observation requires kind, data object, confidence 0..1, and optional sourceLocation. Allowed action types are create_task, create_document, and draft_email. These actions create internal review items only: draft_email is always unsent, create_document is always unfiled, and create_task is an internal open task. When the source establishes an explicit response request, prepare draft_email for attorney review. When a call requests a callback or follow-up, prepare create_task. When a document or event establishes a deadline or response date, prepare create_task. Use only source-supported facts and leave uncertain optional fields null. awareness requires category, priority (low|normal|high|urgent), headline, summary, and optional targetUserId. Never propose sending, filing, publishing, deleting, or another external consequential action.',event,context})}],tools:[],context});
    if(typeof response?.text!=='string')throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Model did not return structured intelligence text',502);
    try{return JSON.parse(response.text);}catch{throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Model intelligence output was not valid JSON',502);}
  }
}

export class IntelligenceProviderRegistry {
  #providers = new Map();
  register(name, provider) {
    if (!name || typeof provider?.analyze !== 'function' || typeof provider?.capabilities !== 'function') throw new AtlasError('INTELLIGENCE_PROVIDER_INVALID', 'Intelligence providers must implement analyze and capabilities', 500);
    if (this.#providers.has(name)) throw new AtlasError('INTELLIGENCE_PROVIDER_EXISTS', 'Intelligence provider is already registered', 409, { provider: name });
    this.#providers.set(name, provider);
    return this;
  }
  resolve(name) { const provider=this.#providers.get(name); if(!provider) throw new AtlasError('INTELLIGENCE_PROVIDER_NOT_FOUND','Intelligence provider is not registered',503,{provider:name}); return provider; }
  resolveFor(triggerType, preferredName = null) {
    if (preferredName) {
      const preferred=this.resolve(preferredName);const triggers=preferred.capabilities()?.triggers;
      if (!triggers || triggers.includes('*') || triggers.includes(triggerType)) return {name:preferredName,provider:preferred};
    }
    for(const [name,provider] of this.#providers){const triggers=provider.capabilities()?.triggers;if(!triggers||triggers.includes('*')||triggers.includes(triggerType))return {name,provider};}
    throw new AtlasError('INTELLIGENCE_PROVIDER_NOT_FOUND','No intelligence provider supports this trigger',503,{triggerType});
  }
  list() { return [...this.#providers.entries()].map(([name, provider]) => ({ name, capabilities: provider.capabilities() })); }
}

export class AtlasIntelligenceRuntime {
  constructor(repository, providers, options = {}) {
    this.repository = repository;
    this.providers = providers;
    this.providerName = options.providerName ?? null;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.projector = options.projector ?? null;
    this.resolver = options.resolver ?? null;
    this.playbooks = options.playbooks ?? null;
  }
  async processNext() {
    const job = await this.repository.claimIntelligenceJob(this.clock());
    if (!job) return null;
    try {
      const selected = this.providers.resolveFor(job.triggerType,this.providerName);
      const provider = selected.provider;
      const email=job.payload?.email;const resolution=this.resolver?{
        matters:await this.resolver.resolveMatter(job.workspaceId,{title:email?.title,reference:email?.title}),
        entities:await this.resolver.resolveEntity(job.workspaceId,{email:email?.state?.from})
      }:undefined;
      let result = await provider.analyze({ event: job.payload, context: { workspaceId: job.workspaceId, objectId: job.objectId, eventId: job.eventId, triggerType:job.triggerType, ...(resolution?{resolution}:{}) } });
      if(this.playbooks)result=this.playbooks.apply(job,result);
      return await this.repository.transaction(async (repository) => {
        if (this.projector) await this.projector.project(repository, job, selected.name, result);
        return repository.completeIntelligenceJob(job.id, result, selected.name, this.clock());
      });
    } catch (error) {
      await this.repository.failIntelligenceJob(job.id, error instanceof AtlasError ? error.code : 'INTELLIGENCE_ANALYSIS_FAILED', this.clock(), this.maxAttempts);
      throw error;
    }
  }
}

export async function runIntelligenceWorker(runtime, options = {}) {
  const signal=options.signal;const pollMs=options.pollMs??1000;const onError=options.onError??(()=>{});
  while(!signal?.aborted){
    try{const result=await runtime.processNext();if(result)continue;}catch(error){onError(error);}
    if(signal?.aborted)break;
    await new Promise((resolve)=>{const timer=setTimeout(resolve,pollMs);signal?.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  }
}
