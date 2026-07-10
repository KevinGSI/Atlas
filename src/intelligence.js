import { AtlasError } from './errors.js';

export class IntelligenceProviderRegistry {
  #providers = new Map();
  register(name, provider) {
    if (!name || typeof provider?.analyze !== 'function' || typeof provider?.capabilities !== 'function') throw new AtlasError('INTELLIGENCE_PROVIDER_INVALID', 'Intelligence providers must implement analyze and capabilities', 500);
    if (this.#providers.has(name)) throw new AtlasError('INTELLIGENCE_PROVIDER_EXISTS', 'Intelligence provider is already registered', 409, { provider: name });
    this.#providers.set(name, provider);
    return this;
  }
  resolve(name) { const provider=this.#providers.get(name); if(!provider) throw new AtlasError('INTELLIGENCE_PROVIDER_NOT_FOUND','Intelligence provider is not registered',503,{provider:name}); return provider; }
  list() { return [...this.#providers.entries()].map(([name, provider]) => ({ name, capabilities: provider.capabilities() })); }
}

export class AtlasIntelligenceRuntime {
  constructor(repository, providers, options = {}) {
    this.repository = repository;
    this.providers = providers;
    this.providerName = options.providerName ?? null;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }
  async processNext() {
    if (!this.providerName) return null;
    const job = await this.repository.claimIntelligenceJob(this.clock());
    if (!job) return null;
    try {
      const provider = this.providers.resolve(this.providerName);
      const result = await provider.analyze({ event: job.payload, context: { workspaceId: job.workspaceId, objectId: job.objectId, eventId: job.eventId } });
      return this.repository.completeIntelligenceJob(job.id, result, this.providerName, this.clock());
    } catch (error) {
      await this.repository.failIntelligenceJob(job.id, error instanceof AtlasError ? error.code : 'INTELLIGENCE_ANALYSIS_FAILED', this.clock(), this.maxAttempts);
      throw error;
    }
  }
}
