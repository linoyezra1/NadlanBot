import { ensureDatabaseUrl } from './ensureDatabaseUrl.js';
import { logger } from './logger.js';

const database = await ensureDatabaseUrl();
const { startServer } = await import('./server.js');

let server;
try {
  server = await startServer();
} catch (error) {
  logger.error(error);
  await database.stop?.();
  process.exit(1);
}

async function shutdown() {
  server?.close();
  await database.stop?.();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
