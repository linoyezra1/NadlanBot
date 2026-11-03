import { startEmbeddedPostgres } from './embeddedDb.js';

export async function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, stop: async () => {}, embedded: false };
  }
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error('DATABASE_URL is required in production.');
  }
  const started = await startEmbeddedPostgres();
  process.env.DATABASE_URL = started.url;
  return { url: started.url, stop: started.stop, embedded: true };
}
