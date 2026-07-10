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
  assert.equal(blueprint.databases[0].name, 'atlas-postgres');
});

test('Docker image is non-root and has a readiness health check', async () => {
  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/ready/);
});
