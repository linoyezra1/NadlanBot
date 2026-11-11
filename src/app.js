import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { integrationStatus } from './config.js';
import { pageTiming, prisma } from './db.js';
import { uploadsDir } from './services/storage.js';
import adminRouter from './routes/admin.js';
import crmRouter from './routes/crm.js';
import socialWebhookRouter from './routes/socialWebhook.js';
import webhookRouter from './routes/webhook.js';
import whatsappConnectRouter from './routes/whatsappConnect.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use('/webhook', webhookRouter);
  app.use('/social-webhook', socialWebhookRouter);
  app.use('/social', socialWebhookRouter);
  app.use(whatsappConnectRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use('/media', express.static(uploadsDir(), { index: false, fallthrough: false }));
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public')));
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: true, ...integrationStatus() });
    } catch (error) {
      res.status(503).json({ ok: false, db: false, error: error.message });
    }
  });
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.path.startsWith('/b/')) return next();
    const timing = { db: 0, started: Date.now() };
    res.on('finish', () => {
      const total = Date.now() - timing.started;
      console.log('page', req.method, req.path, 'db', timing.db, 'ms', 'render', Math.max(0, total - timing.db), 'ms', 'total', total, 'ms');
    });
    pageTiming.run(timing, () => next());
  });
  app.use(crmRouter);
  app.use(adminRouter);
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ error: status === 403 ? 'forbidden' : 'error' });
  });
  return app;
}
