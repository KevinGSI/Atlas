import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const requiredFiles = [
  'package.json', 'pnpm-lock.yaml', 'README.md', 'IMPLEMENTATION_STATUS.md', 'docker-compose.yml',
  'src/server.js', 'src/http.js', 'src/service.js', 'src/repository.js',
  'src/postgres-repository.js', 'src/migrations.js', 'src/runtime.js',
  'db/migrations/0001_initial.sql', 'test/service.test.js', 'test/http.test.js',
  'test/postgres-repository.test.js', 'test/migrations.test.js'
];

const failures = [];
for (const file of requiredFiles) {
  try { await readFile(file); } catch { failures.push(`missing ${file}`); }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '0.2.0') failures.push(`expected version 0.2.0, got ${pkg.version}`);

const migration = await readFile('db/migrations/0001_initial.sql', 'utf8');
for (const table of ['atlas_workspace', 'atlas_object', 'atlas_relationship', 'atlas_timeline_event']) {
  if (!migration.includes(`CREATE TABLE ${table}`)) failures.push(`migration missing ${table}`);
}
if (!pkg.dependencies?.pg) failures.push('pg runtime dependency is missing');

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
