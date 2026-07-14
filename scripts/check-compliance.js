import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { evaluateComplianceAssurance } from '../src/compliance-assurance.js';

if (existsSync('.env')) loadEnvFile('.env');
const assurance = evaluateComplianceAssurance(
  { ...process.env, NODE_ENV: 'production' },
  { technicalReady: true }
);
console.log(JSON.stringify(assurance, null, 2));
if (!assurance.ready) process.exit(1);

