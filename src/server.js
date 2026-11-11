import { spawn } from 'node:child_process';
import { createApp } from './app.js';
import { config, integrationWarnings } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { normalizePhone } from './domain/phone.js';
import { ensureCommentWebhook } from './services/socialPublisher.js';
import { backfillAllSocialPosts } from './services/socialFeed.js';

async function waitForDb() {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

export function pushSchema() {
  if (process.env.SKIP_DB_PUSH === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['prisma', 'db', 'push', '--skip-generate'], {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('prisma db push failed'))));
  });
}

async function seedLocalBroker() {
  if (config.nodeEnv === 'production') return;
  const existing = await prisma.broker.count();
  if (existing > 0) return;
  const phoneNumber = normalizePhone('972501234567');
  await prisma.broker.create({
    data: {
      phoneNumber,
      fullName: 'מתווך הדגמה',
      businessName: 'משרד הדגמה',
    },
  });
  logger.info(`Demo broker created. WhatsApp number ${phoneNumber}. Replace it with npm run broker:add.`);
}

export async function startServer() {
  await pushSchema();
  await waitForDb();
  if (config.autoSeed) {
    const { seed } = await import('../prisma/seed.js');
    await seed();
  } else {
    await seedLocalBroker();
  }
  for (const warning of integrationWarnings()) logger.warn(warning);
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log('OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
    logger.info(`NadlanBot listening on ${config.port}`);
    ensureCommentWebhook().catch((error) => logger.error('comment webhook setup failed', error.message));
    backfillAllSocialPosts().catch((error) => logger.error('social feed backfill failed', error.message));
  });
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 10 * 60 * 1000 + 1000;
  return server;
}
