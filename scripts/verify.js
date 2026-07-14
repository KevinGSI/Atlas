import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadMigrations, migrationTableNames } from '../src/migrations.js';

const requiredFiles = [
  'package.json', 'pnpm-lock.yaml', 'README.md', 'IMPLEMENTATION_STATUS.md', '.env.example', 'docker-compose.yml', 'Launch Atlas Demo.command', 'Stop Atlas Demo.command', 'scripts/check-compliance.js', 'docs/COMPLIANCE_EVIDENCE_REGISTER.md', 'docs/EMAIL_CALENDAR_SETUP.md',
  'Dockerfile', '.dockerignore', 'render.yaml', 'src/server.js', 'src/application.js', 'src/config.js', 'src/mfa.js', 'src/accounting.js', 'src/payment-provider-adapters.js', 'src/crypto-provider-adapters.js', 'src/voice-assistant.js', 'src/sms-assistant.js', 'src/case-communications.js', 'src/telephony-provider-adapters.js', 'src/migration-import.js', 'scripts/launch-readiness.js', 'src/scheduler-leases.js', 'src/native-capabilities.js', 'src/calendar-events.js', 'src/canonical-events.js', 'src/canonical-context.js', 'src/legal-research.js', 'src/rate-limit.js', 'src/file-security-incidents.js',
  'src/http.js', 'src/service.js', 'src/repository.js', 'src/identity.js', 'src/assistant.js', 'src/legal-documents.js', 'src/form-bank.js', 'src/compliance-assurance.js', 'src/ai-providers.js', 'src/ai-evaluation.js', 'src/staging-smoke.js', 'src/content-security.js', 'src/ai-content-migration.js', 'src/intelligence.js', 'src/intelligence-projection.js', 'src/document-analysis.js', 'src/ingestion.js', 'src/file-storage.js', 'src/file-security.js', 'src/document-knowledge.js', 'src/webhook-security.js', 'src/resolution.js', 'src/cms-connectors.js', 'src/cms-provider-adapters.js', 'src/mail-provider-adapters.js', 'src/situational-awareness.js', 'src/marketing.js', 'src/phase-one-web.js', 'web/phase-one/index.html', 'web/phase-one/app.js', 'web/phase-one/payment.html', 'web/phase-one/payment.js', 'docs/NATIVE_INTELLIGENCE_CONSTITUTION.md', 'docs/NATIVE_INTELLIGENCE_VERIFICATION.md', 'docs/FILE_SECURITY.md', 'docs/FORM_BANK.md', 'docs/COMPLIANCE_ASSURANCE.md',
  'src/postgres-repository.js', 'src/migrations.js', 'src/runtime.js',
  'db/migrations/0001_initial.sql', 'db/migrations/0002_identity.sql', 'db/migrations/0003_object_audit.sql', 'db/migrations/0004_refresh_sessions.sql', 'db/migrations/0005_password_reset.sql', 'db/migrations/0006_login_throttle.sql', 'db/migrations/0007_ai_run_ledger.sql', 'db/migrations/0008_ai_conversations.sql', 'db/migrations/0009_ai_action_proposals.sql', 'db/migrations/0010_ai_draft_actions.sql', 'db/migrations/0011_intelligence_jobs.sql', 'db/migrations/0012_intelligence_observations.sql', 'db/migrations/0013_ingestion_records.sql', 'db/migrations/0014_cms_coexistence.sql', 'db/migrations/0015_encrypted_secrets.sql', 'db/migrations/0016_situational_awareness.sql', 'db/migrations/0017_scheduler_leases.sql', 'db/migrations/0018_canonical_event_ledger.sql', 'db/migrations/0019_postgres_integrity.sql', 'db/migrations/0020_cms_tombstones.sql', 'db/migrations/0021_firm_subscriptions.sql', 'db/migrations/0022_professional_roles.sql', 'db/migrations/0023_workspace_invitations.sql', 'db/migrations/0024_security_controls.sql', 'db/migrations/0025_firm_access_security.sql', 'db/migrations/0026_document_blobs.sql', 'db/migrations/0027_document_knowledge_embeddings.sql', 'db/migrations/0028_document_knowledge_chunks.sql', 'db/migrations/0029_request_rate_limits.sql', 'db/migrations/0030_social_post_actions.sql', 'db/migrations/0031_calendar_event_actions.sql', 'test/service.test.js', 'test/http.test.js', 'test/subscriptions.test.js',
  'test/postgres-repository.test.js', 'test/migrations.test.js', 'test/config.test.js', 'test/runtime.test.js', 'test/file-storage.test.js', 'test/form-bank.test.js', 'test/form-bank-drafting.test.js', 'test/file-security.test.js', 'test/rate-limit.test.js', 'test/document-analysis-application.test.js',
  'test/deployment.test.js', 'test/staging-smoke.test.js', 'test/launch-readiness.test.js', 'test/accounting.test.js', 'test/payment-provider-adapters.test.js', 'test/crypto-payments.test.js', 'test/legal-research.test.js', 'test/document-execution.test.js', 'test/marketing.test.js', 'test/voice-assistant.test.js', 'test/sms-assistant.test.js', 'test/case-communications.test.js', 'test/mfa.test.js', 'test/telephony-provider-adapters.test.js', 'test/voice-http.test.js', 'test/sms-http.test.js', 'test/migration-import.test.js', 'test/migration-http.test.js', 'test/live-postgres.test.js', 'test/identity.test.js', 'test/assistant.test.js', 'test/ai-providers.test.js', 'test/ai-evaluation.test.js', 'test/content-security.test.js', 'test/ai-content-migration.test.js', 'test/intelligence.test.js', 'test/document-knowledge.test.js', 'test/ingestion.test.js', 'test/webhook-security.test.js', 'test/resolution.test.js', 'test/architecture.test.js', 'test/cms-connectors.test.js', 'test/mail-provider-adapters.test.js', 'test/situational-awareness.test.js', 'test/scheduler-leases.test.js', 'test/native-capabilities.test.js', 'test/canonical-events.test.js', 'test/canonical-context.test.js', 'docs/NATIVE_AI_CAPABILITIES.md', 'docs/ACCOUNTING_PAYMENTS_AND_FINANCING.md', 'docs/CRYPTO_AND_VOICE_INTEGRATION.md', 'docs/CMS_MIGRATION.md', 'docs/MICROSOFT_365_SETUP.md', 'docs/COMMUNICATIONS_ASSISTANT.md', 'docs/LEGAL_RESEARCH.md', 'docs/DOCUMENT_SIGNATURE_AND_NOTARY.md', 'docs/MARKETING.md', 'docs/TRUST_SECURITY_COMPLIANCE_MATRIX.md', 'docs/INCIDENT_RESPONSE_AND_RECOVERY.md', 'docs/PHASE_ONE_LAUNCH.md', 'SECURITY.md', '.github/dependabot.yml', '.github/workflows/core-verification.yml', '.github/workflows/security-analysis.yml', 'scripts/check-launch.js', 'scripts/encrypt-ai-content.js', 'scripts/intelligence-worker.js', 'scripts/backfill-document-knowledge.js', 'scripts/test-postgres.js', 'scripts/test-ai-provider.js', 'scripts/test-staging.js', '.github/workflows/postgres-integration.yml', '.github/workflows/openai-evaluation.yml', '.github/workflows/staging-smoke.yml'
];

