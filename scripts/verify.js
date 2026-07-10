import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const requiredFiles = [
  'package.json', 'pnpm-lock.yaml', 'README.md', 'IMPLEMENTATION_STATUS.md', '.env.example', 'docker-compose.yml',
  'Dockerfile', '.dockerignore', 'render.yaml', 'src/server.js', 'src/application.js', 'src/config.js',
  'src/http.js', 'src/service.js', 'src/repository.js', 'src/identity.js', 'src/assistant.js', 'src/ai-providers.js', 'src/ai-evaluation.js', 'src/staging-smoke.js', 'src/content-security.js', 'src/ai-content-migration.js', 'src/intelligence.js', 'src/intelligence-projection.js', 'src/ingestion.js', 'src/webhook-security.js', 'src/resolution.js', 'src/cms-connectors.js', 'src/cms-provider-adapters.js', 'src/situational-awareness.js', 'src/phase-one-web.js', 'web/phase-one/index.html', 'web/phase-one/app.js', 'docs/NATIVE_INTELLIGENCE_CONSTITUTION.md', 'docs/NATIVE_INTELLIGENCE_VERIFICATION.md',
  'src/postgres-repository.js', 'src/migrations.js', 'src/runtime.js',
  'db/migrations/0001_initial.sql', 'db/migrations/0002_identity.sql', 'db/migrations/0003_object_audit.sql', 'db/migrations/0004_refresh_sessions.sql', 'db/migrations/0005_password_reset.sql', 'db/migrations/0006_login_throttle.sql', 'db/migrations/0007_ai_run_ledger.sql', 'db/migrations/0008_ai_conversations.sql', 'db/migrations/0009_ai_action_proposals.sql', 'db/migrations/0010_ai_draft_actions.sql', 'db/migrations/0011_intelligence_jobs.sql', 'db/migrations/0012_intelligence_observations.sql', 'db/migrations/0013_ingestion_records.sql', 'db/migrations/0014_cms_coexistence.sql', 'db/migrations/0015_encrypted_secrets.sql', 'db/migrations/0016_situational_awareness.sql', 'test/service.test.js', 'test/http.test.js',
  'test/postgres-repository.test.js', 'test/migrations.test.js', 'test/config.test.js', 'test/runtime.test.js',
  'test/deployment.test.js', 'test/staging-smoke.test.js', 'test/live-postgres.test.js', 'test/identity.test.js', 'test/assistant.test.js', 'test/ai-providers.test.js', 'test/ai-evaluation.test.js', 'test/content-security.test.js', 'test/ai-content-migration.test.js', 'test/intelligence.test.js', 'test/ingestion.test.js', 'test/webhook-security.test.js', 'test/resolution.test.js', 'test/architecture.test.js', 'test/cms-connectors.test.js', 'test/situational-awareness.test.js', 'scripts/encrypt-ai-content.js', 'scripts/intelligence-worker.js', 'scripts/test-postgres.js', 'scripts/test-ai-provider.js', 'scripts/test-staging.js', '.github/workflows/postgres-integration.yml', '.github/workflows/openai-evaluation.yml', '.github/workflows/staging-smoke.yml'
];

const failures = [];
for (const file of requiredFiles) {
  try { await readFile(file); } catch { failures.push(`missing ${file}`); }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '0.29.0') failures.push(`expected version 0.29.0, got ${pkg.version}`);

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
if (!pkg.dependencies?.pg) failures.push('pg runtime dependency is missing');
if (pkg.scripts?.migrate !== 'node scripts/migrate.js') failures.push('standalone migration command is missing');
if (pkg.scripts?.['encrypt-ai-content'] !== 'node scripts/encrypt-ai-content.js') failures.push('AI content encryption migration command is missing');
if (pkg.scripts?.['worker:intelligence'] !== 'node scripts/intelligence-worker.js') failures.push('native intelligence worker command is missing');

const dockerfile = await readFile('Dockerfile', 'utf8');
if (!dockerfile.includes('USER node')) failures.push('container does not run as non-root');
if (!dockerfile.includes('HEALTHCHECK')) failures.push('container health check is missing');
const render = await readFile('render.yaml', 'utf8');
if (!render.includes('healthCheckPath: /ready')) failures.push('Render readiness check is missing');
if (!render.includes('preDeployCommand: node scripts/migrate.js')) failures.push('Render migration command is missing');

const testFiles = (await readdir('test'))
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => `test/${name}`);
const tests = spawnSync(process.execPath, ['--test', ...testFiles], { encoding: 'utf8' });
process.stdout.write(tests.stdout);
process.stderr.write(tests.stderr);
if (tests.status !== 0) failures.push('test suite failed');

const sourceFiles = (await readdir('src')).filter((name) => name.endsWith('.js')).length;
if (failures.length) {
  console.error(`Verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Verification passed: version ${pkg.version}, ${requiredFiles.length} required files, ${sourceFiles} source modules, 24 database tables.`);
