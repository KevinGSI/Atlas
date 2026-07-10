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
});
