import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

test('Render Blueprint is valid and wires migrations, readiness, and PostgreSQL', async () => {
  const blueprint = YAML.parse(await readFile('render.yaml', 'utf8'));
  const service = blueprint.services[0];
  assert.equal(service.runtime, 'docker');
  assert.equal(service.preDeployCommand, 'node scripts/migrate.js');
  assert.equal(service.healthCheckPath, '/ready');
  assert.equal(service.envVars.find((item) => item.key === 'DATABASE_URL').fromDatabase.name, 'atlas-postgres');
  assert.equal(service.envVars.find((item) => item.key === 'AUTH_TOKEN_SECRET').generateValue, true);
  assert.equal(service.envVars.find((item)=>item.key==='AI_PROVIDER').value,'openai');
  assert.equal(service.envVars.find((item)=>item.key==='AI_MODEL').value,'gpt-5.6-sol');
  assert.equal(service.envVars.find((item)=>item.key==='OPENAI_API_KEY').sync,false);
  assert.equal(service.envVars.find((item)=>item.key==='AI_CONTENT_ENCRYPTION_KEY').sync,false);
  assert.equal(blueprint.databases[0].name, 'atlas-postgres');
  const worker=blueprint.services.find((item)=>item.type==='worker');
  assert.equal(worker.dockerCommand,'node scripts/intelligence-worker.js');
  assert.equal(worker.envVars.find((item)=>item.key==='DATABASE_URL').fromDatabase.name,'atlas-postgres');
  assert.equal(worker.envVars.find((item)=>item.key==='AI_PROVIDER').value,'openai');
  assert.equal(worker.envVars.find((item)=>item.key==='AI_MODEL').value,'gpt-5.6-sol');
  const workerSource=await readFile('scripts/intelligence-worker.js','utf8');assert.match(workerSource,/SituationalPlaybookEngine/);
});

test('Docker image is non-root and has a readiness health check', async () => {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/ready/);
});

test('CI provisions real PostgreSQL and fails closed without its integration URL',async()=>{const workflow=YAML.parse(await readFile('.github/workflows/postgres-integration.yml','utf8'));const job=workflow.jobs['postgres-integration'];assert.equal(job.services.postgres.image,'postgres:16-alpine');assert.match(job.env.TEST_DATABASE_URL,/postgresql:\/\//);assert.equal(job.steps.at(-1).run,'pnpm test:postgres');const harness=await readFile('scripts/test-postgres.js','utf8');assert.match(harness,/TEST_DATABASE_URL is required/);});

test('manual OpenAI evaluation consumes GitHub secrets without embedding them',async()=>{const source=await readFile('.github/workflows/openai-evaluation.yml','utf8');const workflow=YAML.parse(source);const job=workflow.jobs['evaluate-openai'];assert.equal(job.env.AI_PROVIDER,'openai');assert.equal(job.env.AI_MODEL,'gpt-5.6-sol');assert.match(String(job.env.OPENAI_API_KEY),/secrets\.OPENAI_API_KEY/);assert.match(String(job.env.AI_CONTENT_ENCRYPTION_KEY),/secrets\.AI_CONTENT_ENCRYPTION_KEY/);assert.equal(job.steps.at(-1).run,'pnpm test:ai');assert.equal(source.includes('sk-'),false);});
