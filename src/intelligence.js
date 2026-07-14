import { AtlasError } from './errors.js';
import { createHash } from 'node:crypto';
import { normalizeDocumentAnalysis } from './document-analysis.js';

export class DocumentIntelligenceProvider {
  constructor(model,blobStore){if(typeof model?.analyzeFile!=='function')throw new AtlasError('INTELLIGENCE_PROVIDER_INVALID','Document intelligence requires a file-capable model',500);if(typeof blobStore?.read!=='function')throw new AtlasError('BLOB_STORE_INVALID','Document intelligence requires readable storage',500);this.model=model;this.blobStore=blobStore;}
  capabilities(){return {triggers:['attachment.received'],documentUnderstanding:true,providerNeutralModel:true};}
  async analyze({event,context}){const document=event.document;if(!document?.state?.storageRef)throw new AtlasError('DOCUMENT_CONTENT_UNAVAILABLE','Document content is unavailable',409);const content=await this.blobStore.read(document.state.storageRef);if(content.length!==document.state.size||createHash('sha256').update(content).digest('hex')!==document.state.sha256)throw new AtlasError('FILE_INTEGRITY_FAILED','Stored file integrity verification failed',500);const result=await this.model.analyzeFile({content,filename:document.title,mediaType:document.state.mediaType,context,instruction:'Analyze this authorized law-firm document. Return JSON only with documentAnalysis, observations, actionProposals, awareness, and retrievalChunks. documentAnalysis is required and must contain: documentType (discovery|discovery_request|discovery_response|motion|notice|court_order|complaint|answer|brief|pleading|subpoena|correspondence|contract|engagement_agreement|invoice|evidence|transcript|affidavit|declaration|deposition|medical_record|police_report|expert_report|settlement_document|other), a source-faithful plain-language summary, confidence from 0 to 1, suggestedTitle, caseNumber, court, documentDate, parties, attorneys, organizations, keyDates as {label,date,sourceLocation}, and requiresAttorneyReview. Do not classify only from the filename. Read the document, identify its legal function, and distinguish requests from responses. Extract classification, parties and entities, matter clues, source-supported facts, dates and deadlines, duties, conflicts, risks, and recommendations. Observation kinds are classification, entity, matter_match, fact, deadline, duty, conflict, risk, recommendation. Every observation requires kind, data, confidence from 0 to 1, and sourceLocation with page or section when available. retrievalChunks contains 1 to 100 source-faithful passages as {text,sourceLocation}; preserve source wording, never invent content, limit each passage to 4000 characters and all passages to 100000 characters. Allowed action types are create_task, create_document, draft_email, and create_calendar_event; they create internal review work only and must never send, file, publish, delete, or take another external action before approval. For a source-supported court date, scheduled call, deposition, case deadline, or traditional meeting, propose create_calendar_event with title, eventType (court_date|scheduled_call|deposition|deadline|meeting|other), startsAt, optional endsAt, matterId, targetUserId, timeZone, location, description, attendees, and isAllDay. Never invent a date or time. awareness requires category document_upload, priority, headline, and a useful summary for attorney review.'});if(!result||!Array.isArray(result.observations)||!Array.isArray(result.actionProposals))throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document provider returned invalid intelligence',502);result.documentAnalysis=normalizeDocumentAnalysis(result.documentAnalysis,{filename:document.title});if(typeof this.model.embedTexts==='function'&&result.observations.length){const texts=result.observations.map(item=>`${document.title}\n${item.kind}\n${JSON.stringify(item.data)}\n${JSON.stringify(item.sourceLocation??{})}`);result.knowledgeEmbeddings=await this.model.embedTexts(texts);}if(Array.isArray(result.retrievalChunks)){const texts=result.retrievalChunks.map(item=>String(item?.text??'').trim());if(texts.length>100||texts.some(text=>!text||text.length>4000)||texts.reduce((sum,text)=>sum+text.length,0)>100000)throw new AtlasError('INTELLIGENCE_RESULT_INVALID','Document retrieval passages exceed safe indexing limits',502);if(typeof this.model.embedTexts==='function'&&texts.length)result.chunkEmbeddings=await this.model.embedTexts(texts);}return result;}
}

export class StructuredModelIntelligenceProvider {
  constructor(model, options={}) { if(typeof model?.complete!=='function')throw new AtlasError('INTELLIGENCE_PROVIDER_INVALID','Structured model provider requires a model',500);this.model=model;this.triggers=options.triggers??['*']; }
  capabilities(){return {triggers:this.triggers,structuredExtraction:true,providerNeutralModel:true};}
  async analyze({event,context}){
    const response=await this.model.complete({messages:[{role:'user',content:JSON.stringify({instruction:'Analyze this authorized Atlas event without waiting for a user prompt. Return JSON only with arrays observations and actionProposals plus optional awareness. Perform classification, entity/matter matching, fact/deadline/duty/risk extraction, and safe work preparation in tandem. Observation kinds: classification, entity, matter_match, fact, deadline, duty, conflict, risk, recommendation. Each observation requires kind, data object, confidence 0..1, and optional sourceLocation. Allowed action types are create_task, create_document, draft_email, and create_calendar_event. These actions create internal review items only: draft_email is always unsent, create_document is always unfiled, create_task is an internal open task, and create_calendar_event does not change any calendar until an attorney approves it. When the source establishes an explicit response request, prepare draft_email for attorney review. When a call requests a callback or follow-up, prepare create_task. When a document or event establishes a deadline or response date, prepare create_task. When email, a call, a document, or case activity establishes a source-supported court date, scheduled phone call, deposition, deadline, or traditional meeting, prepare create_calendar_event with title, eventType (court_date|scheduled_call|deposition|deadline|meeting|other), startsAt, optional endsAt, matterId, targetUserId, timeZone, location, description, attendees, and isAllDay. Never invent a missing date or time. Use only source-supported facts and leave uncertain optional fields null. awareness requires category, priority (low|normal|high|urgent), headline, summary, and optional targetUserId. Never propose sending, filing, publishing, deleting, or another external consequential action.',event,context})}],tools:[],context});
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
      if (triggers?.includes(triggerType)) return {name:preferredName,provider:preferred};
    }
    for(const [name,provider] of this.#providers){const triggers=provider.capabilities()?.triggers;if(triggers?.includes(triggerType))return {name,provider};}
    if(preferredName){const preferred=this.resolve(preferredName);const triggers=preferred.capabilities()?.triggers;if(!triggers||triggers.includes('*'))return {name:preferredName,provider:preferred};}
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
        const persistedResult={...result};delete persistedResult.knowledgeEmbeddings;delete persistedResult.retrievalChunks;delete persistedResult.chunkEmbeddings;return repository.completeIntelligenceJob(job.id, persistedResult, selected.name, this.clock());
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
