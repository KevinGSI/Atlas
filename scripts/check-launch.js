import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { evaluateLaunchReadiness } from './launch-readiness.js';

if (existsSync('.env')) loadEnvFile('.env');
const result = evaluateLaunchReadiness(process.env);
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exit(1);
