import { createAtlasServer } from './http.js';
import { InMemoryRepository } from './repository.js';
import { AtlasService } from './service.js';
import { loadConfig } from './config.js';
import { createPostgresRuntime } from './runtime.js';
import { IdentityService, TokenService } from './identity.js';
import { AtlasAssistant, AtlasToolRegistry } from './assistant.js';
import { createAiProviderRegistry } from './ai-providers.js';

function memoryRuntime() {
  return { repository: new InMemoryRepository(), ready: async () => true, close: async () => {} };
}

export async function startAtlas(env = process.env, dependencies = {}) {
  const config = loadConfig(env);
  const runtime = dependencies.runtime ?? (config.databaseUrl
    ? await createPostgresRuntime({ ...env, DATABASE_POOL_SIZE: String(config.databasePoolSize) })
    : memoryRuntime());
  const service = new AtlasService(runtime.repository);
  const identity = new IdentityService(runtime.repository, new TokenService(config.tokenSecret, config.accessTokenTtlSeconds), undefined, {
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
    passwordResetTtlSeconds: config.passwordResetTtlSeconds,
    loginFailureThreshold: config.loginFailureThreshold,
    loginFailureWindowSeconds: config.loginFailureWindowSeconds,
    loginLockSeconds: config.loginLockSeconds,
    deliverPasswordReset: dependencies.deliverPasswordReset
  });
  const providers = createAiProviderRegistry(config, dependencies);
  const assistant = new AtlasAssistant(dependencies.aiModel ?? providers.resolve(config.aiProvider), new AtlasToolRegistry(service));
  const server = createAtlasServer(service, { config, ready: runtime.ready, identity, assistant });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  let stopped = false;
  return {
    config,
    server,
    address: server.address(),
    async stop() {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await runtime.close();
    }
  };
}
