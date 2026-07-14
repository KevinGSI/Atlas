import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { startAtlas } from './application.js';

export function loadLocalEnvironment(path = '.env') {
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
}

export async function main(env = process.env, logger = console) {
  const app = await startAtlas(env);
  const address = app.address;
  logger.log(`Atlas Core 0.51.0 listening on http://${address.address}:${address.port}`);
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.log(`Received ${signal}; shutting down`);
    const timeout = setTimeout(() => process.exit(1), app.config.shutdownTimeoutMs);
    timeout.unref();
    try { await app.stop(); clearTimeout(timeout); }
    catch (error) { logger.error(error); process.exitCode = 1; }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadLocalEnvironment();
  main().catch((error) => { console.error(error); process.exit(1); });
}
