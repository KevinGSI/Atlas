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
      { name: 'list_daily_priorities', description: 'Derive priority matters from health, deadlines, and incomplete matter state.', inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } } }
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
  }

  async executeQuery({ workspaceId, userId, prompt }) {
    if (!this.model) throw new AtlasError('AI_NOT_CONFIGURED', 'Atlas AI provider is not configured', 503);
    const text = required(prompt, 'prompt').trim();
    if (text.length > this.maxPromptCharacters) throw new AtlasError('AI_PROMPT_TOO_LARGE', 'AI prompt is too large', 413);
    const messages = [{ role: 'user', content: text }];
    const sources = new Map();
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let state;
    let provider;
    let model;
    let executed = 0;
    for (let round = 0; round <= this.maxToolRounds; round += 1) {
      const response = await this.model.complete({ messages, tools: this.tools.definitions(), context: { workspaceId, userId }, state });
      state = response?.state;
      provider = response?.provider ?? provider;
      model = response?.model ?? model;
      usage.inputTokens += response?.usage?.inputTokens ?? 0;
      usage.outputTokens += response?.usage?.outputTokens ?? 0;
      usage.totalTokens += response?.usage?.totalTokens ?? 0;
      if (typeof response?.text === 'string' && response.text.trim() && !response.toolCalls?.length) {
        return { answer: response.text.trim(), sources: [...sources.values()], toolCalls: executed, usage, ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
      }
      if (!Array.isArray(response?.toolCalls) || !response.toolCalls.length) {
        throw new AtlasError('AI_INVALID_RESPONSE', 'Atlas AI provider returned an invalid response', 502);
      }
      if (round === this.maxToolRounds) throw new AtlasError('AI_TOOL_LIMIT_EXCEEDED', 'Atlas AI exceeded the tool-call limit', 502);
      messages.push({ role: 'assistant', toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        if (executed >= this.maxToolCalls) throw new AtlasError('AI_TOOL_LIMIT_EXCEEDED', 'Atlas AI exceeded the tool-call limit', 502);
        const result = await this.tools.execute(call.name, workspaceId, call.arguments ?? {});
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
    try {
      const result = await this.executeQuery(input);
      if (this.repository) await this.repository.createAiRun({
        id: runId, workspaceId: input.workspaceId, actorId: input.userId, status: 'completed',
        prompt: auditPrompt, answer: result.answer, provider: result.provider ?? null, model: result.model ?? null,
        sources: result.sources, toolCalls: result.toolCalls, usage: result.usage,
        errorCode: null, createdAt: this.clock()
      });
      return { ...result, runId };
    } catch (error) {
      if (this.repository) {
        try {
          await this.repository.createAiRun({
            id: runId, workspaceId: input.workspaceId, actorId: input.userId, status: 'failed',
            prompt: auditPrompt, answer: null, provider: error.details?.provider ?? null, model: null,
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
    return this.repository.listAiRuns(workspaceId, limit);
  }
}
