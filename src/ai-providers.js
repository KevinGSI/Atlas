import { AtlasError, required } from './errors.js';

export class AiProviderRegistry {
  #providers = new Map();
  register(name, provider) {
    if (!name || typeof provider?.complete !== 'function' || typeof provider?.capabilities !== 'function') {
      throw new AtlasError('AI_PROVIDER_INVALID', 'AI provider must implement complete and capabilities', 500);
    }
    if (this.#providers.has(name)) throw new AtlasError('AI_PROVIDER_EXISTS', 'AI provider is already registered', 409, { provider: name });
    this.#providers.set(name, provider);
    return this;
  }
  resolve(name) {
    if (!name) return null;
    const provider = this.#providers.get(name);
    if (!provider) throw new AtlasError('AI_PROVIDER_NOT_FOUND', 'Configured AI provider is not registered', 503, { provider: name });
    return provider;
  }
  list() {
    return [...this.#providers.entries()].map(([name, provider]) => ({ name, capabilities: provider.capabilities() }));
  }
}

function openAiInput(messages, state) {
  if (!state?.inputItems) {
    return messages
      .filter((message) => ['developer', 'system', 'user'].includes(message.role) || (message.role === 'assistant' && typeof message.content === 'string'))
      .map((message) => ({ role: message.role, content: message.content }));
  }
  const lastAssistant = messages.map((message) => message.role).lastIndexOf('assistant');
  const toolOutputs = messages.slice(lastAssistant + 1).filter((message) => message.role === 'tool').map((message) => ({
    type: 'function_call_output', call_id: message.toolCallId, output: JSON.stringify(message.content)
  }));
  return [...state.inputItems, ...toolOutputs];
}

function openAiTools(tools) {
  return tools.map((tool) => ({
    type: 'function', name: tool.name, description: tool.description,
    parameters: { ...tool.inputSchema, additionalProperties: false }, strict: false
  }));
}

function outputText(output) {
  return output.filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text).join('\n').trim();
}

export class OpenAiResponsesProvider {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.transport = options.transport ?? fetch;
    if (!this.apiKey) throw new AtlasError('AI_PROVIDER_CONFIGURATION_ERROR', 'OpenAI API key is required', 500);
    if (!this.model) throw new AtlasError('AI_PROVIDER_CONFIGURATION_ERROR', 'OpenAI model is required', 500);
  }
  capabilities() {
    return { toolCalling: true, streaming: false, structuredOutput: false, providerState: true };
  }
  async complete({ messages, tools, state }) {
    let response;
    const input = openAiInput(messages, state);
    try {
      response = await this.transport(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input,
          tools: openAiTools(tools),
          store: false
        })
      });
    } catch {
      throw new AtlasError('AI_PROVIDER_UNAVAILABLE', 'AI provider is unavailable', 503, { provider: 'openai' });
    }
    if (!response.ok) {
      const requestId = response.headers?.get?.('x-request-id') ?? undefined;
      const details = { provider: 'openai', status: response.status, ...(requestId ? { requestId } : {}) };
      if (response.status === 401 || response.status === 403) throw new AtlasError('AI_PROVIDER_AUTHENTICATION_FAILED', 'AI provider authentication failed', 502, details);
      if (response.status === 429) throw new AtlasError('AI_PROVIDER_RATE_LIMITED', 'AI provider rate limit exceeded', 503, details);
      throw new AtlasError('AI_PROVIDER_ERROR', 'AI provider request failed', 502, details);
    }
    let body;
    try { body = await response.json(); } catch { throw new AtlasError('AI_PROVIDER_INVALID_RESPONSE', 'AI provider returned invalid JSON', 502, { provider: 'openai' }); }
    const output = Array.isArray(body.output) ? body.output : [];
    const toolCalls = output.filter((item) => item.type === 'function_call').map((item) => {
      let args;
      try { args = JSON.parse(item.arguments); } catch { throw new AtlasError('AI_PROVIDER_INVALID_RESPONSE', 'AI provider returned invalid tool arguments', 502, { provider: 'openai' }); }
      return { id: item.call_id, name: item.name, arguments: args };
    });
    const text = outputText(output);
    return {
      ...(text ? { text } : {}), ...(toolCalls.length ? { toolCalls } : {}),
      state: { inputItems: [...input, ...output] },
      usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, totalTokens: body.usage?.total_tokens ?? 0 },
      provider: 'openai', model: body.model ?? this.model
    };
  }
}

function webResearchUsage(body = {}) {
  return {
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    totalTokens: body.usage?.total_tokens ?? 0
  };
}

