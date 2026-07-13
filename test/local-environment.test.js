import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnvironment } from '../src/server.js';

test('local start loads untracked environment values when an env file exists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-local-env-'));
  const path = join(directory, '.env');
  const name = `ATLAS_LOCAL_ENV_TEST_${Date.now()}`;
  try {
    await writeFile(path, `${name}=loaded\n`);
    assert.equal(loadLocalEnvironment(path), true);
    assert.equal(process.env[name], 'loaded');
  } finally {
    delete process.env[name];
    await rm(directory, { recursive: true, force: true });
  }
});

test('local start continues without an env file', () => {
  assert.equal(loadLocalEnvironment(join(tmpdir(), 'atlas-env-does-not-exist')), false);
});
