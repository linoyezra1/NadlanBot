import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { integrationStatus } from './config.js';
import { prisma } from './db.js';
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
  app.use(crmRouter);
  app.use(adminRouter);
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ error: status === 403 ? 'forbidden' : 'error' });
  });
  return app;
}