function normalizedWebSource(value) {
  const url = String(value?.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return { url, title: String(value?.title ?? url).trim().slice(0, 500) };
}

function collectWebSources(output) {
  const sources = new Map();
  for (const item of output) {
    if (item.type === 'message') {
      for (const content of item.content ?? []) {
        for (const annotation of content.annotations ?? []) {
          if (annotation.type !== 'url_citation') continue;
          const source = normalizedWebSource(annotation);
          if (source) sources.set(source.url, source);
        }
      }
    }
    if (item.type === 'web_search_call') {
      for (const value of item.action?.sources ?? []) {
        const source = normalizedWebSource(value);
        if (source) sources.set(source.url, source);
      }
    }
  }
  return [...sources.values()];
}

export class OpenAiWebResearchProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.transport = options.transport ?? fetch;
    this.searchContextSize = options.searchContextSize ?? 'medium';
    if (!this.apiKey) throw new AtlasError('WEB_RESEARCH_CONFIGURATION_ERROR', 'OpenAI API key is required for web research', 500);
    if (!this.model) throw new AtlasError('WEB_RESEARCH_CONFIGURATION_ERROR', 'OpenAI model is required for web research', 500);
    if (!['low', 'medium', 'high'].includes(this.searchContextSize)) throw new AtlasError('WEB_RESEARCH_CONFIGURATION_ERROR', 'Web search context size must be low, medium, or high', 500);
  }
  capabilities() {
    return { liveWeb: true, citations: true, isolatedQuery: true };
  }
  async search(input = {}) {
    const query = required(input.query, 'query').trim();
    if (query.length < 3 || query.length > 1000) throw new AtlasError('AI_WEB_QUERY_INVALID', 'Public web query must contain 3 to 1000 characters', 400);
    let response;
    try {
      response = await this.transport(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: [
            { role: 'developer', content: 'Research only public internet sources. Return a concise, factual answer supported by clickable citations. The query has already passed Atlas confidentiality checks. Do not request or infer private law-firm data.' },
            { role: 'user', content: query }
          ],
          tools: [{ type: 'web_search', search_context_size: this.searchContextSize, external_web_access: true }],
          tool_choice: 'required',
          include: ['web_search_call.action.sources'],
          store: false
        })
      });
    } catch {
      throw new AtlasError('WEB_RESEARCH_UNAVAILABLE', 'Public web research is unavailable', 503, { provider: 'openai' });
    }
    if (!response.ok) {
      const requestId = response.headers?.get?.('x-request-id') ?? undefined;
      const details = { provider: 'openai', status: response.status, ...(requestId ? { requestId } : {}) };
      if ([401, 403].includes(response.status)) throw new AtlasError('WEB_RESEARCH_AUTHENTICATION_FAILED', 'Web research provider authentication failed', 502, details);
      if (response.status === 429) throw new AtlasError('WEB_RESEARCH_RATE_LIMITED', 'Web research provider rate limit exceeded', 503, details);
      throw new AtlasError('WEB_RESEARCH_ERROR', 'Web research request failed', 502, details);
    }
    let body;
    try { body = await response.json(); } catch { throw new AtlasError('WEB_RESEARCH_INVALID_RESPONSE', 'Web research provider returned invalid JSON', 502, { provider: 'openai' }); }
    const output = Array.isArray(body.output) ? body.output : [];
    const answer = outputText(output);
    const sources = collectWebSources(output);
    if (!answer || !sources.length) throw new AtlasError('WEB_RESEARCH_INVALID_RESPONSE', 'Web research must return an answer with citations', 502, { provider: 'openai' });
    return { answer, sources, provider: 'openai', model: body.model ?? this.model, usage: webResearchUsage(body) };
  }
}

export function createAiProviderRegistry(config, dependencies = {}) {
  const registry = new AiProviderRegistry();
  for (const [name, provider] of Object.entries(dependencies.aiProviders ?? {})) registry.register(name, provider);
  if (config.openAiApiKey && !dependencies.aiProviders?.openai) {
    registry.register('openai', new OpenAiResponsesProvider({
      apiKey: config.openAiApiKey, model: config.aiModel, baseUrl: config.openAiBaseUrl, transport: dependencies.aiTransport
    }));
  }
  return registry;
}

export function createWebResearchProvider(config, dependencies = {}) {
  if (!config.aiWebSearchEnabled) return null;
  if (dependencies.webResearchProvider) return dependencies.webResearchProvider;
  if (config.openAiApiKey) {
    return new OpenAiWebResearchProvider({
      apiKey: config.openAiApiKey,
      model: config.aiModel,
      baseUrl: config.openAiBaseUrl,
      transport: dependencies.webResearchTransport ?? dependencies.aiTransport,
      searchContextSize: config.aiWebSearchContextSize
    });
  }
  throw new AtlasError('WEB_RESEARCH_CONFIGURATION_ERROR', 'AI web search is enabled but no interchangeable web research provider is configured', 500);
}
