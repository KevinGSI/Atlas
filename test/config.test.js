import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('production defaults to a cloud-compatible listener', () => {
  const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/atlas', AUTH_TOKEN_SECRET: 'a'.repeat(32) });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 3000);
  assert.equal(config.maxBodyBytes, 1_048_576);
  assert.equal(config.refreshTokenTtlSeconds, 2_592_000);
  assert.equal(config.passwordResetTtlSeconds, 900);
  assert.equal(config.loginFailureThreshold, 5);
  assert.equal(config.loginFailureWindowSeconds, 900);
  assert.equal(config.loginLockSeconds, 900);
  assert.equal(config.aiProvider, null);
  assert.equal(config.openAiBaseUrl, 'https://api.openai.com/v1');
});

test('AI provider configuration is explicit and provider-specific credentials stay isolated', () => {
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai' }), /AI_MODEL is required/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a' }), /OPENAI_API_KEY is required/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key' }), /AI_CONTENT_ENCRYPTION_KEY is required/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key', AI_CONTENT_ENCRYPTION_KEY: 'short' }), /base64-encoded 32-byte key/);
  const encryptionKey = Buffer.alloc(32, 9).toString('base64');
  const config = loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key', AI_CONTENT_ENCRYPTION_KEY: encryptionKey, AI_CONTENT_ENCRYPTION_KEY_ID: 'key-2026' });
  assert.equal(config.aiProvider, 'openai');
  assert.equal(config.aiModel, 'model-a');
  assert.equal(config.openAiApiKey, 'test-key');
  assert.equal(config.aiContentEncryptionKey, encryptionKey);
  assert.equal(config.aiContentEncryptionKeyId, 'key-2026');
});

test('production refuses to start without PostgreSQL', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL is required/);
});

test('production rejects wildcard CORS', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/atlas', AUTH_TOKEN_SECRET: 'a'.repeat(32), CORS_ORIGINS: '*' }), /Wildcard CORS/);
});

test('production rejects weak token secrets', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/atlas', AUTH_TOKEN_SECRET: 'short' }), /at least 32/);
});

test('configuration validates positive numeric limits', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), /PORT must be a positive integer/);
  assert.throws(() => loadConfig({ MAX_BODY_BYTES: 'lots' }), /MAX_BODY_BYTES must be a positive integer/);
  assert.throws(() => loadConfig({ REFRESH_TOKEN_TTL_SECONDS: '0' }), /REFRESH_TOKEN_TTL_SECONDS must be a positive integer/);
  assert.throws(() => loadConfig({ PASSWORD_RESET_TTL_SECONDS: '0' }), /PASSWORD_RESET_TTL_SECONDS must be a positive integer/);
  assert.throws(() => loadConfig({ LOGIN_FAILURE_THRESHOLD: '0' }), /LOGIN_FAILURE_THRESHOLD must be a positive integer/);
});
