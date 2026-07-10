import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { createContentCipher } from '../src/content-security.js';
import { migrateAiContent } from '../src/ai-content-migration.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const config = loadConfig(process.env);
if (!config.aiContentEncryptionKeys) throw new Error('An AI content encryption key is required');
const apply = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await migrateAiContent(pool, createContentCipher(config), { apply });
  console.log(JSON.stringify(result));
  if (!apply) console.log('Dry run only. Back up the database, then rerun with --apply.');
} finally { await pool.end(); }
