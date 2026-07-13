import { createAtlasServer } from './http.js';
import { InMemoryRepository } from './repository.js';
import { AtlasService } from './service.js';
import { loadConfig } from './config.js';
import { createPostgresRuntime } from './runtime.js';
import { IdentityService, TokenService } from './identity.js';
import { AtlasAssistant, AtlasToolRegistry } from './assistant.js';
import { createAiProviderRegistry, createWebResearchProvider } from './ai-providers.js';
import { AesGcmContentCipher, createContentCipher } from './content-security.js';
import { AtlasIntelligenceRuntime, IntelligenceProviderRegistry, StructuredModelIntelligenceProvider } from './intelligence.js';
import { IntelligenceProjectionService } from './intelligence-projection.js';
import { AtlasIngestionService } from './ingestion.js';
import { AtlasResolver } from './resolution.js';
import { CmsCoexistenceService, CmsConnectorRegistry, InMemoryCredentialVault, RepositoryCredentialVault, runCmsSyncScheduler } from './cms-connectors.js';
import { ClioManageConnector, MyCaseOpenApiConnector } from './cms-provider-adapters.js';
import { GoogleWorkspaceConnector, Microsoft365Connector } from './mail-provider-adapters.js';
import { SituationalPlaybookEngine, SituationalSweepService, runSituationalSweepScheduler } from './situational-awareness.js';
import { IngestionWebhookVerifier } from './webhook-security.js';
import { SchedulerLeaseCoordinator } from './scheduler-leases.js';
import { CanonicalEventConsumerRegistry, CanonicalEventDispatcher, DigitalTwinImpactConsumer, runCanonicalEventDispatcher } from './canonical-events.js';
import { AccountingService, ProviderRegistry } from './accounting.js';
import { EvmTokenPaymentProvider } from './crypto-provider-adapters.js';
import { StructuredModelVoiceIntentProvider, VoiceAssistantService } from './voice-assistant.js';
import { TwilioVoiceAdapter } from './telephony-provider-adapters.js';
import { CmsExportMigrationService } from './migration-import.js';
import { SmsAssistantService } from './sms-assistant.js';
import { FirmExportService } from './firm-export.js';
import { StripeCheckoutProvider } from './payment-provider-adapters.js';
import { AtlasFileService, FileSystemBlobStore, InMemoryBlobStore } from './file-storage.js';

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
    ,mfaEncryptionSecret:config.mfaEncryptionKey
  });
  const providers = createAiProviderRegistry(config, dependencies);
  const selectedModel=dependencies.aiModel ?? providers.resolve(config.aiProvider);
  const webResearch=createWebResearchProvider(config,dependencies);
  const intelligenceProviders = new IntelligenceProviderRegistry();
  for (const [name, provider] of Object.entries(dependencies.intelligenceProviders ?? {})) intelligenceProviders.register(name, provider);
  if(selectedModel&&!dependencies.intelligenceProviders?.['configured-model'])intelligenceProviders.register('configured-model',new StructuredModelIntelligenceProvider(selectedModel));
  const intelligence = new AtlasIntelligenceRuntime(runtime.repository, intelligenceProviders, { providerName: config.intelligenceProvider, projector: new IntelligenceProjectionService(), resolver: new AtlasResolver(runtime.repository), playbooks:new SituationalPlaybookEngine(dependencies.nativeCapabilities) });
  const ingestion = new AtlasIngestionService(runtime.repository);
  const blobStore=dependencies.blobStore??(config.documentStoragePath?new FileSystemBlobStore(config.documentStoragePath):new InMemoryBlobStore());
  if(config.production&&!dependencies.blobStore&&!config.documentStoragePath)throw new Error('DOCUMENT_STORAGE_PATH or a managed blobStore is required in production');
  const files=new AtlasFileService(service,ingestion,blobStore,{maxBytes:config.documentMaxBytes});
  const firmExport = new FirmExportService(runtime.repository);
  const webhooks = new IngestionWebhookVerifier(config.ingestionWebhookSecrets);
  const cmsConnectors=new CmsConnectorRegistry();
  for(const [name,connector] of Object.entries(dependencies.cmsConnectors??{}))cmsConnectors.register(name,connector);
  if(config.clioClientId&&!dependencies.cmsConnectors?.clio)cmsConnectors.register('clio',new ClioManageConnector({clientId:config.clioClientId,clientSecret:config.clioClientSecret,region:config.clioRegion,transport:dependencies.cmsTransport}));
  if(config.myCaseClientId&&!dependencies.cmsConnectors?.mycase)cmsConnectors.register('mycase',new MyCaseOpenApiConnector({clientId:config.myCaseClientId,clientSecret:config.myCaseClientSecret,authorizeEndpoint:config.myCaseAuthorizeEndpoint,tokenEndpoint:config.myCaseTokenEndpoint,apiBase:config.myCaseApiBase,transport:dependencies.cmsTransport,resources:dependencies.myCaseResources??[]}));
  if(config.googleWorkspaceClientId&&!dependencies.cmsConnectors?.google)cmsConnectors.register('google',new GoogleWorkspaceConnector({clientId:config.googleWorkspaceClientId,clientSecret:config.googleWorkspaceClientSecret,transport:dependencies.mailTransport}));
  if(config.microsoft365ClientId&&!dependencies.cmsConnectors?.microsoft)cmsConnectors.register('microsoft',new Microsoft365Connector({clientId:config.microsoft365ClientId,clientSecret:config.microsoft365ClientSecret,tenant:config.microsoft365Tenant,transport:dependencies.mailTransport}));
  const externalConnectorsConfigured=config.clioClientId||config.myCaseClientId||config.googleWorkspaceClientId||config.microsoft365ClientId;
  if(config.production&&externalConnectorsConfigured&&!dependencies.credentialVault&&!config.cmsCredentialEncryptionKey)throw new Error('CMS_CREDENTIAL_ENCRYPTION_KEY or a managed credentialVault is required for external connections in production');
  const credentialVault=dependencies.credentialVault??(config.cmsCredentialEncryptionKey?new RepositoryCredentialVault(runtime.repository,new AesGcmContentCipher({keys:{[config.cmsCredentialEncryptionKeyId]:config.cmsCredentialEncryptionKey},activeKeyId:config.cmsCredentialEncryptionKeyId})):new InMemoryCredentialVault());
  const cms=new CmsCoexistenceService(runtime.repository,cmsConnectors,credentialVault);
  const migration=new CmsExportMigrationService(service);
  const paymentProviders=new ProviderRegistry('Payment');
  const bankProviders=new ProviderRegistry('Bank connection');
  const financeProviders=new ProviderRegistry('Legal financing');
  const cryptoProviders=new ProviderRegistry('Crypto payment');
  for(const [name,provider] of Object.entries(dependencies.paymentProviders??{}))paymentProviders.register(name,provider);
  if(config.stripeSecretKey&&!dependencies.paymentProviders?.stripe)paymentProviders.register('stripe',new StripeCheckoutProvider({secretKey:config.stripeSecretKey,publishableKey:config.stripePublishableKey,webhookSecret:config.stripeWebhookSecret,checkoutSigningSecret:config.paymentCheckoutSigningSecret,returnUrl:config.paymentReturnUrl,apiBase:config.stripeApiBase,transport:dependencies.paymentTransport}));
  for(const [name,provider] of Object.entries(dependencies.bankProviders??{}))bankProviders.register(name,provider);
  for(const [name,provider] of Object.entries(dependencies.financeProviders??{}))financeProviders.register(name,provider);
  for(const [name,provider] of Object.entries(dependencies.cryptoProviders??{}))cryptoProviders.register(name,provider);
  if(config.cryptoEvmRpcUrl&&config.cryptoTokenAddress&&!dependencies.cryptoProviders?.[config.cryptoProviderName])cryptoProviders.register(config.cryptoProviderName,new EvmTokenPaymentProvider({rpcUrl:config.cryptoEvmRpcUrl,network:config.cryptoNetwork,chainId:config.cryptoChainId,asset:config.cryptoAsset,tokenAddress:config.cryptoTokenAddress,decimals:config.cryptoDecimals,confirmations:config.cryptoConfirmations,transport:dependencies.cryptoTransport}));
  const subscriptionPrices=config.cryptoSubscriptionPriceMinor?{[config.cryptoSubscriptionPlan]:config.cryptoSubscriptionPriceMinor}:{};
  const platformCryptoAccount=config.cryptoPlatformWalletAddress?{provider:config.cryptoProviderName,address:config.cryptoPlatformWalletAddress}:null;
  const accounting=new AccountingService(service,{paymentProviders,bankProviders,financeProviders,cryptoProviders,subscriptionPrices,platformCryptoAccount});
  const voiceIntentProvider=dependencies.voiceIntentProvider??(selectedModel?new StructuredModelVoiceIntentProvider(selectedModel):null);
  const voice=new VoiceAssistantService(service,{intentProvider:voiceIntentProvider});
  const telephony=dependencies.telephonyAdapter??(config.twilioAuthToken?new TwilioVoiceAdapter({authToken:config.twilioAuthToken,publicBaseUrl:config.voicePublicBaseUrl,accountSid:config.twilioAccountSid,messagingFrom:config.twilioMessagingFrom,transport:dependencies.telephonyTransport}):null);
  const sms=new SmsAssistantService(service,{intentProvider:voiceIntentProvider,messagingProvider:dependencies.messagingProvider??telephony});
  const assistant = new AtlasAssistant(selectedModel, new AtlasToolRegistry(service,{webResearch}), {
    repository: runtime.repository,
    contentCipher: createContentCipher(config, dependencies)
  });
  const server = createAtlasServer(service, { config, ready: runtime.ready, identity, assistant, ingestion, files, webhooks, cms, migration, accounting, voice, sms, telephony, firmExport });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  const cmsController=new AbortController();
  const schedulerLeases=new SchedulerLeaseCoordinator(runtime.repository);
  const cmsScheduler=config.cmsSyncEnabled?runCmsSyncScheduler(cms,{signal:cmsController.signal,intervalMs:config.cmsSyncIntervalMs,leaseCoordinator:schedulerLeases}):Promise.resolve();
  const sweepController=new AbortController();
  const sweepScheduler=config.situationalSweepEnabled?runSituationalSweepScheduler(new SituationalSweepService(runtime.repository),{signal:sweepController.signal,intervalMs:config.situationalSweepIntervalMs,leaseCoordinator:schedulerLeases}):Promise.resolve();
  const eventController=new AbortController();
  const canonicalConsumers=dependencies.canonicalEventConsumers??new CanonicalEventConsumerRegistry().register('digital-twin-impact',new DigitalTwinImpactConsumer(runtime.repository));
  const eventDispatcher=runCanonicalEventDispatcher(new CanonicalEventDispatcher(runtime.repository,canonicalConsumers),{signal:eventController.signal,intervalMs:dependencies.canonicalEventIntervalMs??1000});
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
      sweepController.abort();
      eventController.abort();
      await cmsScheduler;
      await sweepScheduler;
      await eventDispatcher;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await runtime.close();
    }
  };
}
