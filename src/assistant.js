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

export class AtlasToolRegistry {
  constructor(service) { this.service = service; }

  definitions() {
    return [
      { name: 'search_objects', description: 'Search authorized workspace objects by title, type, dimension, or state text.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] } },
      { name: 'list_recent_matters', description: 'List the most recently opened matters in the authorized workspace.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } } },
      { name: 'get_object', description: 'Retrieve one object from the authorized workspace by object ID.', inputSchema: { type: 'object', properties: { objectId: { type: 'string' } }, required: ['objectId'] } },
      { name: 'get_matter_health', description: 'Get explainable health for one matter in the authorized workspace.', inputSchema: { type: 'object', properties: { matterId: { type: 'string' } }, required: ['matterId'] } },
      { name: 'list_daily_priorities', description: 'Derive priority matters from health, deadlines, and incomplete matter state.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } } },
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
      case 'list_daily_priorities': {
        const limit = boundedLimit(args.limit, 5);
        const matters = await this.service.listObjects(workspaceId, { dimension: 'matter' });
        const priorities = await Promise.all(matters.map(async (matter) => {
          const health = await this.service.matterHealth(workspaceId, matter.id);
          const deadline = matter.state.nextDeadline ?? null;
          const overdue = deadline ? new Date(deadline).getTime() < new Date(this.service.clock()).getTime() : false;
          return { matterId: matter.id, title: matter.title, health, deadline, overdue };
        }));
        priorities.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.health.score - b.health.score || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
        const selected = priorities.slice(0, limit);
        const selectedIds = new Set(selected.map((item) => item.matterId));
        return { data: selected, sources: matters.filter((matter) => selectedIds.has(matter.id)).map(source) };
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
    const messages = [...history.map((message) => ({ role: message.role, content: message.content })), { role: 'user', content: text }];
    const sources = new Map();
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
        return { answer: response.text.trim(), sources: [...sources.values()], actionProposals, toolCalls: executed, usage, ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
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
        for (const item of result.sources) sources.set(item.objectId, item);
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
      if (this.repository) await this.repository.createAiRun({
        id: runId, workspaceId: input.workspaceId, actorId: input.userId, status: 'completed',
        prompt: this.contentCipher.encrypt(auditPrompt, `run:${runId}:prompt`), answer: this.contentCipher.encrypt(result.answer, `run:${runId}:answer`), provider: result.provider ?? null, model: result.model ?? null,
        sources: result.sources, toolCalls: result.toolCalls, usage: result.usage,
        errorCode: null, createdAt: this.clock()
      });
      if (this.repository) result.actionProposals = await Promise.all(result.actionProposals.map((proposal) => this.repository.createAiActionProposal({
        id: createId('aap'), workspaceId: input.workspaceId, runId, proposedBy: input.userId,
        actionType: proposal.actionType, input: proposal.input, status: 'pending', version: 1,
        decidedBy: null, resultObjectId: null, createdAt: this.clock(), decidedAt: null
      })));
      if (this.repository) {
        const assistantMessageId = createId('aim');
        await this.repository.createAiMessage({ id: assistantMessageId, conversationId, workspaceId: input.workspaceId, actorId: input.userId, runId, role: 'assistant', content: this.contentCipher.encrypt(result.answer, `message:${assistantMessageId}:content`), sources: result.sources, createdAt: this.clock() });
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
