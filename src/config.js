function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function licensedResearchConfig(env,prefix,label){const clientId=env[`${prefix}_CLIENT_ID`]||null;const clientSecret=env[`${prefix}_CLIENT_SECRET`]||null;const tokenEndpoint=env[`${prefix}_TOKEN_ENDPOINT`]||null;const searchEndpoint=env[`${prefix}_SEARCH_ENDPOINT`]||null;const count=[clientId,clientSecret,tokenEndpoint,searchEndpoint].filter(Boolean).length;if(count===0)return null;if(count!==4)throw new Error(`${label} legal research requires CLIENT_ID, CLIENT_SECRET, TOKEN_ENDPOINT, and SEARCH_ENDPOINT together`);for(const [name,value] of [['TOKEN_ENDPOINT',tokenEndpoint],['SEARCH_ENDPOINT',searchEndpoint]]){let url;try{url=new URL(value);}catch{throw new Error(`${prefix}_${name} must be a valid HTTPS URL`);}if(url.protocol!=='https:'||url.username||url.password)throw new Error(`${prefix}_${name} must be a valid HTTPS URL`);}return {clientId,clientSecret,tokenEndpoint,searchEndpoint,scope:env[`${prefix}_SCOPE`]||null};}

function marketingPublicSourcesConfig(env){if(!env.MARKETING_PUBLIC_DATA_SOURCES)return[];let values;try{values=JSON.parse(env.MARKETING_PUBLIC_DATA_SOURCES);}catch{throw new Error('MARKETING_PUBLIC_DATA_SOURCES must be a JSON array');}if(!Array.isArray(values)||values.length>10)throw new Error('MARKETING_PUBLIC_DATA_SOURCES must contain no more than 10 source definitions');const types=new Set(['arrests','dissolution_petitions','car_accidents']);return values.map((item,index)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`MARKETING_PUBLIC_DATA_SOURCES[${index}] must be an object`);const name=String(item.name??'').trim();const label=String(item.label??name).trim();const eventType=String(item.eventType??'').trim();const jurisdiction=String(item.jurisdiction??'').trim()||null;if(!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(name)||!label||label.length>160||!types.has(eventType))throw new Error(`MARKETING_PUBLIC_DATA_SOURCES[${index}] has invalid source metadata`);let endpoint;try{endpoint=new URL(item.endpoint);}catch{throw new Error(`MARKETING_PUBLIC_DATA_SOURCES[${index}].endpoint must be a valid HTTPS URL`);}if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new Error(`MARKETING_PUBLIC_DATA_SOURCES[${index}].endpoint must be a valid HTTPS URL`);return{name,label,eventType,jurisdiction,endpoint:endpoint.toString()};});}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const production = nodeEnv === 'production';
  const databaseUrl = env.DATABASE_URL || null;
  if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production');
  const localDataPath=env.LOCAL_DATA_PATH||null;
  if(production&&localDataPath)throw new Error('LOCAL_DATA_PATH is only supported for local development; use PostgreSQL in production');
  const documentStorageProvider=env.DOCUMENT_STORAGE_PROVIDER||(databaseUrl?'postgres':env.DOCUMENT_STORAGE_PATH?'filesystem':'memory');
  if(!['postgres','filesystem','memory'].includes(documentStorageProvider))throw new Error('DOCUMENT_STORAGE_PROVIDER must be postgres, filesystem, or memory');
  if(documentStorageProvider==='postgres'&&!databaseUrl)throw new Error('DATABASE_URL is required for PostgreSQL document storage');
  if(documentStorageProvider==='filesystem'&&!env.DOCUMENT_STORAGE_PATH)throw new Error('DOCUMENT_STORAGE_PATH is required for filesystem document storage');
  if(production&&documentStorageProvider==='memory')throw new Error('Durable document storage is required in production');
  const fileMalwareScanner=env.FILE_MALWARE_SCANNER||(production?'clamav':'basic');
  if(!['basic','clamav'].includes(fileMalwareScanner))throw new Error('FILE_MALWARE_SCANNER must be basic or clamav');
  const clamAvHost=env.CLAMAV_HOST||null;if(fileMalwareScanner==='clamav'&&!clamAvHost)throw new Error('CLAMAV_HOST is required when FILE_MALWARE_SCANNER=clamav');
  if(production&&fileMalwareScanner!=='clamav')throw new Error('ClamAV malware scanning is required in production');
  const tokenSecret = env.AUTH_TOKEN_SECRET || (production ? null : 'atlas-development-secret-change-me');
  if (!tokenSecret || tokenSecret.length < 32) throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters');
  const mfaEncryptionKey=env.MFA_ENCRYPTION_KEY||(production?null:`${tokenSecret}:mfa-development`);
  if(!mfaEncryptionKey||(production&&Buffer.from(mfaEncryptionKey,'base64').length!==32))throw new Error('MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key in production');
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (production && corsOrigins.includes('*')) throw new Error('Wildcard CORS is not allowed in production');
  let publicBaseUrl=null;
  let externalOAuthRedirectUri=null;
  if(env.PUBLIC_BASE_URL){
    let parsed;
    try{parsed=new URL(env.PUBLIC_BASE_URL);}catch{throw new Error('PUBLIC_BASE_URL must be a valid URL');}
    if(parsed.username||parsed.password||parsed.search||parsed.hash||!['http:','https:'].includes(parsed.protocol))throw new Error('PUBLIC_BASE_URL must be a clean HTTP(S) origin');
    if(production&&parsed.protocol!=='https:')throw new Error('PUBLIC_BASE_URL must use HTTPS in production');
    if(parsed.pathname!=='/'&&parsed.pathname!=='')throw new Error('PUBLIC_BASE_URL must not include a path');
    publicBaseUrl=parsed.origin;
    externalOAuthRedirectUri=`${parsed.origin}/v1/cms/oauth/callback`;
  }
  const aiProvider = env.AI_PROVIDER || null;
  const intelligenceProvider = env.INTELLIGENCE_PROVIDER || null;
  const aiModel = env.AI_MODEL || null;
  const aiEmbeddingModel=env.AI_EMBEDDING_MODEL||'text-embedding-3-small';
  const aiEmbeddingDimensions=positiveInteger(env.AI_EMBEDDING_DIMENSIONS,512,'AI_EMBEDDING_DIMENSIONS');
  if(aiEmbeddingDimensions>3072)throw new Error('AI_EMBEDDING_DIMENSIONS must not exceed 3072');
  const openAiApiKey = env.OPENAI_API_KEY || null;
  const aiWebSearchEnabled = env.AI_WEB_SEARCH_ENABLED === 'true';
  const aiWebSearchContextSize = env.AI_WEB_SEARCH_CONTEXT_SIZE || 'medium';
  if (!['low', 'medium', 'high'].includes(aiWebSearchContextSize)) throw new Error('AI_WEB_SEARCH_CONTEXT_SIZE must be low, medium, or high');
  const aiContentEncryptionKey = env.AI_CONTENT_ENCRYPTION_KEY || null;
  const aiContentEncryptionKeyId = env.AI_CONTENT_ENCRYPTION_KEY_ID || 'primary';
  let aiContentEncryptionKeys = null;
  if (env.AI_CONTENT_ENCRYPTION_KEYS) {
    try { aiContentEncryptionKeys = JSON.parse(env.AI_CONTENT_ENCRYPTION_KEYS); }
    catch { throw new Error('AI_CONTENT_ENCRYPTION_KEYS must be a JSON object'); }
    if (!aiContentEncryptionKeys || Array.isArray(aiContentEncryptionKeys) || typeof aiContentEncryptionKeys !== 'object') throw new Error('AI_CONTENT_ENCRYPTION_KEYS must be a JSON object');
  } else if (aiContentEncryptionKey) aiContentEncryptionKeys = { [aiContentEncryptionKeyId]: aiContentEncryptionKey };
  if (aiProvider && !aiModel) throw new Error('AI_MODEL is required when AI_PROVIDER is configured');
  if (aiProvider === 'openai' && !openAiApiKey) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  if (aiProvider && !aiContentEncryptionKeys) throw new Error('AI_CONTENT_ENCRYPTION_KEY or AI_CONTENT_ENCRYPTION_KEYS is required when AI_PROVIDER is configured');
  if (aiContentEncryptionKeyId.includes(':')) throw new Error('AI_CONTENT_ENCRYPTION_KEY_ID cannot contain a colon');
  for (const [keyId, keyValue] of Object.entries(aiContentEncryptionKeys ?? {})) {
    if (!keyId || keyId.includes(':')) throw new Error('AI content encryption key IDs must be non-empty and cannot contain a colon');
    if (typeof keyValue !== 'string' || Buffer.from(keyValue, 'base64').length !== 32) throw new Error('AI content encryption keys must be base64-encoded 32-byte keys');
  }
  if (aiContentEncryptionKeys && !aiContentEncryptionKeys[aiContentEncryptionKeyId]) throw new Error('AI_CONTENT_ENCRYPTION_KEY_ID must identify a configured key');
  const cmsCredentialEncryptionKey=env.CMS_CREDENTIAL_ENCRYPTION_KEY||null;
  const cmsCredentialEncryptionKeyId=env.CMS_CREDENTIAL_ENCRYPTION_KEY_ID||'cms-primary';
  if(cmsCredentialEncryptionKey&&Buffer.from(cmsCredentialEncryptionKey,'base64').length!==32)throw new Error('CMS_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  if(Boolean(env.GOOGLE_WORKSPACE_CLIENT_ID)!==Boolean(env.GOOGLE_WORKSPACE_CLIENT_SECRET))throw new Error('GOOGLE_WORKSPACE_CLIENT_ID and GOOGLE_WORKSPACE_CLIENT_SECRET must be configured together');
  if(Boolean(env.MICROSOFT_365_CLIENT_ID)!==Boolean(env.MICROSOFT_365_CLIENT_SECRET))throw new Error('MICROSOFT_365_CLIENT_ID and MICROSOFT_365_CLIENT_SECRET must be configured together');
  const microsoft365Tenant=env.MICROSOFT_365_TENANT||'organizations';
  const tenantGuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const tenantDomain=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if(microsoft365Tenant!=='organizations'&&!tenantGuid.test(microsoft365Tenant)&&!tenantDomain.test(microsoft365Tenant))throw new Error('MICROSOFT_365_TENANT must be organizations, a tenant GUID, or a verified tenant domain');
  if(production&&(env.MICROSOFT_365_CLIENT_ID||env.GOOGLE_WORKSPACE_CLIENT_ID)&&!externalOAuthRedirectUri)throw new Error('PUBLIC_BASE_URL is required when live email and calendar OAuth is configured in production');
  if(Boolean(env.QUICKBOOKS_CLIENT_ID)!==Boolean(env.QUICKBOOKS_CLIENT_SECRET))throw new Error('QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be configured together');
  const quickBooksEnvironment=env.QUICKBOOKS_ENVIRONMENT||'production';if(!['sandbox','production'].includes(quickBooksEnvironment))throw new Error('QUICKBOOKS_ENVIRONMENT must be sandbox or production');
  const cryptoEvmRpcUrl=env.CRYPTO_EVM_RPC_URL||null;const cryptoTokenAddress=env.CRYPTO_TOKEN_ADDRESS||null;const cryptoPlatformWalletAddress=env.CRYPTO_PLATFORM_WALLET_ADDRESS||null;
  const cryptoConfigured=Boolean(cryptoEvmRpcUrl||cryptoTokenAddress||cryptoPlatformWalletAddress);
  if(cryptoConfigured&&!(cryptoEvmRpcUrl&&cryptoTokenAddress))throw new Error('CRYPTO_EVM_RPC_URL and CRYPTO_TOKEN_ADDRESS must be configured together');
  const stripeSecretKey=env.STRIPE_SECRET_KEY||null;const stripePublishableKey=env.STRIPE_PUBLISHABLE_KEY||null;const stripeWebhookSecret=env.STRIPE_WEBHOOK_SECRET||null;const paymentCheckoutSigningSecret=env.PAYMENT_CHECKOUT_SIGNING_SECRET||null;const paymentReturnUrl=env.PAYMENT_RETURN_URL||env.PUBLIC_BASE_URL||null;
  const stripeParts=[stripeSecretKey,stripePublishableKey,stripeWebhookSecret,paymentCheckoutSigningSecret].filter(Boolean).length;if(stripeParts!==0&&stripeParts!==4)throw new Error('STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, and PAYMENT_CHECKOUT_SIGNING_SECRET must be configured together');
  if(paymentCheckoutSigningSecret&&paymentCheckoutSigningSecret.length<32)throw new Error('PAYMENT_CHECKOUT_SIGNING_SECRET must contain at least 32 characters');
  if(stripeSecretKey&&production&&(!paymentReturnUrl||!paymentReturnUrl.startsWith('https://')))throw new Error('PAYMENT_RETURN_URL must use HTTPS when Stripe is configured in production');
  const twilioAuthToken=env.TWILIO_AUTH_TOKEN||null;const voicePublicBaseUrl=env.VOICE_PUBLIC_BASE_URL||null;
  if(Boolean(twilioAuthToken)!==Boolean(voicePublicBaseUrl))throw new Error('TWILIO_AUTH_TOKEN and VOICE_PUBLIC_BASE_URL must be configured together');
  if(voicePublicBaseUrl&&!voicePublicBaseUrl.startsWith('https://'))throw new Error('VOICE_PUBLIC_BASE_URL must use HTTPS');
  const documentIndexBatchSize=positiveInteger(env.DOCUMENT_INDEX_BATCH_SIZE,50,'DOCUMENT_INDEX_BATCH_SIZE');if(documentIndexBatchSize>100)throw new Error('DOCUMENT_INDEX_BATCH_SIZE must not exceed 100');
  const twilioAccountSid=env.TWILIO_ACCOUNT_SID||null;const twilioMessagingFrom=env.TWILIO_MESSAGING_FROM||null;
  if(Boolean(twilioAccountSid)!==Boolean(twilioMessagingFrom))throw new Error('TWILIO_ACCOUNT_SID and TWILIO_MESSAGING_FROM must be configured together');
  if(twilioAccountSid&&!twilioAuthToken)throw new Error('TWILIO_AUTH_TOKEN is required for outbound messaging');
  const westlawResearch=licensedResearchConfig(env,'WESTLAW','Westlaw');
  const lexisNexisResearch=licensedResearchConfig(env,'LEXISNEXIS','LexisNexis');
  const docusignValues=[env.DOCUSIGN_WORKSPACE_ID,env.DOCUSIGN_INTEGRATION_KEY,env.DOCUSIGN_USER_ID,env.DOCUSIGN_ACCOUNT_ID,env.DOCUSIGN_PRIVATE_KEY_BASE64,env.DOCUSIGN_API_BASE_URL,env.DOCUSIGN_RETURN_URL,env.DOCUSIGN_CONNECT_HMAC_KEY];const docusignCount=docusignValues.filter(Boolean).length;let docusign=null;if(docusignCount&&docusignCount!==docusignValues.length)throw new Error('Docusign requires WORKSPACE_ID, INTEGRATION_KEY, USER_ID, ACCOUNT_ID, PRIVATE_KEY_BASE64, API_BASE_URL, RETURN_URL, and CONNECT_HMAC_KEY together');if(docusignCount){const privateKey=Buffer.from(env.DOCUSIGN_PRIVATE_KEY_BASE64,'base64').toString('utf8');if(!privateKey.includes('BEGIN PRIVATE KEY')&&!privateKey.includes('BEGIN RSA PRIVATE KEY'))throw new Error('DOCUSIGN_PRIVATE_KEY_BASE64 must contain a base64-encoded PEM private key');if(env.DOCUSIGN_CONNECT_HMAC_KEY.length<32)throw new Error('DOCUSIGN_CONNECT_HMAC_KEY must contain at least 32 characters');for(const name of ['DOCUSIGN_API_BASE_URL','DOCUSIGN_RETURN_URL']){let url;try{url=new URL(env[name]);}catch{throw new Error(`${name} must be a valid HTTPS URL`);}if(url.protocol!=='https:'||url.username||url.password)throw new Error(`${name} must be a valid HTTPS URL`);}const authBase=env.DOCUSIGN_AUTH_BASE_URL||'https://account.docusign.com';if(!authBase.startsWith('https://'))throw new Error('DOCUSIGN_AUTH_BASE_URL must be a valid HTTPS URL');docusign={workspaceId:env.DOCUSIGN_WORKSPACE_ID,integrationKey:env.DOCUSIGN_INTEGRATION_KEY,userId:env.DOCUSIGN_USER_ID,accountId:env.DOCUSIGN_ACCOUNT_ID,privateKey,apiBase:env.DOCUSIGN_API_BASE_URL,authBase,returnUrl:env.DOCUSIGN_RETURN_URL,connectHmacKey:env.DOCUSIGN_CONNECT_HMAC_KEY};}
  const marketingPublicSources=marketingPublicSourcesConfig(env);
  let ingestionWebhookSecrets={};if(env.INGESTION_WEBHOOK_SECRETS){try{ingestionWebhookSecrets=JSON.parse(env.INGESTION_WEBHOOK_SECRETS);}catch{throw new Error('INGESTION_WEBHOOK_SECRETS must be a JSON object');}if(!ingestionWebhookSecrets||Array.isArray(ingestionWebhookSecrets)||typeof ingestionWebhookSecrets!=='object')throw new Error('INGESTION_WEBHOOK_SECRETS must be a JSON object');for(const [name,secret] of Object.entries(ingestionWebhookSecrets))if(!name.includes(':')||typeof secret!=='string'||secret.length<32)throw new Error('Each ingestion webhook secret requires a workspace:connector key and at least 32 characters');}
  return {
    nodeEnv,
    production,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: positiveInteger(env.PORT, 3000, 'PORT'),
    trustProxy:env.TRUST_PROXY==='true',
    databaseUrl,
    localDataPath,
    tokenSecret,
    mfaEncryptionKey,
    accessTokenTtlSeconds: positiveInteger(env.ACCESS_TOKEN_TTL_SECONDS, 900, 'ACCESS_TOKEN_TTL_SECONDS'),
    refreshTokenTtlSeconds: positiveInteger(env.REFRESH_TOKEN_TTL_SECONDS, 2_592_000, 'REFRESH_TOKEN_TTL_SECONDS'),
    passwordResetTtlSeconds: positiveInteger(env.PASSWORD_RESET_TTL_SECONDS, 900, 'PASSWORD_RESET_TTL_SECONDS'),
    loginFailureThreshold: positiveInteger(env.LOGIN_FAILURE_THRESHOLD, 5, 'LOGIN_FAILURE_THRESHOLD'),
    loginFailureWindowSeconds: positiveInteger(env.LOGIN_FAILURE_WINDOW_SECONDS, 900, 'LOGIN_FAILURE_WINDOW_SECONDS'),
    loginLockSeconds: positiveInteger(env.LOGIN_LOCK_SECONDS, 900, 'LOGIN_LOCK_SECONDS'),
    aiProvider,
    intelligenceProvider,
    aiModel,
    aiEmbeddingModel,
    aiEmbeddingDimensions,
    openAiApiKey,
    aiWebSearchEnabled,
    aiWebSearchContextSize,
    aiContentEncryptionKey,
    aiContentEncryptionKeyId,
    aiContentEncryptionKeys,
    openAiBaseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    clioClientId: env.CLIO_CLIENT_ID || null,
    clioClientSecret: env.CLIO_CLIENT_SECRET || null,
    clioRegion: env.CLIO_REGION || 'us',
    myCaseClientId: env.MYCASE_CLIENT_ID || null,
    myCaseClientSecret: env.MYCASE_CLIENT_SECRET || null,
    myCaseAuthorizeEndpoint: env.MYCASE_AUTHORIZE_ENDPOINT || null,
    myCaseTokenEndpoint: env.MYCASE_TOKEN_ENDPOINT || null,
    myCaseApiBase: env.MYCASE_API_BASE || null,
    googleWorkspaceClientId: env.GOOGLE_WORKSPACE_CLIENT_ID || null,
    googleWorkspaceClientSecret: env.GOOGLE_WORKSPACE_CLIENT_SECRET || null,
    microsoft365ClientId: env.MICROSOFT_365_CLIENT_ID || null,
    microsoft365ClientSecret: env.MICROSOFT_365_CLIENT_SECRET || null,
    microsoft365Tenant,
    publicBaseUrl,
    externalOAuthRedirectUri,
    quickBooksClientId:env.QUICKBOOKS_CLIENT_ID||null,
    quickBooksClientSecret:env.QUICKBOOKS_CLIENT_SECRET||null,
    quickBooksEnvironment,
    westlawResearch,
    lexisNexisResearch,
    docusign,
    marketingPublicSources,
    cryptoProviderName:env.CRYPTO_PROVIDER_NAME||'base-usdc',
    cryptoEvmRpcUrl,cryptoNetwork:env.CRYPTO_NETWORK||'base',cryptoChainId:positiveInteger(env.CRYPTO_CHAIN_ID,8453,'CRYPTO_CHAIN_ID'),cryptoAsset:env.CRYPTO_ASSET||'USDC',cryptoTokenAddress,cryptoDecimals:positiveInteger(env.CRYPTO_DECIMALS,6,'CRYPTO_DECIMALS'),cryptoConfirmations:positiveInteger(env.CRYPTO_CONFIRMATIONS,12,'CRYPTO_CONFIRMATIONS'),cryptoPlatformWalletAddress,
    cryptoSubscriptionPlan:env.CRYPTO_SUBSCRIPTION_PLAN||'professional',cryptoSubscriptionPriceMinor:env.CRYPTO_SUBSCRIPTION_PRICE_MINOR?positiveInteger(env.CRYPTO_SUBSCRIPTION_PRICE_MINOR,null,'CRYPTO_SUBSCRIPTION_PRICE_MINOR'):null,
    stripeSecretKey,stripePublishableKey,stripeWebhookSecret,paymentCheckoutSigningSecret,paymentReturnUrl,stripeApiBase:env.STRIPE_API_BASE||'https://api.stripe.com/v1',
    twilioAuthToken,voicePublicBaseUrl,twilioAccountSid,twilioMessagingFrom,
    cmsSyncEnabled: env.CMS_SYNC_ENABLED === 'true',
    cmsSyncIntervalMs: positiveInteger(env.CMS_SYNC_INTERVAL_MS, 300_000, 'CMS_SYNC_INTERVAL_MS'),
    intelligenceWorkerEnabled:env.INTELLIGENCE_WORKER_ENABLED===undefined?!production:env.INTELLIGENCE_WORKER_ENABLED==='true',
    cmsCredentialEncryptionKey,
    cmsCredentialEncryptionKeyId,
    ingestionWebhookSecrets,
    situationalSweepEnabled: env.SITUATIONAL_SWEEP_ENABLED === 'true' || production,
    situationalSweepIntervalMs: positiveInteger(env.SITUATIONAL_SWEEP_INTERVAL_MS, 60_000, 'SITUATIONAL_SWEEP_INTERVAL_MS'),
    databasePoolSize: positiveInteger(env.DATABASE_POOL_SIZE, 10, 'DATABASE_POOL_SIZE'),
    maxBodyBytes: positiveInteger(env.MAX_BODY_BYTES, 1_048_576, 'MAX_BODY_BYTES'),
    migrationMaxBodyBytes:positiveInteger(env.MIGRATION_MAX_BODY_BYTES,20_000_000,'MIGRATION_MAX_BODY_BYTES'),
    documentMaxBytes:positiveInteger(env.DOCUMENT_MAX_BYTES,25_000_000,'DOCUMENT_MAX_BYTES'),
    documentStorageProvider,
    documentStoragePath:env.DOCUMENT_STORAGE_PATH||null,
    fileMalwareScanner,clamAvHost,clamAvPort:positiveInteger(env.CLAMAV_PORT,3310,'CLAMAV_PORT'),clamAvTimeoutMs:positiveInteger(env.CLAMAV_TIMEOUT_MS,30_000,'CLAMAV_TIMEOUT_MS'),
    documentIndexBatchSize,
    documentIndexIntervalMs:positiveInteger(env.DOCUMENT_INDEX_INTERVAL_MS,60_000,'DOCUMENT_INDEX_INTERVAL_MS'),
    shutdownTimeoutMs: positiveInteger(env.SHUTDOWN_TIMEOUT_MS, 10_000, 'SHUTDOWN_TIMEOUT_MS'),
    rateLimitAuthRequests:positiveInteger(env.RATE_LIMIT_AUTH_REQUESTS,30,'RATE_LIMIT_AUTH_REQUESTS'),
    rateLimitAiRequests:positiveInteger(env.RATE_LIMIT_AI_REQUESTS,30,'RATE_LIMIT_AI_REQUESTS'),
    rateLimitFileRequests:positiveInteger(env.RATE_LIMIT_FILE_REQUESTS,20,'RATE_LIMIT_FILE_REQUESTS'),
    rateLimitWriteRequests:positiveInteger(env.RATE_LIMIT_WRITE_REQUESTS,120,'RATE_LIMIT_WRITE_REQUESTS'),
    rateLimitWebhookRequests:positiveInteger(env.RATE_LIMIT_WEBHOOK_REQUESTS,300,'RATE_LIMIT_WEBHOOK_REQUESTS'),
    corsOrigins
  };
}
