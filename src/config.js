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
  const tokenSecret = env.AUTH_TOKEN_SECRET || (production ? null : 'atlas-development-secret-change-me');
  if (!tokenSecret || tokenSecret.length < 32) throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters');
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (production && corsOrigins.includes('*')) throw new Error('Wildcard CORS is not allowed in production');
  const aiProvider = env.AI_PROVIDER || null;
  const aiModel = env.AI_MODEL || null;
  const openAiApiKey = env.OPENAI_API_KEY || null;
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
  return {
    nodeEnv,
    production,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: positiveInteger(env.PORT, 3000, 'PORT'),
    databaseUrl,
    tokenSecret,
    accessTokenTtlSeconds: positiveInteger(env.ACCESS_TOKEN_TTL_SECONDS, 900, 'ACCESS_TOKEN_TTL_SECONDS'),
    refreshTokenTtlSeconds: positiveInteger(env.REFRESH_TOKEN_TTL_SECONDS, 2_592_000, 'REFRESH_TOKEN_TTL_SECONDS'),
    passwordResetTtlSeconds: positiveInteger(env.PASSWORD_RESET_TTL_SECONDS, 900, 'PASSWORD_RESET_TTL_SECONDS'),
    loginFailureThreshold: positiveInteger(env.LOGIN_FAILURE_THRESHOLD, 5, 'LOGIN_FAILURE_THRESHOLD'),
    loginFailureWindowSeconds: positiveInteger(env.LOGIN_FAILURE_WINDOW_SECONDS, 900, 'LOGIN_FAILURE_WINDOW_SECONDS'),
    loginLockSeconds: positiveInteger(env.LOGIN_LOCK_SECONDS, 900, 'LOGIN_LOCK_SECONDS'),
    aiProvider,
    aiModel,
    openAiApiKey,
    aiContentEncryptionKey,
    aiContentEncryptionKeyId,
    aiContentEncryptionKeys,
    openAiBaseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    databasePoolSize: positiveInteger(env.DATABASE_POOL_SIZE, 10, 'DATABASE_POOL_SIZE'),
    maxBodyBytes: positiveInteger(env.MAX_BODY_BYTES, 1_048_576, 'MAX_BODY_BYTES'),
    shutdownTimeoutMs: positiveInteger(env.SHUTDOWN_TIMEOUT_MS, 10_000, 'SHUTDOWN_TIMEOUT_MS'),
    corsOrigins
  };
}
