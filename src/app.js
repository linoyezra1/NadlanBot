import express from 'express';
import { config, integrationStatus } from './config.js';
import { prisma } from './db.js';
import { uploadsDir } from './services/storage.js';
import adminRouter from './routes/admin.js';
import webhookRouter from './routes/webhook.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use('/webhook', webhookRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use('/media', express.static(uploadsDir(), { index: false, fallthrough: false }));
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: true, ...integrationStatus() });
    } catch (error) {
      res.status(503).json({ ok: false, db: false, error: error.message });
    }
  });
  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NadlanBot</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 16px">
<h1>NadlanBot</h1>
<p>בוט וואטסאפ לקליטת נכסים, מענה למתעניינים והפצה לפייסבוק, אינסטגרם וטיקטוק.</p>
<p>כתובת ה-Webhook: <code>${config.publicBaseUrl}/webhook</code></p>
<p><a href="/admin">לוח תפעול</a> · <a href="/health">בריאות המערכת</a></p>
</body></html>`);
  });
  app.use(adminRouter);
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ error: status === 403 ? 'forbidden' : 'error' });
  });
  return app;
}
