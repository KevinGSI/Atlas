function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const production = nodeEnv === 'production';
  const databaseUrl = env.DATABASE_URL || null;
  if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production');
  const documentStorageProvider=env.DOCUMENT_STORAGE_PROVIDER||(databaseUrl?'postgres':env.DOCUMENT_STORAGE_PATH?'filesystem':'memory');
  if(!['postgres','filesystem','memory'].includes(documentStorageProvider))throw new Error('DOCUMENT_STORAGE_PROVIDER must be postgres, filesystem, or memory');
  if(documentStorageProvider==='postgres'&&!databaseUrl)throw new Error('DATABASE_URL is required for PostgreSQL document storage');
  if(documentStorageProvider==='filesystem'&&!env.DOCUMENT_STORAGE_PATH)throw new Error('DOCUMENT_STORAGE_PATH is required for filesystem document storage');
  if(production&&documentStorageProvider==='memory')throw new Error('Durable document storage is required in production');
  const tokenSecret = env.AUTH_TOKEN_SECRET || (production ? null : 'atlas-development-secret-change-me');
  if (!tokenSecret || tokenSecret.length < 32) throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters');
  const mfaEncryptionKey=env.MFA_ENCRYPTION_KEY||(production?null:`${tokenSecret}:mfa-development`);
  if(!mfaEncryptionKey||(production&&Buffer.from(mfaEncryptionKey,'base64').length!==32))throw new Error('MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key in production');
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (production && corsOrigins.includes('*')) throw new Error('Wildcard CORS is not allowed in production');
  const aiProvider = env.AI_PROVIDER || null;
  const intelligenceProvider = env.INTELLIGENCE_PROVIDER || null;
  const aiModel = env.AI_MODEL || null;
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
  const twilioAccountSid=env.TWILIO_ACCOUNT_SID||null;const twilioMessagingFrom=env.TWILIO_MESSAGING_FROM||null;
  if(Boolean(twilioAccountSid)!==Boolean(twilioMessagingFrom))throw new Error('TWILIO_ACCOUNT_SID and TWILIO_MESSAGING_FROM must be configured together');
  if(twilioAccountSid&&!twilioAuthToken)throw new Error('TWILIO_AUTH_TOKEN is required for outbound messaging');
  let ingestionWebhookSecrets={};if(env.INGESTION_WEBHOOK_SECRETS){try{ingestionWebhookSecrets=JSON.parse(env.INGESTION_WEBHOOK_SECRETS);}catch{throw new Error('INGESTION_WEBHOOK_SECRETS must be a JSON object');}if(!ingestionWebhookSecrets||Array.isArray(ingestionWebhookSecrets)||typeof ingestionWebhookSecrets!=='object')throw new Error('INGESTION_WEBHOOK_SECRETS must be a JSON object');for(const [name,secret] of Object.entries(ingestionWebhookSecrets))if(!name.includes(':')||typeof secret!=='string'||secret.length<32)throw new Error('Each ingestion webhook secret requires a workspace:connector key and at least 32 characters');}
  return {
    nodeEnv,
    production,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: positiveInteger(env.PORT, 3000, 'PORT'),
    databaseUrl,
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
    microsoft365Tenant: env.MICROSOFT_365_TENANT || 'organizations',
    cryptoProviderName:env.CRYPTO_PROVIDER_NAME||'base-usdc',
    cryptoEvmRpcUrl,cryptoNetwork:env.CRYPTO_NETWORK||'base',cryptoChainId:positiveInteger(env.CRYPTO_CHAIN_ID,8453,'CRYPTO_CHAIN_ID'),cryptoAsset:env.CRYPTO_ASSET||'USDC',cryptoTokenAddress,cryptoDecimals:positiveInteger(env.CRYPTO_DECIMALS,6,'CRYPTO_DECIMALS'),cryptoConfirmations:positiveInteger(env.CRYPTO_CONFIRMATIONS,12,'CRYPTO_CONFIRMATIONS'),cryptoPlatformWalletAddress,
    cryptoSubscriptionPlan:env.CRYPTO_SUBSCRIPTION_PLAN||'professional',cryptoSubscriptionPriceMinor:env.CRYPTO_SUBSCRIPTION_PRICE_MINOR?positiveInteger(env.CRYPTO_SUBSCRIPTION_PRICE_MINOR,null,'CRYPTO_SUBSCRIPTION_PRICE_MINOR'):null,
    stripeSecretKey,stripePublishableKey,stripeWebhookSecret,paymentCheckoutSigningSecret,paymentReturnUrl,stripeApiBase:env.STRIPE_API_BASE||'https://api.stripe.com/v1',
    twilioAuthToken,voicePublicBaseUrl,twilioAccountSid,twilioMessagingFrom,
    cmsSyncEnabled: env.CMS_SYNC_ENABLED === 'true',
    cmsSyncIntervalMs: positiveInteger(env.CMS_SYNC_INTERVAL_MS, 300_000, 'CMS_SYNC_INTERVAL_MS'),
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
    shutdownTimeoutMs: positiveInteger(env.SHUTDOWN_TIMEOUT_MS, 10_000, 'SHUTDOWN_TIMEOUT_MS'),
    corsOrigins
  };
}
