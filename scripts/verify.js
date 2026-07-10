import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const requiredFiles = [
  'package.json', 'pnpm-lock.yaml', 'README.md', 'IMPLEMENTATION_STATUS.md', 'docker-compose.yml',
  'Dockerfile', '.dockerignore', 'render.yaml', 'src/server.js', 'src/application.js', 'src/config.js',
  'src/http.js', 'src/service.js', 'src/repository.js',
  'src/postgres-repository.js', 'src/migrations.js', 'src/runtime.js',
  'db/migrations/0001_initial.sql', 'test/service.test.js', 'test/http.test.js',
  'test/postgres-repository.test.js', 'test/migrations.test.js', 'test/config.test.js', 'test/runtime.test.js',
  'test/deployment.test.js'
];

const failures = [];
for (const file of requiredFiles) {
  try { await readFile(file); } catch { failures.push(`missing ${file}`); }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '0.3.0') failures.push(`expected version 0.3.0, got ${pkg.version}`);

const migration = await readFile('db/migrations/0001_initial.sql', 'utf8');
for (const table of ['atlas_workspace', 'atlas_object', 'atlas_relationship', 'atlas_timeline_event']) {
  if (!migration.includes(`CREATE TABLE ${table}`)) failures.push(`migration missing ${table}`);
}
if (!pkg.dependencies?.pg) failures.push('pg runtime dependency is missing');
if (pkg.scripts?.migrate !== 'node scripts/migrate.js') failures.push('standalone migration command is missing');

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
console.log(`Verification passed: version ${pkg.version}, ${requiredFiles.length} required files, ${sourceFiles} source modules, 4 database tables.`);
