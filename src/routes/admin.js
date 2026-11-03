import express from 'express';
import crypto from 'node:crypto';
import { config, integrationStatus } from '../config.js';
import { normalizePhone } from '../domain/phone.js';
import { prisma } from '../db.js';
import { deliverResult } from '../services/deliverAll.js';
import { handleIncoming } from '../services/router.js';

const router = express.Router();

function allowed(req) {
  if (!config.adminToken) return config.nodeEnv !== 'production';
  const presented = req.get('x-admin-token') || req.query.token || req.body?.token;
  return presented === config.adminToken;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function bubble(reply) {
  if (reply.type === 'image' || reply.type === 'video') {
    return `<p class="bot">${reply.type === 'video' ? 'סרטון' : 'תמונה'}: ${escapeHtml(reply.caption || reply.url)}</p>`;
  }
  return `<p class="bot">${escapeHtml(reply.text || '')}</p>`;
}

async function render(token, result) {
  const [brokers, properties, conversations, publications] = await Promise.all([
    prisma.broker.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.property.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { owner: true, _count: { select: { media: true } } } }),
    prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' }, take: 20, include: { property: true } }),
    prisma.publication.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { property: true } }),
  ]);
  const status = integrationStatus();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  const resultHtml = result ? `
    <section>
      <h2>תשובת הבוט</h2>
      ${(result.replies || []).map(bubble).join('') || '<p>אין תשובה</p>'}
      ${(result.notifications || []).map((note) => `<p class="hot">נשלח אל ${escapeHtml(note.to)}: ${escapeHtml((note.replies || []).map((reply) => reply.text).join('\n'))}</p>`).join('')}
    </section>` : '';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>לוח תפעול · NadlanBot</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #f4f1ea; color: #1d1a16; }
    main { max-width: 980px; margin: 0 auto; padding: 24px; }
    h1 { margin-bottom: 4px; }
    .muted { color: #665f56; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .card, section, form { background: white; border-radius: 14px; padding: 16px; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; }
    td, th { text-align: right; padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
    input, textarea, button { font: inherit; width: 100%; box-sizing: border-box; margin-top: 6px; }
    textarea { min-height: 90px; }
    button { width: auto; background: #1f6b4a; color: white; border: 0; border-radius: 999px; padding: 8px 16px; }
    .bot, .hot { white-space: pre-wrap; background: #eef6f1; border-radius: 12px; padding: 10px; }
    .hot { background: #fff4e8; }
    .private { color: #8a5a00; }
  </style>
</head>
<body>
<main>
  <h1>לוח תפעול</h1>
  <p class="muted">הממשק של המתווך הוא וואטסאפ. המסך הזה מיועד לבדיקה ולמעקב.</p>
  <div class="grid">
    <div class="card">וואטסאפ: ${status.whatsapp ? 'מחובר' : 'לא מוגדר'}</div>
    <div class="card">OpenAI: ${status.openai ? 'מחובר' : 'מצב גיבוי'}</div>
    <div class="card">אחסון: ${escapeHtml(status.storage)}</div>
    <div class="card">פייסבוק: ${status.metaPage ? 'מחובר' : 'לא מוגדר'}</div>
    <div class="card">אינסטגרם: ${status.instagram ? 'מחובר' : 'לא מוגדר'}</div>
    <div class="card">טיקטוק: ${status.tiktok ? 'מחובר' : 'לא מוגדר'}</div>
  </div>
  <form method="post" action="/admin/try${tokenQuery}">
    <h2>שיחת ניסיון</h2>
    <label>טלפון<input name="from" value="972501234567" required></label>
    <label>הודעה<textarea name="text" placeholder="דירה חדשה"></textarea></label>
    <label>קישור מדיה לבדיקה<input name="mediaUrl" placeholder="https://example.com/kitchen.jpg"></label>
    <label>כיתוב מדיה<input name="caption" placeholder="מטבח"></label>
    ${token ? `<input type="hidden" name="token" value="${escapeHtml(token)}">` : ''}
    <button type="submit">שליחה</button>
  </form>
  ${resultHtml}
  <section>
    <h2>מתווכים</h2>
    <table><tr><th>שם</th><th>טלפון</th><th>סטטוס</th></tr>
    ${brokers.map((broker) => `<tr><td>${escapeHtml(broker.fullName)}</td><td>${escapeHtml(broker.phoneNumber)}</td><td>${escapeHtml(broker.status)}</td></tr>`).join('') || '<tr><td colspan="3">אין מתווכים</td></tr>'}
    </table>
  </section>
  <section>
    <h2>נכסים</h2>
    <table><tr><th>קוד</th><th>כתובת</th><th>מחיר</th><th>מדיה</th><th>בעלים חסוי</th></tr>
    ${properties.map((property) => `<tr><td>${escapeHtml(property.code)}</td><td>${escapeHtml([property.address, property.city].filter(Boolean).join(', '))}</td><td>${property.price ?? ''}</td><td>${property._count.media}</td><td class="private">${escapeHtml(property.owner?.ownerName || '—')}</td></tr>`).join('') || '<tr><td colspan="5">אין נכסים</td></tr>'}
    </table>
  </section>
  <section>
    <h2>שיחות אחרונות</h2>
    <table><tr><th>תפקיד</th><th>טלפון</th><th>נכס</th><th>סטטוס</th><th>שלב</th></tr>
    ${conversations.map((conversation) => `<tr><td>${escapeHtml(conversation.role)}</td><td>${escapeHtml(conversation.leadPhone || conversation.brokerPhone || '')}</td><td>${escapeHtml(conversation.property?.code || '')}</td><td>${escapeHtml(conversation.status)}</td><td>${escapeHtml(conversation.flowStep)}</td></tr>`).join('') || '<tr><td colspan="5">אין שיחות</td></tr>'}
    </table>
  </section>
  <section>
    <h2>פרסומים</h2>
    <table><tr><th>נכס</th><th>ערוץ</th><th>סטטוס</th><th>פירוט</th></tr>
    ${publications.map((item) => `<tr><td>${escapeHtml(item.property?.code || '')}</td><td>${escapeHtml(item.platform)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.error || item.postUrl || '')}</td></tr>`).join('') || '<tr><td colspan="4">אין פרסומים</td></tr>'}
    </table>
  </section>
</main>
</body>
</html>`;
}

router.get('/admin', async (req, res, next) => {
  try {
    if (!allowed(req)) return res.status(403).send('forbidden');
    res.type('html').send(await render(req.query.token || config.adminToken || '', null));
  } catch (error) {
    next(error);
  }
  return undefined;
});

router.post('/admin/try', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    if (!allowed(req)) return res.status(403).send('forbidden');
    const event = {
      messageId: `admin-${crypto.randomUUID()}`,
      from: normalizePhone(req.body.from),
      name: 'בדיקה',
      type: req.body.mediaUrl ? 'image' : 'text',
      text: req.body.text || '',
      buttonId: null,
      media: req.body.mediaUrl ? { kind: 'image', id: null, url: req.body.mediaUrl, caption: req.body.caption || '', mimeType: null, filename: null } : null,
    };
    const result = await handleIncoming(event);
    await deliverResult(event, result);
    res.type('html').send(await render(req.body.token || req.query.token || '', result));
  } catch (error) {
    next(error);
  }
  return undefined;
});

router.post('/simulate', async (req, res, next) => {
  try {
    if (!allowed(req)) return res.status(403).json({ error: 'forbidden' });
    const from = normalizePhone(req.body.from);
    if (!from) return res.status(400).json({ error: 'from is required' });
    const event = {
      messageId: req.body.messageId || `sim-${crypto.randomUUID()}`,
      from,
      name: req.body.name || '',
      type: req.body.media?.kind || req.body.media?.type || 'text',
      text: req.body.text || req.body.media?.caption || '',
      buttonId: req.body.buttonId || null,
      media: req.body.media ? {
        kind: req.body.media.kind || req.body.media.type,
        id: req.body.media.id || null,
        url: req.body.media.url || null,
        mimeType: req.body.media.mimeType || null,
        caption: req.body.media.caption || '',
        filename: req.body.media.filename || null,
      } : null,
    };
    const result = await handleIncoming(event);
    await deliverResult(event, result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
