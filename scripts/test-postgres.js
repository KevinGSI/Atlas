import { spawnSync } from 'node:child_process';

if(!process.env.TEST_DATABASE_URL){console.error('TEST_DATABASE_URL is required for live PostgreSQL integration testing');process.exit(1);}
const result=spawnSync(process.execPath,['--test','test/live-postgres.test.js'],{stdio:'inherit',env:process.env});process.exit(result.status??1);
