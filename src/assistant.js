import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';

function boundedLimit(value, fallback = 10) {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new AtlasError('AI_TOOL_ARGUMENT_INVALID', 'limit must be an integer between 1 and 50', 400);
  }
  return limit;
}

function source(object) {
  return { objectId: object.id, dimension: object.dimension, type: object.type, title: object.title };
}

function normalizedIdentifier(value){return String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function isClosed(object){return ['completed','closed','dismissed','archived'].includes(String(object.state?.status??'').toLowerCase());}
function relevantDate(object){return object.state?.date??object.state?.dueDate??object.state?.occurredAt??object.updatedAt??object.createdAt??null;}
function isCommunication(object){return object.dimension==='operation'&&['communication','phone_call','incoming_email','email','outgoing_email'].includes(object.type);}
function assertPublicWebQuery(query,workspace,objects){if(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(query)||/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(query))throw new AtlasError('AI_WEB_QUERY_CONFIDENTIAL','Public web searches cannot contain firm email addresses or phone numbers',400);const values=[workspace?.name,...objects.filter(object=>['matter','client','person','organization'].includes(object.dimension)).map(object=>object.title),...objects.flatMap(object=>['caseNumber','clientName','email','phone'].map(key=>object.state?.[key]))].map(normalizedIdentifier).filter(value=>value.length>=6);const normalized=normalizedIdentifier(query);const match=values.find(value=>normalized.includes(value));if(match)throw new AtlasError('AI_WEB_QUERY_CONFIDENTIAL','Public web searches cannot contain identifiers found in the private firm twin',400);}

const ATLAS_ASSISTANT_INSTRUCTIONS = `You are Atlas, the native intelligence layer for an authorized law-firm workspace.
Ground factual answers in Atlas tools and never invent firm facts. For a question about document contents, controlling documents, facts found in files, or firm-wide document patterns, call search_document_knowledge and cite its document title and page or section when supplied. Treat candidate document extraction as unreviewed AI analysis and say so; never present it as attorney-verified fact. For a matter-specific question, retrieve the matter and call get_matter_context before concluding. For firm counts, workload, client-contact frequency, or operational trends, call compute_firm_metrics instead of estimating. For priority questions, call list_daily_priorities and inspect the relevant matter context. Treat tasks, deadlines, documents, communications, clients, accepted intelligence, and matter health as parts of one canonical firm twin. Never say a task or deadline is missing unless the retrieved matter context confirms it. Cite the Atlas records used. When current public information is necessary and search_public_web is available, use it only with a generic public-law query that contains no client name, matter title, case number, email, phone number, firm strategy, or other private firm data; clearly distinguish public web sources from Atlas firm records. Prepare consequential work only through proposal tools; never send, file, publish, or create consequential work directly.`;

export class AtlasToolRegistry {
  constructor(service,options={}) { this.service = service; this.webResearch=options.webResearch??null;this.embeddingProvider=options.embeddingProvider??null; }

  definitions() {
    return [
      { name: 'search_objects', description: 'Search authorized workspace objects by title, type, dimension, or state text.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] } },
      { name: 'search_twin', description: 'Search shared accepted digital-twin objects and intelligence observations.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'search_document_knowledge', description: 'Search authorized firm documents and their extracted intelligence with document, matter, page or section, confidence, and attorney-review provenance. Candidate results are unreviewed AI extraction and must be described that way.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] } },
      { name: 'list_recent_matters', description: 'List the most recently opened matters in the authorized workspace.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } } },
      { name: 'get_object', description: 'Retrieve one object from the authorized workspace by object ID.', inputSchema: { type: 'object', properties: { objectId: { type: 'string' } }, required: ['objectId'] } },
      { name: 'get_matter_health', description: 'Get explainable health for one matter in the authorized workspace.', inputSchema: { type: 'object', properties: { matterId: { type: 'string' } }, required: ['matterId'] } },
      { name: 'get_matter_context', description: 'Retrieve one authorized matter with all direct canonical work records, including tasks, deadlines, documents, communications, clients, and explainable health. Use this before answering a matter-specific work, status, deadline, or priority question.', inputSchema: { type: 'object', properties: { matterId: { type: 'string' } }, required: ['matterId'] } },
      { name: 'list_daily_priorities', description: 'Derive priority matters from health, canonical deadline objects, open task objects, and incomplete matter state.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } } },
      { name: 'compute_firm_metrics', description: 'Compute deterministic server-side firm totals and recent-matter activity, including task, deadline, document, communication, and client-contact counts. Use this for quantitative questions instead of estimating.', inputSchema: { type: 'object', properties: { recentMatterLimit: { type: 'integer' } } } },
      ...(this.webResearch?[{ name: 'search_public_web', description: 'Research current public internet sources through an isolated provider. The query must be generic and must never contain private firm, client, matter, contact, strategy, or document information. Returns clickable web citations.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }]:[]),
      { name: 'propose_create_task', description: 'Propose a task for human approval. This never creates the task directly.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, matterId: { type: 'string' }, dueDate: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } },
      { name: 'propose_create_document', description: 'Propose saving a legal-document draft for human approval. This never files or exports it.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, documentType: { type: 'string' }, matterId: { type: 'string' }, content: { type: 'string' } }, required: ['title', 'documentType', 'content'] } },
      { name: 'propose_draft_email', description: 'Propose saving an email draft for human approval. This never sends email.', inputSchema: { type: 'object', properties: { subject: { type: 'string' }, recipients: { type: 'array', items: { type: 'string' } }, matterId: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'recipients', 'body'] } }
    ];
  }

  async execute(name, workspaceId, args = {}) {
    switch (name) {
      case 'search_objects': {
        const query = required(args.query, 'query').trim().toLowerCase();
        const limit = boundedLimit(args.limit);
        const objects = (await this.service.listObjects(workspaceId, {}))
          .filter((object) => `${object.title} ${object.type} ${object.dimension} ${JSON.stringify(object.state)}`.toLowerCase().includes(query))
          .slice(0, limit);
        return { data: objects, sources: objects.map(source) };
      }
      case 'search_twin': {
        const result=await this.service.searchTwin(workspaceId,required(args.query,'query'));
        return {data:result,sources:result.objects.map(source)};
      }
      case 'search_document_knowledge': {
        const query=required(args.query,'query');const limit=boundedLimit(args.limit,20);let results;let usage;if(typeof this.embeddingProvider?.embedTexts==='function'){const embedded=await this.embeddingProvider.embedTexts([query]);results=await this.service.searchSemanticDocumentKnowledge(workspaceId,query,embedded.vectors[0],embedded.indexModel??embedded.model,limit);usage=embedded.usage;}else results=await this.service.searchDocumentKnowledge(workspaceId,query,limit);
        const sources=results.map(item=>({sourceId:item.citationId,sourceType:'document_knowledge',objectId:item.sourceObjectId,observationId:item.observationId??null,title:item.documentTitle,documentType:item.documentType,matterId:item.matterId,matterTitle:item.matterTitle,kind:item.kind,confidence:item.confidence,reviewStatus:item.reviewStatus,sourceLocation:item.sourceLocation}));
        return {data:{results,count:results.length,retrievalMode:usage?'semantic':'structured'},sources,...(usage?{usage}:{})};
      }
      case 'list_recent_matters': {
        const limit = boundedLimit(args.limit);
        const matters = (await this.service.listObjects(workspaceId, { dimension: 'matter' }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
        return { data: matters, sources: matters.map(source) };
      }
      case 'get_object': {
        const object = await this.service.getObject(workspaceId, required(args.objectId, 'objectId'));
        return { data: object, sources: [source(object)] };
      }
      case 'get_matter_health': {
        const matterId = required(args.matterId, 'matterId');
        const health = await this.service.matterHealth(workspaceId, matterId);
        const matter = await this.service.getObject(workspaceId, matterId);
        return { data: health, sources: [source(matter)] };
      }
      case 'get_matter_context': {
        const matterId = required(args.matterId, 'matterId');
        const matter = await this.service.getObject(workspaceId, matterId);
        if (matter.dimension !== 'matter') throw new AtlasError('NOT_A_MATTER', 'Object is not a matter', 400);
        const related = (await this.service.listObjects(workspaceId, {})).filter((object) => object.parentObjectId === matterId);
        const health = await this.service.matterHealth(workspaceId, matterId);
        return { data: { matter, health, related }, sources: [matter, ...related].map(source) };
      }
      case 'list_daily_priorities': {
        const limit = boundedLimit(args.limit, 5);
        const objects = await this.service.listObjects(workspaceId, {});
        const matters = objects.filter((object) => object.dimension === 'matter');
        const priorities = await Promise.all(matters.map(async (matter) => {
          const health = await this.service.matterHealth(workspaceId, matter.id);
          const related = objects.filter((object) => object.parentObjectId === matter.id);
          const deadlines = related.filter((object) => object.type === 'deadline' && object.state?.status !== 'completed')
            .map((object) => ({ object, date: object.state?.date ?? object.state?.dueDate ?? null }))
            .filter((item) => item.date).sort((a, b) => a.date.localeCompare(b.date));
          const deadline = matter.state.nextDeadline ?? deadlines[0]?.date ?? null;
          const overdue = deadline ? new Date(deadline).getTime() < new Date(this.service.clock()).getTime() : false;
          const openTasks = related.filter((object) => object.type === 'task' && object.state?.status !== 'completed');
          return { matterId: matter.id, title: matter.title, health, deadline, overdue, openTaskCount: openTasks.length };
        }));
        priorities.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.health.score - b.health.score || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
        const selected = priorities.slice(0, limit);
        const selectedIds = new Set(selected.map((item) => item.matterId));
        const sourceObjects = objects.filter((object) => selectedIds.has(object.id) || selectedIds.has(object.parentObjectId));
        return { data: selected, sources: sourceObjects.map(source) };
      }
      case 'compute_firm_metrics': {
        const recentMatterLimit=boundedLimit(args.recentMatterLimit,10);const objects=await this.service.listObjects(workspaceId,{});const matters=objects.filter(object=>object.dimension==='matter');const tasks=objects.filter(object=>object.type==='task');const deadlines=objects.filter(object=>object.type==='deadline');const communications=objects.filter(isCommunication);const now=new Date(this.service.clock()).getTime();const sevenDays=now+7*86_400_000;const openTasks=tasks.filter(object=>!isClosed(object));const openDeadlines=deadlines.filter(object=>!isClosed(object));const dateMs=object=>{const value=relevantDate(object);const parsed=value?new Date(value).getTime():NaN;return Number.isFinite(parsed)?parsed:null;};const latestMatters=matters.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,recentMatterLimit).map(matter=>{const related=objects.filter(object=>object.parentObjectId===matter.id||object.state?.matterId===matter.id);const contacts=related.filter(isCommunication).sort((a,b)=>String(relevantDate(b)??'').localeCompare(String(relevantDate(a)??'')));return {matterId:matter.id,title:matter.title,caseNumber:matter.state?.caseNumber??null,openedAt:matter.createdAt,status:matter.state?.status??'open',clientContactCount:contacts.length,lastClientContactAt:contacts[0]?relevantDate(contacts[0]):null,openTaskCount:related.filter(object=>object.type==='task'&&!isClosed(object)).length,openDeadlineCount:related.filter(object=>object.type==='deadline'&&!isClosed(object)).length,documentCount:related.filter(object=>object.dimension==='document').length};});const selectedIds=new Set(latestMatters.map(item=>item.matterId));const sourceObjects=objects.filter(object=>selectedIds.has(object.id)||selectedIds.has(object.parentObjectId)||selectedIds.has(object.state?.matterId)).slice(0,250);return {data:{asOf:this.service.clock(),totals:{objects:objects.length,matters:matters.length,openMatters:matters.filter(object=>!isClosed(object)).length,clients:objects.filter(object=>['client','person'].includes(object.dimension)).length,documents:objects.filter(object=>object.dimension==='document').length,communications:communications.length,openTasks:openTasks.length,overdueTasks:openTasks.filter(object=>(dateMs(object)??Infinity)<now).length,openDeadlines:openDeadlines.length,missedDeadlines:openDeadlines.filter(object=>(dateMs(object)??Infinity)<now).length,deadlinesWithinSevenDays:openDeadlines.filter(object=>{const date=dateMs(object);return date!==null&&date>=now&&date<=sevenDays;}).length},recentMatters:latestMatters},sources:sourceObjects.map(source)};
      }
      case 'search_public_web': {
        if(!this.webResearch)throw new AtlasError('WEB_RESEARCH_NOT_CONFIGURED','Public web research is not configured',503);const query=required(args.query,'query').trim();if(query.length<3||query.length>1000)throw new AtlasError('AI_WEB_QUERY_INVALID','Public web query must contain 3 to 1000 characters',400);const [workspace,objects]=await Promise.all([this.service.getWorkspace(workspaceId),this.service.listObjects(workspaceId,{})]);assertPublicWebQuery(query,workspace,objects);const result=await this.webResearch.search({query});return {data:{answer:result.answer,sources:result.sources},sources:[],webSources:result.sources,usage:result.usage??{inputTokens:0,outputTokens:0,totalTokens:0}};
      }
      case 'propose_create_task': {
        const input = { title: required(args.title, 'title').trim(), matterId: args.matterId ?? null, dueDate: args.dueDate ?? null, description: args.description ?? null };
        if (!input.title || input.title.length > 240) throw new AtlasError('AI_TOOL_ARGUMENT_INVALID', 'task title must contain 1 to 240 characters', 400);
        const sources = [];
        if (input.matterId) sources.push(source(await this.service.getObject(workspaceId, input.matterId)));
        return { data: { proposed: true, actionType: 'create_task', input }, sources, actionProposal: { actionType: 'create_task', input } };
      }
      case 'propose_create_document': {
        const input = { title: required(args.title, 'title').trim(), documentType: required(args.documentType, 'documentType').trim(), matterId: args.matterId ?? null, content: required(args.content, 'content') };
        if (!input.title || input.title.length > 240 || !input.documentType || input.documentType.length > 120 || input.content.length > 100_000) throw new AtlasError('AI_TOOL_ARGUMENT_INVALID', 'document proposal fields are invalid or too large', 400);
        const sources = input.matterId ? [source(await this.service.getObject(workspaceId, input.matterId))] : [];
        return { data: { proposed: true, actionType: 'create_document', input }, sources, actionProposal: { actionType: 'create_document', input } };
      }
      case 'propose_draft_email': {
        const input = { subject: required(args.subject, 'subject').trim(), recipients: args.recipients, matterId: args.matterId ?? null, body: required(args.body, 'body') };
        if (!input.subject || input.subject.length > 240 || !Array.isArray(input.recipients) || input.recipients.length < 1 || input.recipients.length > 25 || input.recipients.some((value) => typeof value !== 'string' || !value.includes('@')) || input.body.length > 100_000) throw new AtlasError('AI_TOOL_ARGUMENT_INVALID', 'email draft fields are invalid or too large', 400);
        const sources = input.matterId ? [source(await this.service.getObject(workspaceId, input.matterId))] : [];
        return { data: { proposed: true, actionType: 'draft_email', input }, sources, actionProposal: { actionType: 'draft_email', input } };
      }
      default: throw new AtlasError('AI_TOOL_NOT_ALLOWED', 'Requested AI tool is not allowed', 400, { tool: name });
    }
  }
}

export class AtlasAssistant {
  constructor(model, tools, options = {}) {
    this.model = model;
    this.tools = tools;
    this.maxToolRounds = options.maxToolRounds ?? 4;
    this.maxToolCalls = options.maxToolCalls ?? 8;
    this.maxPromptCharacters = options.maxPromptCharacters ?? 8_000;
    this.repository = options.repository ?? null;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.contentCipher = options.contentCipher ?? { encrypt: (value) => value, decrypt: (value) => value };
  }

  async executeQuery({ workspaceId, userId, prompt, history = [] }) {
    if (!this.model) throw new AtlasError('AI_NOT_CONFIGURED', 'Atlas AI provider is not configured', 503);
    const text = required(prompt, 'prompt').trim();
    if (text.length > this.maxPromptCharacters) throw new AtlasError('AI_PROMPT_TOO_LARGE', 'AI prompt is too large', 413);
    const messages = [{ role: 'developer', content: ATLAS_ASSISTANT_INSTRUCTIONS }, ...history.map((message) => ({ role: message.role, content: message.content })), { role: 'user', content: text }];
    const sources = new Map();
    const webSources = new Map();
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let state;
    let provider;
    let model;
    let executed = 0;
    const actionProposals = [];
    for (let round = 0; round <= this.maxToolRounds; round += 1) {
      const response = await this.model.complete({ messages, tools: this.tools.definitions(), context: { workspaceId, userId }, state });
      state = response?.state;
      provider = response?.provider ?? provider;
      model = response?.model ?? model;
      usage.inputTokens += response?.usage?.inputTokens ?? 0;
      usage.outputTokens += response?.usage?.outputTokens ?? 0;
      usage.totalTokens += response?.usage?.totalTokens ?? 0;
      if (typeof response?.text === 'string' && response.text.trim() && !response.toolCalls?.length) {
        return { answer: response.text.trim(), sources: [...sources.values()], webSources: [...webSources.values()], actionProposals, toolCalls: executed, usage, ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
      }
      if (!Array.isArray(response?.toolCalls) || !response.toolCalls.length) {
        throw new AtlasError('AI_INVALID_RESPONSE', 'Atlas AI provider returned an invalid response', 502);
      }
      if (round === this.maxToolRounds) throw new AtlasError('AI_TOOL_LIMIT_EXCEEDED', 'Atlas AI exceeded the tool-call limit', 502);
      messages.push({ role: 'assistant', toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        if (executed >= this.maxToolCalls) throw new AtlasError('AI_TOOL_LIMIT_EXCEEDED', 'Atlas AI exceeded the tool-call limit', 502);
        const result = await this.tools.execute(call.name, workspaceId, call.arguments ?? {});
        if (result.actionProposal) actionProposals.push(result.actionProposal);
        executed += 1;
        for (const item of result.sources) sources.set(item.sourceId??item.observationId??item.objectId, item);
        for (const item of result.webSources??[]) webSources.set(item.url,item);
        usage.inputTokens += result.usage?.inputTokens ?? 0;
        usage.outputTokens += result.usage?.outputTokens ?? 0;
        usage.totalTokens += result.usage?.totalTokens ?? 0;
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result.data });
      }
    }
    throw new AtlasError('AI_INVALID_RESPONSE', 'Atlas AI did not produce an answer', 502);
  }

  async query(input) {
    const runId = createId('air');
    const auditPrompt = String(input.prompt ?? '').slice(0, this.maxPromptCharacters);
    const conversationId = input.conversationId ?? createId('aic');
    try {
      let history = [];
      if (this.repository) {
        if (input.conversationId) await this.repository.getAiConversation(input.workspaceId, input.userId, conversationId);
        else await this.repository.createAiConversation({ id: conversationId, workspaceId: input.workspaceId, actorId: input.userId, title: this.contentCipher.encrypt(auditPrompt.slice(0, 120) || 'New conversation', `conversation:${conversationId}:title`), createdAt: this.clock() });
        history = (await this.repository.listAiMessages(input.workspaceId, input.userId, conversationId))
          .map((message) => ({ ...message, content: this.contentCipher.decrypt(message.content, `message:${message.id}:content`) }));
        const userMessageId = createId('aim');
        await this.repository.createAiMessage({ id: userMessageId, conversationId, workspaceId: input.workspaceId, actorId: input.userId, runId: null, role: 'user', content: this.contentCipher.encrypt(auditPrompt, `message:${userMessageId}:content`), sources: [], createdAt: this.clock() });
      }
      const result = await this.executeQuery({ ...input, history });
      const auditSources=[...result.sources,...result.webSources.map(item=>({sourceType:'web',url:item.url,title:item.title}))];
      if (this.repository) await this.repository.createAiRun({
        id: runId, workspaceId: input.workspaceId, actorId: input.userId, status: 'completed',
        prompt: this.contentCipher.encrypt(auditPrompt, `run:${runId}:prompt`), answer: this.contentCipher.encrypt(result.answer, `run:${runId}:answer`), provider: result.provider ?? null, model: result.model ?? null,
        sources: auditSources, toolCalls: result.toolCalls, usage: result.usage,
        errorCode: null, createdAt: this.clock()
      });
      if (this.repository) result.actionProposals = await Promise.all(result.actionProposals.map((proposal) => this.repository.createAiActionProposal({
        id: createId('aap'), workspaceId: input.workspaceId, runId, intelligenceJobId: null, originType: 'chat', proposedBy: input.userId,
        actionType: proposal.actionType, input: proposal.input, status: 'pending', version: 1,
        decidedBy: null, resultObjectId: null, createdAt: this.clock(), decidedAt: null
      })));
      if (this.repository) {
        const assistantMessageId = createId('aim');
        await this.repository.createAiMessage({ id: assistantMessageId, conversationId, workspaceId: input.workspaceId, actorId: input.userId, runId, role: 'assistant', content: this.contentCipher.encrypt(result.answer, `message:${assistantMessageId}:content`), sources: auditSources, createdAt: this.clock() });
      }
      return { ...result, runId, conversationId };
    } catch (error) {
      if (this.repository) {
        try {
          await this.repository.createAiRun({
            id: runId, workspaceId: input.workspaceId, actorId: input.userId, status: 'failed',
            prompt: this.contentCipher.encrypt(auditPrompt, `run:${runId}:prompt`), answer: null, provider: error.details?.provider ?? null, model: null,
            sources: [], toolCalls: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            errorCode: error instanceof AtlasError ? error.code : 'INTERNAL_ERROR', createdAt: this.clock()
          });
        } catch { /* Preserve the original execution failure. */ }
      }
      throw error;
    }
  }

  async listRuns(workspaceId, limit = 50) {
    if (!this.repository) throw new AtlasError('AI_AUDIT_NOT_CONFIGURED', 'AI audit repository is not configured', 503);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AtlasError('VALIDATION_ERROR', 'limit must be between 1 and 100', 400);
    return (await this.repository.listAiRuns(workspaceId, limit)).map((run) => ({
      ...run,
      prompt: this.contentCipher.decrypt(run.prompt, `run:${run.id}:prompt`),
      answer: this.contentCipher.decrypt(run.answer, `run:${run.id}:answer`)
    }));
  }
  async listConversations(workspaceId,userId) { if(!this.repository) throw new AtlasError('AI_AUDIT_NOT_CONFIGURED','AI repository is not configured',503); return (await this.repository.listAiConversations(workspaceId,userId)).map((conversation) => ({ ...conversation, title: this.contentCipher.decrypt(conversation.title, `conversation:${conversation.id}:title`) })); }
  async listMessages(workspaceId,userId,conversationId) { if(!this.repository) throw new AtlasError('AI_AUDIT_NOT_CONFIGURED','AI repository is not configured',503); return (await this.repository.listAiMessages(workspaceId,userId,conversationId)).map((message) => ({ ...message, content: this.contentCipher.decrypt(message.content, `message:${message.id}:content`) })); }
}
