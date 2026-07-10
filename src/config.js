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
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (production && corsOrigins.includes('*')) throw new Error('Wildcard CORS is not allowed in production');
  return {
    nodeEnv,
    production,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: positiveInteger(env.PORT, 3000, 'PORT'),
    databaseUrl,
    databasePoolSize: positiveInteger(env.DATABASE_POOL_SIZE, 10, 'DATABASE_POOL_SIZE'),
    maxBodyBytes: positiveInteger(env.MAX_BODY_BYTES, 1_048_576, 'MAX_BODY_BYTES'),
    shutdownTimeoutMs: positiveInteger(env.SHUTDOWN_TIMEOUT_MS, 10_000, 'SHUTDOWN_TIMEOUT_MS'),
    corsOrigins
  };
}