const failures = [];
for (const file of requiredFiles) {
  try { await readFile(file); } catch { failures.push(`missing ${file}`); }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '1.0.0-rc.1') failures.push(`expected version 1.0.0-rc.1, got ${pkg.version}`);

const migration = await readFile('db/migrations/0001_initial.sql', 'utf8');
for (const table of ['atlas_workspace', 'atlas_object', 'atlas_relationship', 'atlas_timeline_event']) {
  if (!migration.includes(`CREATE TABLE ${table}`)) failures.push(`migration missing ${table}`);
}
const identityMigration = await readFile('db/migrations/0002_identity.sql', 'utf8');
for (const table of ['atlas_user', 'atlas_workspace_membership']) {
  if (!identityMigration.includes(`CREATE TABLE ${table}`)) failures.push(`identity migration missing ${table}`);
}
const auditMigration = await readFile('db/migrations/0003_object_audit.sql', 'utf8');
if (!auditMigration.includes('CREATE TABLE atlas_audit_entry')) failures.push('audit migration missing atlas_audit_entry');
if (!auditMigration.includes('atlas_audit_no_update') || !auditMigration.includes('atlas_audit_no_delete')) failures.push('append-only audit triggers are missing');
const sessionMigration = await readFile('db/migrations/0004_refresh_sessions.sql', 'utf8');
if (!sessionMigration.includes('CREATE TABLE atlas_refresh_session')) failures.push('session migration missing atlas_refresh_session');
if (!sessionMigration.includes('token_hash text NOT NULL UNIQUE')) failures.push('refresh token hash uniqueness is missing');
const resetMigration = await readFile('db/migrations/0005_password_reset.sql', 'utf8');
if (!resetMigration.includes('CREATE TABLE atlas_password_reset')) failures.push('password reset migration is missing');
if (!resetMigration.includes('token_hash text NOT NULL UNIQUE')) failures.push('password reset token hash uniqueness is missing');
const throttleMigration = await readFile('db/migrations/0006_login_throttle.sql', 'utf8');
if (!throttleMigration.includes('CREATE TABLE atlas_login_throttle')) failures.push('login throttle migration is missing');
if (!throttleMigration.includes('principal_hash text PRIMARY KEY')) failures.push('hashed login principal key is missing');
const aiRunMigration = await readFile('db/migrations/0007_ai_run_ledger.sql', 'utf8');
if (!aiRunMigration.includes('CREATE TABLE atlas_ai_run')) failures.push('AI run ledger migration is missing');
if (!aiRunMigration.includes('atlas_ai_run_no_update') || !aiRunMigration.includes('atlas_ai_run_no_delete')) failures.push('AI run append-only triggers are missing');
const conversationMigration = await readFile('db/migrations/0008_ai_conversations.sql', 'utf8');
if (!conversationMigration.includes('CREATE TABLE atlas_ai_conversation') || !conversationMigration.includes('CREATE TABLE atlas_ai_message')) failures.push('AI conversation tables are missing');
if (!conversationMigration.includes('atlas_ai_message_no_update') || !conversationMigration.includes('atlas_ai_message_no_delete')) failures.push('AI message append-only triggers are missing');
const actionMigration = await readFile('db/migrations/0009_ai_action_proposals.sql', 'utf8');
if (!actionMigration.includes('CREATE TABLE atlas_ai_action_proposal')) failures.push('AI action proposal migration is missing');
if (!actionMigration.includes("status='pending'") || !actionMigration.includes("status='approved'") || !actionMigration.includes("status='rejected'")) failures.push('AI action decision constraints are missing');
const draftActionMigration = await readFile('db/migrations/0010_ai_draft_actions.sql', 'utf8');
if (!draftActionMigration.includes("'create_document'") || !draftActionMigration.includes("'draft_email'")) failures.push('AI draft action types are missing');
const intelligenceMigration = await readFile('db/migrations/0011_intelligence_jobs.sql', 'utf8');
if (!intelligenceMigration.includes('CREATE TABLE atlas_intelligence_job') || !intelligenceMigration.includes('atlas_intelligence_job_queue_idx')) failures.push('native intelligence job queue is missing');
const observationMigration = await readFile('db/migrations/0012_intelligence_observations.sql', 'utf8');
if (!observationMigration.includes('CREATE TABLE atlas_intelligence_observation') || !observationMigration.includes('intelligence_job_id')) failures.push('digital twin observation/provenance schema is missing');
const ingestionMigration = await readFile('db/migrations/0013_ingestion_records.sql', 'utf8');
if (!ingestionMigration.includes('CREATE TABLE atlas_ingestion_record') || !ingestionMigration.includes('UNIQUE(workspace_id,connector,external_id)')) failures.push('idempotent ingestion schema is missing');
const cmsMigration = await readFile('db/migrations/0014_cms_coexistence.sql', 'utf8');
for(const table of ['atlas_cms_authorization','atlas_cms_connection','atlas_cms_record_link'])if(!cmsMigration.includes(`CREATE TABLE ${table}`))failures.push(`CMS coexistence migration missing ${table}`);
if(cmsMigration.includes('password'))failures.push('CMS schema must not store provider passwords');
const secretMigration=await readFile('db/migrations/0015_encrypted_secrets.sql','utf8');
if(!secretMigration.includes('CREATE TABLE atlas_encrypted_secret')||!secretMigration.includes('REVOKE ALL'))failures.push('encrypted CMS credential store is missing');
const awarenessMigration=await readFile('db/migrations/0016_situational_awareness.sql','utf8');
for(const table of ['atlas_awareness_item','atlas_awareness_receipt','atlas_automation_marker'])if(!awarenessMigration.includes(`CREATE TABLE ${table}`))failures.push(`situational awareness migration missing ${table}`);
const schedulerLeaseMigration=await readFile('db/migrations/0017_scheduler_leases.sql','utf8');
if(!schedulerLeaseMigration.includes('CREATE TABLE atlas_scheduler_lease')||!schedulerLeaseMigration.includes('expires_at timestamptz NOT NULL'))failures.push('scheduler lease table is missing or incomplete');
const canonicalEventMigration=await readFile('db/migrations/0018_canonical_event_ledger.sql','utf8');
for(const table of ['atlas_canonical_event','atlas_canonical_event_object','atlas_canonical_event_delivery'])if(!canonicalEventMigration.includes(`CREATE TABLE ${table}`))failures.push(`canonical event migration missing ${table}`);
const postgresIntegrityMigration=await readFile('db/migrations/0019_postgres_integrity.sql','utf8');
for(const kind of ['email','phone_call','document'])if(!postgresIntegrityMigration.includes(`'${kind}'`))failures.push(`PostgreSQL ingestion kind missing ${kind}`);
if(!postgresIntegrityMigration.includes('atlas_timeline_no_update')||!postgresIntegrityMigration.includes('atlas_timeline_no_delete'))failures.push('append-only timeline triggers are missing');
const cmsTombstoneMigration=await readFile('db/migrations/0020_cms_tombstones.sql','utf8');
if(!cmsTombstoneMigration.includes('source_deleted_at')||!cmsTombstoneMigration.includes('reconciliation_status'))failures.push('CMS tombstone reconciliation columns are missing');
const professionalRolesMigration=await readFile('db/migrations/0022_professional_roles.sql','utf8');
for(const role of ['attorney','paralegal','billing'])if(!professionalRolesMigration.includes(`'${role}'`))failures.push(`professional membership role missing ${role}`);
const invitationMigration=await readFile('db/migrations/0023_workspace_invitations.sql','utf8');
if(!invitationMigration.includes('CREATE TABLE atlas_workspace_invitation')||!invitationMigration.includes('token_hash text NOT NULL UNIQUE'))failures.push('workspace invitation storage is missing or insecure');
const securityMigration=await readFile('db/migrations/0024_security_controls.sql','utf8');
for(const table of ['atlas_mfa_factor','atlas_security_event'])if(!securityMigration.includes(`CREATE TABLE ${table}`))failures.push(`security control migration missing ${table}`);
if(!securityMigration.includes('atlas_security_event_no_update')||!securityMigration.includes('atlas_security_event_no_delete'))failures.push('security event ledger is not append-only');
const accessSecurityMigration=await readFile('db/migrations/0025_firm_access_security.sql','utf8');
if(!accessSecurityMigration.includes('CREATE TABLE atlas_workspace_security_policy')||!accessSecurityMigration.includes('ADD COLUMN active boolean NOT NULL DEFAULT true'))failures.push('firm access security migration is incomplete');
const documentBlobMigration=await readFile('db/migrations/0026_document_blobs.sql','utf8');
if(!documentBlobMigration.includes('CREATE TABLE atlas_document_blob')||!documentBlobMigration.includes('octet_length(content)')||!documentBlobMigration.includes('REVOKE ALL'))failures.push('shared document blob storage is incomplete');
const documentEmbeddingMigration=await readFile('db/migrations/0027_document_knowledge_embeddings.sql','utf8');
if(!documentEmbeddingMigration.includes('CREATE TABLE atlas_document_knowledge_embedding')||!documentEmbeddingMigration.includes('jsonb_array_length(embedding) = dimensions')||!documentEmbeddingMigration.includes('REVOKE ALL'))failures.push('document knowledge embedding storage is incomplete');
const documentChunkMigration=await readFile('db/migrations/0028_document_knowledge_chunks.sql','utf8');
if(!documentChunkMigration.includes('CREATE TABLE atlas_document_knowledge_chunk')||!documentChunkMigration.includes('jsonb_array_length(embedding) = dimensions')||!documentChunkMigration.includes('REVOKE ALL'))failures.push('encrypted document source-passage storage is incomplete');
const rateLimitMigration=await readFile('db/migrations/0029_request_rate_limits.sql','utf8');
if(!rateLimitMigration.includes('CREATE TABLE atlas_rate_limit_bucket')||!rateLimitMigration.includes('request_count integer NOT NULL')||!rateLimitMigration.includes('REVOKE ALL'))failures.push('distributed request-rate storage is incomplete');
if (!pkg.dependencies?.pg) failures.push('pg runtime dependency is missing');
if (pkg.scripts?.migrate !== 'node scripts/migrate.js') failures.push('standalone migration command is missing');
if (pkg.scripts?.['encrypt-ai-content'] !== 'node scripts/encrypt-ai-content.js') failures.push('AI content encryption migration command is missing');
if (pkg.scripts?.['worker:intelligence'] !== 'node scripts/intelligence-worker.js') failures.push('native intelligence worker command is missing');
if (pkg.scripts?.['backfill:document-knowledge'] !== 'node scripts/backfill-document-knowledge.js') failures.push('document knowledge backfill command is missing');

