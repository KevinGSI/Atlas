import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const requiredFiles = [
  'package.json', 'README.md', 'IMPLEMENTATION_STATUS.md', 'docker-compose.yml',
  'src/server.js', 'src/http.js', 'src/service.js', 'src/repository.js',
  'db/migrations/0001_initial.sql', 'test/service.test.js', 'test/http.test.js'
];

const failures = [];
for (const file of requiredFiles) {
  try { await readFile(file); } catch { failures.push(`missing ${file}`); }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '0.1.0') failures.push(`expected version 0.1.0, got ${pkg.version}`);

const migration = await readFile('db/migrations/0001_initial.sql', 'utf8');
for (const table of ['atlas_workspace', 'atlas_object', 'atlas_relationship', 'atlas_timeline_event']) {
  if (!migration.includes(`CREATE TABLE ${table}`)) failures.push(`migration missing ${table}`);
}
if (!migration.trim().endsWith('COMMIT;')) failures.push('migration is not transaction-delimited');

const tests = spawnSync(process.execPath, ['--test'], { encoding: 'utf8' });
process.stdout.write(tests.stdout);
process.stderr.write(tests.stderr);
if (tests.status !== 0) failures.push('test suite failed');

const sourceFiles = (await readdir('src')).filter((name) => name.endsWith('.js')).length;
if (failures.length) {
  console.error(`Verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Verification passed: version ${pkg.version}, ${requiredFiles.length} required files, ${sourceFiles} source modules, 4 database tables.`);
