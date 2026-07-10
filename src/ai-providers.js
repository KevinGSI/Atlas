import { AtlasError } from './errors.js';

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
  if (!state?.output) {
    return messages.filter((message) => message.role === 'user' || (message.role === 'assistant' && typeof message.content === 'string')).map((message) => ({ role: message.role, content: message.content }));
  }
  const lastAssistant = messages.map((message) => message.role).lastIndexOf('assistant');
  const toolOutputs = messages.slice(lastAssistant + 1).filter((message) => message.role === 'tool').map((message) => ({
    type: 'function_call_output', call_id: message.toolCallId, output: JSON.stringify(message.content)
  }));
  return [...state.output, ...toolOutputs];
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
    try {
      response = await this.transport(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: openAiInput(messages, state),
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
      state: { output },
      usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, totalTokens: body.usage?.total_tokens ?? 0 },
      provider: 'openai', model: body.model ?? this.model
    };
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
