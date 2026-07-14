import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('production defaults to a cloud-compatible listener', () => {
  const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/atlas', AUTH_TOKEN_SECRET: 'a'.repeat(32),MFA_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64') });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 3000);
  assert.equal(config.maxBodyBytes, 1_048_576);
  assert.equal(config.refreshTokenTtlSeconds, 2_592_000);
  assert.equal(config.passwordResetTtlSeconds, 900);
  assert.equal(config.loginFailureThreshold, 5);
  assert.equal(config.loginFailureWindowSeconds, 900);
  assert.equal(config.loginLockSeconds, 900);
  assert.equal(config.aiProvider, null);
  assert.equal(config.cmsSyncEnabled, false);
  assert.equal(config.cmsSyncIntervalMs, 300_000);
  assert.equal(config.situationalSweepEnabled, true);
  assert.equal(config.situationalSweepIntervalMs, 60_000);
  assert.equal(config.openAiBaseUrl, 'https://api.openai.com/v1');
  assert.equal(config.aiWebSearchEnabled, false);
  assert.equal(config.aiWebSearchContextSize, 'medium');
  assert.equal(config.documentMaxBytes,25_000_000);
  assert.equal(config.documentStorageProvider,'postgres');
});

test('AI provider configuration is explicit and provider-specific credentials stay isolated', () => {
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai' }), /AI_MODEL is required/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a' }), /OPENAI_API_KEY is required/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key' }), /AI_CONTENT_ENCRYPTION_KEY or AI_CONTENT_ENCRYPTION_KEYS is required/);
  assert.throws(() => loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key', AI_CONTENT_ENCRYPTION_KEY: 'short' }), /base64-encoded 32-byte keys/);
  const encryptionKey = Buffer.alloc(32, 9).toString('base64');
  const config = loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key', AI_CONTENT_ENCRYPTION_KEY: encryptionKey, AI_CONTENT_ENCRYPTION_KEY_ID: 'key-2026' });
  assert.equal(config.aiProvider, 'openai');
  assert.equal(config.aiModel, 'model-a');
  assert.equal(config.openAiApiKey, 'test-key');
  assert.equal(config.aiContentEncryptionKey, encryptionKey);
  assert.equal(config.aiContentEncryptionKeyId, 'key-2026');
  const searchable = loadConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'model-a', OPENAI_API_KEY: 'test-key', AI_CONTENT_ENCRYPTION_KEY: encryptionKey, AI_WEB_SEARCH_ENABLED: 'true', AI_WEB_SEARCH_CONTEXT_SIZE: 'high' });
  assert.equal(searchable.aiWebSearchEnabled, true);
  assert.equal(searchable.aiWebSearchContextSize, 'high');
  assert.throws(() => loadConfig({ AI_WEB_SEARCH_CONTEXT_SIZE: 'unlimited' }), /must be low, medium, or high/);
});

test('AI encryption keyring configuration supports controlled rotation', () => {
  const oldKey = Buffer.alloc(32, 2).toString('base64');
  const currentKey = Buffer.alloc(32, 3).toString('base64');
  const config = loadConfig({ AI_CONTENT_ENCRYPTION_KEYS: JSON.stringify({ old: oldKey, current: currentKey }), AI_CONTENT_ENCRYPTION_KEY_ID: 'current' });
  assert.deepEqual(config.aiContentEncryptionKeys, { old: oldKey, current: currentKey });
  assert.equal(config.aiContentEncryptionKeyId, 'current');
  assert.throws(() => loadConfig({ AI_CONTENT_ENCRYPTION_KEYS: '{}', AI_CONTENT_ENCRYPTION_KEY_ID: 'missing' }), /must identify a configured key/);
  assert.throws(() => loadConfig({ AI_CONTENT_ENCRYPTION_KEYS: '{bad json' }), /must be a JSON object/);
});

test('CMS coexistence configuration validates encrypted credential custody',()=>{
  assert.throws(()=>loadConfig({CMS_CREDENTIAL_ENCRYPTION_KEY:'short'}),/CMS_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key/);
  const key=Buffer.alloc(32,4).toString('base64');const config=loadConfig({CMS_CREDENTIAL_ENCRYPTION_KEY:key,CMS_SYNC_ENABLED:'true',CMS_SYNC_INTERVAL_MS:'60000'});
  assert.equal(config.cmsCredentialEncryptionKey,key);assert.equal(config.cmsSyncEnabled,true);assert.equal(config.cmsSyncIntervalMs,60000);
});

test('mailbox OAuth providers require paired credentials and remain independently configurable',()=>{
  assert.throws(()=>loadConfig({GOOGLE_WORKSPACE_CLIENT_ID:'google-id'}),/GOOGLE_WORKSPACE_CLIENT_ID and GOOGLE_WORKSPACE_CLIENT_SECRET/);
  assert.throws(()=>loadConfig({MICROSOFT_365_CLIENT_SECRET:'microsoft-secret'}),/MICROSOFT_365_CLIENT_ID and MICROSOFT_365_CLIENT_SECRET/);
  const config=loadConfig({GOOGLE_WORKSPACE_CLIENT_ID:'google-id',GOOGLE_WORKSPACE_CLIENT_SECRET:'google-secret',MICROSOFT_365_CLIENT_ID:'microsoft-id',MICROSOFT_365_CLIENT_SECRET:'microsoft-secret',MICROSOFT_365_TENANT:'tenant-id'});
  assert.equal(config.googleWorkspaceClientId,'google-id');assert.equal(config.microsoft365ClientId,'microsoft-id');assert.equal(config.microsoft365Tenant,'tenant-id');
});

