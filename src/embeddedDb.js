import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { logger } from './logger.js';

const PORT = Number(process.env.LOCAL_PG_PORT || 5433);
const USER = 'nadlan';
const PASSWORD = 'nadlan';
const DATABASE = 'nadlanbot';

export function localDatabaseUrl() {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}?schema=public`;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

let starting;

export async function startEmbeddedPostgres() {
  if (starting) return starting;
  starting = start().catch((error) => {
    starting = null;
    throw error;
  });
  return starting;
}

async function start() {
  const url = localDatabaseUrl();
  const databaseDir = path.join(process.cwd(), '.pgdata');
  if (await portOpen(PORT)) {
    logger.info(`PostgreSQL is already listening on ${PORT}`);
    return { url, stop: async () => {} };
  }

  const imported = await import('embedded-postgres');
  const EmbeddedPostgres = imported.default;
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  const initialized = fs.existsSync(path.join(databaseDir, 'PG_VERSION'));
  if (!initialized) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(DATABASE);
  } catch (error) {
    const message = String(error?.message || error);
    if (!/already exists/i.test(message)) throw error;
  }
  logger.info(`Embedded PostgreSQL ready on ${PORT}`);
  return {
    url,
    stop: async () => {
      await pg.stop();
    },
  };
}