const dockerfile = await readFile('Dockerfile', 'utf8');
if (!dockerfile.includes('USER node')) failures.push('container does not run as non-root');
if (!dockerfile.includes('HEALTHCHECK')) failures.push('container health check is missing');
const render = await readFile('render.yaml', 'utf8');
if (!render.includes('healthCheckPath: /ready')) failures.push('Render readiness check is missing');
if (!render.includes('preDeployCommand: node scripts/check-launch.js && node scripts/migrate.js')) failures.push('Render launch gate and migration command are missing');
if (!render.includes('FILE_MALWARE_SCANNER') || !render.includes('CLAMAV_HOST')) failures.push('Render malware scanner configuration is missing');
const compose=await readFile('docker-compose.yml','utf8');
if(!compose.includes('clamav/clamav:1.4')||!compose.includes('FILE_MALWARE_SCANNER: clamav'))failures.push('local ClamAV service or scanner configuration is missing');
const fileSecurity=await readFile('src/file-security.js','utf8');
if(!fileSecurity.includes('zINSTREAM\\0')||!fileSecurity.includes('zPING\\0')||!fileSecurity.includes("!== 'PONG'")||!fileSecurity.includes('FILE_SCANNER_UNAVAILABLE')||!fileSecurity.includes('FILE_SIGNATURE_MISMATCH'))failures.push('fail-closed file security adapter or readiness probe is incomplete');
const application=await readFile('src/application.js','utf8');
if(!application.includes('createApplicationReadiness')||!application.includes('fileSecurityScanner.ready()'))failures.push('application readiness does not cover file security');
if(!application.includes('RepositoryRequestRateLimiter'))failures.push('application-wide request-rate protection is missing');
const fileIncidents=await readFile('src/file-security-incidents.js','utf8');
if(!fileIncidents.includes("type:'file.upload_blocked'")||!fileIncidents.includes("category:'security_alert'")||!fileIncidents.includes('createAutomationMarker'))failures.push('blocked-file security awareness is incomplete');

const testFiles = (await readdir('test'))
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => `test/${name}`);
const tests = spawnSync(process.execPath, ['--test', ...testFiles], { encoding: 'utf8' });
process.stdout.write(tests.stdout);
process.stderr.write(tests.stderr);
if (tests.status !== 0) failures.push('test suite failed');

const sourceFiles = (await readdir('src')).filter((name) => name.endsWith('.js')).length;
const databaseTables = migrationTableNames(await loadMigrations('db/migrations')).length;
if (failures.length) {
  console.error(`Verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Verification passed: version ${pkg.version}, ${requiredFiles.length} required files, ${sourceFiles} source modules, ${databaseTables} database tables.`);
