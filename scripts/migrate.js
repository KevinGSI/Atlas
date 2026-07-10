import { createPostgresRuntime } from '../src/runtime.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const runtime = await createPostgresRuntime(process.env, { migrate: true });
await runtime.close();
console.log('Atlas database migrations completed');
