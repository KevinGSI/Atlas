import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

test('Render Blueprint is valid and wires migrations, readiness, and PostgreSQL', async () => {
  const blueprint = YAML.parse(await readFile('render.yaml', 'utf8'));
  const service = blueprint.services[0];
  assert.equal(service.runtime, 'docker');
  assert.equal(service.preDeployCommand, 'node scripts/check-launch.js && node scripts/migrate.js');
  assert.equal(service.healthCheckPath, '/ready');
  assert.equal(service.envVars.find((item) => item.key === 'DATABASE_URL').fromDatabase.name, 'atlas-postgres');
  assert.equal(service.envVars.find((item) => item.key === 'AUTH_TOKEN_SECRET').generateValue, true);
  assert.equal(service.envVars.find((item)=>item.key==='MFA_ENCRYPTION_KEY').sync,false);
  assert.equal(service.envVars.find((item) => item.key === 'PUBLIC_BASE_URL').sync, false);
  assert.equal(service.envVars.find((item)=>item.key==='AI_PROVIDER').value,'openai');
  assert.equal(service.envVars.find((item)=>item.key==='AI_MODEL').value,'gpt-4.1-mini');
  assert.equal(service.envVars.find((item)=>item.key==='AI_WEB_SEARCH_ENABLED').value,true);
  assert.equal(service.envVars.find((item)=>item.key==='AI_WEB_SEARCH_CONTEXT_SIZE').value,'medium');
  assert.equal(service.envVars.find((item)=>item.key==='OPENAI_API_KEY').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='AI_CONTENT_ENCRYPTION_KEY').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='CMS_CREDENTIAL_ENCRYPTION_KEY').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='CMS_SYNC_ENABLED').value,true);
  assert.equal(service.envVars.find((item)=>item.key==='FILE_MALWARE_SCANNER').value,'clamav');
  assert.equal(service.envVars.find((item)=>item.key==='CLAMAV_HOST').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='GOOGLE_WORKSPACE_CLIENT_ID').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='GOOGLE_WORKSPACE_CLIENT_SECRET').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='MICROSOFT_365_CLIENT_ID').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='MICROSOFT_365_CLIENT_SECRET').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='INGESTION_WEBHOOK_SECRETS').sync,false);
  assert.equal(blueprint.databases[0].name, 'atlas-postgres');
  const worker=blueprint.services.find((item)=>item.type==='worker');
  assert.equal(worker.dockerCommand,'node scripts/intelligence-worker.js');
  assert.equal(worker.envVars.find((item)=>item.key==='DATABASE_URL').fromDatabase.name,'atlas-postgres');
  assert.equal(worker.envVars.find((item)=>item.key==='AI_PROVIDER').value,'openai');
  assert.equal(worker.envVars.find((item)=>item.key==='AI_MODEL').value,'gpt-4.1-mini');
  assert.equal(worker.envVars.find((item)=>item.key==='FILE_MALWARE_SCANNER').value,'clamav');
  assert.equal(worker.envVars.find((item)=>item.key==='CLAMAV_HOST').sync,false);
  const workerSource=await readFile('scripts/intelligence-worker.js','utf8');assert.match(workerSource,/SituationalPlaybookEngine/);
});

test('Docker image is non-root and has a readiness health check', async () => {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/ready/);
});

test('local Docker passes interchangeable AI configuration to the API and native intelligence worker', async () => {
  const compose = YAML.parse(await readFile('docker-compose.yml', 'utf8'));
  for (const name of ['api', 'intelligence-worker']) {
    const environment = compose.services[name].environment;
    assert.equal(environment.AI_PROVIDER, '${AI_PROVIDER:-openai}');
    assert.equal(environment.AI_MODEL, '${AI_MODEL:-gpt-4.1-mini}');
    assert.equal(environment.OPENAI_API_KEY, '${OPENAI_API_KEY:-}');
    assert.equal(environment.AI_CONTENT_ENCRYPTION_KEY, '${AI_CONTENT_ENCRYPTION_KEY:-}');
    assert.equal(environment.MFA_ENCRYPTION_KEY,'${MFA_ENCRYPTION_KEY:-}');
  }
  assert.equal(compose.services.api.environment.AI_WEB_SEARCH_ENABLED, '${AI_WEB_SEARCH_ENABLED:-true}');
  assert.equal(compose.services.api.environment.AI_WEB_SEARCH_CONTEXT_SIZE, '${AI_WEB_SEARCH_CONTEXT_SIZE:-medium}');
  assert.equal(compose.services.api.environment.CMS_SYNC_ENABLED, '${CMS_SYNC_ENABLED:-true}');
  assert.equal(compose.services.api.environment.GOOGLE_WORKSPACE_CLIENT_ID, '${GOOGLE_WORKSPACE_CLIENT_ID:-}');
  assert.equal(compose.services.api.environment.MICROSOFT_365_CLIENT_ID, '${MICROSOFT_365_CLIENT_ID:-}');
  assert.equal(compose.services.api.environment.FILE_MALWARE_SCANNER,'clamav');
  assert.equal(compose.services.api.environment.CLAMAV_HOST,'clamav');
  assert.equal(compose.services.clamav.image,'clamav/clamav:1.4');
  assert.equal(compose.services.api.depends_on.clamav.condition,'service_healthy');
  assert.equal(compose.services['intelligence-worker'].environment.AI_WEB_SEARCH_ENABLED, undefined);
  assert.equal(compose.services['intelligence-worker'].command[1], 'scripts/intelligence-worker.js');
});

test('CI provisions real PostgreSQL and fails closed without its integration URL',async()=>{const workflow=YAML.parse(await readFile('.github/workflows/postgres-integration.yml','utf8'));const job=workflow.jobs['postgres-integration'];assert.equal(job.services.postgres.image,'postgres:16-alpine');assert.match(job.env.TEST_DATABASE_URL,/postgresql:\/\//);assert.match(job.steps.at(-1).run,/pnpm test:postgres/);assert.match(job.steps.at(-1).run,/set -o pipefail/);assert.match(job.steps.at(-1).run,/GITHUB_STEP_SUMMARY/);const harness=await readFile('scripts/test-postgres.js','utf8');assert.match(harness,/TEST_DATABASE_URL is required/);});

test('manual OpenAI evaluation consumes GitHub secrets without embedding them',async()=>{const source=await readFile('.github/workflows/openai-evaluation.yml','utf8');const workflow=YAML.parse(source);const job=workflow.jobs['evaluate-openai'];assert.equal(job.env.AI_PROVIDER,'openai');assert.equal(job.env.AI_MODEL,'gpt-4.1-mini');assert.match(String(job.env.OPENAI_API_KEY),/secrets\.OPENAI_API_KEY/);assert.match(String(job.env.AI_CONTENT_ENCRYPTION_KEY),/secrets\.AI_CONTENT_ENCRYPTION_KEY/);assert.equal(job.steps.at(-1).run,'pnpm test:ai');assert.equal(source.includes('sk-'),false);});

test('manual staging workflow verifies a deployed Atlas URL from GitHub Secrets',async()=>{const source=await readFile('.github/workflows/staging-smoke.yml','utf8');const workflow=YAML.parse(source);const job=workflow.jobs['smoke-test'];assert.match(String(job.env.STAGING_BASE_URL),/secrets\.STAGING_BASE_URL/);assert.equal(job.steps.at(-1).run,'pnpm test:staging');const script=await readFile('scripts/test-staging.js','utf8');assert.match(script,/STAGING_BASE_URL/);});
