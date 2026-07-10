import { createAtlasServer } from './http.js';
import { InMemoryRepository } from './repository.js';
import { AtlasService } from './service.js';
import { loadConfig } from './config.js';
import { createPostgresRuntime } from './runtime.js';
import { IdentityService, TokenService } from './identity.js';
import { AtlasAssistant, AtlasToolRegistry } from './assistant.js';
import { createAiProviderRegistry } from './ai-providers.js';
import { AesGcmContentCipher, createContentCipher } from './content-security.js';
import { AtlasIntelligenceRuntime, IntelligenceProviderRegistry, StructuredModelIntelligenceProvider } from './intelligence.js';
import { IntelligenceProjectionService } from './intelligence-projection.js';
import { AtlasIngestionService } from './ingestion.js';
import { AtlasResolver } from './resolution.js';
import { CmsCoexistenceService, CmsConnectorRegistry, InMemoryCredentialVault, RepositoryCredentialVault, runCmsSyncScheduler } from './cms-connectors.js';
import { ClioManageConnector, MyCaseOpenApiConnector } from './cms-provider-adapters.js';

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
  const selectedModel=dependencies.aiModel ?? providers.resolve(config.aiProvider);
  const intelligenceProviders = new IntelligenceProviderRegistry();
  for (const [name, provider] of Object.entries(dependencies.intelligenceProviders ?? {})) intelligenceProviders.register(name, provider);
  if(selectedModel&&!dependencies.intelligenceProviders?.['configured-model'])intelligenceProviders.register('configured-model',new StructuredModelIntelligenceProvider(selectedModel));
  const intelligence = new AtlasIntelligenceRuntime(runtime.repository, intelligenceProviders, { providerName: config.intelligenceProvider, projector: new IntelligenceProjectionService(), resolver: new AtlasResolver(runtime.repository) });
  const ingestion = new AtlasIngestionService(runtime.repository);
  const cmsConnectors=new CmsConnectorRegistry();
  for(const [name,connector] of Object.entries(dependencies.cmsConnectors??{}))cmsConnectors.register(name,connector);
  if(config.clioClientId&&!dependencies.cmsConnectors?.clio)cmsConnectors.register('clio',new ClioManageConnector({clientId:config.clioClientId,clientSecret:config.clioClientSecret,region:config.clioRegion,transport:dependencies.cmsTransport}));
  if(config.myCaseClientId&&!dependencies.cmsConnectors?.mycase)cmsConnectors.register('mycase',new MyCaseOpenApiConnector({clientId:config.myCaseClientId,clientSecret:config.myCaseClientSecret,authorizeEndpoint:config.myCaseAuthorizeEndpoint,tokenEndpoint:config.myCaseTokenEndpoint,apiBase:config.myCaseApiBase,transport:dependencies.cmsTransport,resources:dependencies.myCaseResources??[]}));
  if(config.production&&(config.clioClientId||config.myCaseClientId)&&!dependencies.credentialVault&&!config.cmsCredentialEncryptionKey)throw new Error('CMS_CREDENTIAL_ENCRYPTION_KEY or a managed credentialVault is required for CMS connections in production');
  const credentialVault=dependencies.credentialVault??(config.cmsCredentialEncryptionKey?new RepositoryCredentialVault(runtime.repository,new AesGcmContentCipher({keys:{[config.cmsCredentialEncryptionKeyId]:config.cmsCredentialEncryptionKey},activeKeyId:config.cmsCredentialEncryptionKeyId})):new InMemoryCredentialVault());
  const cms=new CmsCoexistenceService(runtime.repository,cmsConnectors,credentialVault);
  const assistant = new AtlasAssistant(selectedModel, new AtlasToolRegistry(service), {
    repository: runtime.repository,
    contentCipher: createContentCipher(config, dependencies)
  });
  const server = createAtlasServer(service, { config, ready: runtime.ready, identity, assistant, ingestion, cms });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  const cmsController=new AbortController();
  const cmsScheduler=config.cmsSyncEnabled?runCmsSyncScheduler(cms,{signal:cmsController.signal,intervalMs:config.cmsSyncIntervalMs}):Promise.resolve();
  let stopped = false;
  return {
    config,
    server,
    address: server.address(),
    intelligence,
    cms,
    async stop() {
      if (stopped) return;
      stopped = true;
      cmsController.abort();
      await cmsScheduler;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await runtime.close();
    }
  };
}