test('webhook connector secrets are workspace scoped and sufficiently strong',()=>{assert.throws(()=>loadConfig({INGESTION_WEBHOOK_SECRETS:'[]'}),/must be a JSON object/);assert.throws(()=>loadConfig({INGESTION_WEBHOOK_SECRETS:JSON.stringify({'wsp:phone':'short'})}),/at least 32 characters/);const config=loadConfig({INGESTION_WEBHOOK_SECRETS:JSON.stringify({'wsp_1:phone':'x'.repeat(32)})});assert.equal(config.ingestionWebhookSecrets['wsp_1:phone'].length,32);});

test('live telephony requires paired credentials and an HTTPS public URL',()=>{assert.throws(()=>loadConfig({TWILIO_AUTH_TOKEN:'secret'}),/configured together/);assert.throws(()=>loadConfig({TWILIO_AUTH_TOKEN:'secret',VOICE_PUBLIC_BASE_URL:'http:\/\/atlas.example'}),/must use HTTPS/);const config=loadConfig({TWILIO_AUTH_TOKEN:'secret',VOICE_PUBLIC_BASE_URL:'https:\/\/atlas.example'});assert.equal(config.voicePublicBaseUrl,'https://atlas.example');});

test('outbound texting requires paired account and sender configuration',()=>{assert.throws(()=>loadConfig({TWILIO_ACCOUNT_SID:'AC123'}),/configured together/);assert.throws(()=>loadConfig({TWILIO_ACCOUNT_SID:'AC123',TWILIO_MESSAGING_FROM:'+15550001111'}),/AUTH_TOKEN is required/);const config=loadConfig({TWILIO_AUTH_TOKEN:'secret',VOICE_PUBLIC_BASE_URL:'https:\/\/atlas.example',TWILIO_ACCOUNT_SID:'AC123',TWILIO_MESSAGING_FROM:'+15550001111'});assert.equal(config.twilioMessagingFrom,'+15550001111');});

test('embedded payment processing requires complete Stripe credentials and a secure production return URL',()=>{assert.throws(()=>loadConfig({STRIPE_SECRET_KEY:'sk_test'}),/configured together/);const payment={STRIPE_SECRET_KEY:'sk_test',STRIPE_PUBLISHABLE_KEY:'pk_test',STRIPE_WEBHOOK_SECRET:'whsec_test',PAYMENT_CHECKOUT_SIGNING_SECRET:'s'.repeat(32)};const configured=loadConfig({...payment,PAYMENT_RETURN_URL:'https://atlas.example'});assert.equal(configured.stripeSecretKey,'sk_test');assert.equal(configured.stripePublishableKey,'pk_test');assert.equal(configured.paymentReturnUrl,'https://atlas.example');assert.throws(()=>loadConfig({...payment,PAYMENT_CHECKOUT_SIGNING_SECRET:'short'}),/at least 32/);assert.throws(()=>loadConfig({NODE_ENV:'production',DATABASE_URL:'postgresql://example/atlas',AUTH_TOKEN_SECRET:'a'.repeat(32),MFA_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),...payment,PAYMENT_RETURN_URL:'http://atlas.example'}),/must use HTTPS/);});

test('production refuses to start without PostgreSQL', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL is required/);
});

test('document storage providers fail closed when their durable dependency is absent',()=>{assert.throws(()=>loadConfig({DOCUMENT_STORAGE_PROVIDER:'postgres'}),/DATABASE_URL is required/);assert.throws(()=>loadConfig({DOCUMENT_STORAGE_PROVIDER:'filesystem'}),/DOCUMENT_STORAGE_PATH is required/);assert.equal(loadConfig({DOCUMENT_STORAGE_PROVIDER:'memory'}).documentStorageProvider,'memory');});

test('embedding configuration is bounded and provider-neutral',()=>{const config=loadConfig({AI_EMBEDDING_MODEL:'local-semantic',AI_EMBEDDING_DIMENSIONS:'768'});assert.equal(config.aiEmbeddingModel,'local-semantic');assert.equal(config.aiEmbeddingDimensions,768);assert.throws(()=>loadConfig({AI_EMBEDDING_DIMENSIONS:'3073'}),/must not exceed 3072/);});

test('document index background batches are bounded',()=>{const config=loadConfig({DOCUMENT_INDEX_BATCH_SIZE:'75',DOCUMENT_INDEX_INTERVAL_MS:'30000'});assert.equal(config.documentIndexBatchSize,75);assert.equal(config.documentIndexIntervalMs,30000);assert.throws(()=>loadConfig({DOCUMENT_INDEX_BATCH_SIZE:'101'}),/must not exceed 100/);});

test('production rejects wildcard CORS', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example/atlas', AUTH_TOKEN_SECRET: 'a'.repeat(32),MFA_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'), CORS_ORIGINS: '*' }), /Wildcard CORS/);
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
  assert.throws(() => loadConfig({ CMS_SYNC_INTERVAL_MS: '0' }), /CMS_SYNC_INTERVAL_MS must be a positive integer/);
  assert.throws(() => loadConfig({ SITUATIONAL_SWEEP_INTERVAL_MS: '0' }), /SITUATIONAL_SWEEP_INTERVAL_MS must be a positive integer/);
  assert.throws(() => loadConfig({ DOCUMENT_MAX_BYTES: '0' }), /DOCUMENT_MAX_BYTES must be a positive integer/);
});
