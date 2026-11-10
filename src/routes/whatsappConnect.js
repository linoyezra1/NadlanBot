import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { normalizePhone } from '../domain/phone.js';
import { logger } from '../logger.js';
import { prisma } from '../db.js';
import { parseMetaWebhook } from '../services/metaWebhook.js';
import { deliverResult } from '../services/deliverAll.js';
import { handleIncoming } from '../services/router.js';
import { pauseLeadChat } from '../services/whatsappMode.js';
import { connectBrokerWhatsApp } from '../services/whatsappConnect.js';
import { deletionStatus, parseSignedRequest, rememberDeletion } from '../services/facebookSignedRequest.js';

const router = express.Router();

export function signaturesMatch(secret, rawBody, header) {
  if (!secret || !header || rawBody == null) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const actual = Buffer.from(String(header));
  const exp = Buffer.from(expected);
  if (actual.length !== exp.length) return false;
  return crypto.timingSafeEqual(exp, actual);
}

router.get('/meta-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === config.metaWebhookVerifyToken) {
    res.status(200).send(String(challenge || ''));
    return;
  }
  res.sendStatus(403);
});

router.post('/meta-webhook', express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}), (req, res) => {
  if (config.metaAppSecret) {
    const header = req.get('x-hub-signature-256') || '';
    if (!signaturesMatch(config.metaAppSecret, req.rawBody, header)) {
      logger.warn('meta webhook rejected');
      return res.sendStatus(401);
    }
  } else if (config.nodeEnv === 'production') {
    return res.sendStatus(401);
  }
  const events = parseMetaWebhook(req.body || {});
  res.sendStatus(200);
  for (const item of events) {
    handleMetaEvent(item).catch((error) => logger.error('meta webhook failed', error));
  }
  return undefined;
});

async function handleMetaEvent(item) {
  const broker = await prisma.broker.findFirst({
    where: {
      whatsappNumberId: item.phoneNumberId,
      whatsappMode: 'DIRECT_COEXISTENCE',
      isWhatsAppConnected: true,
    },
  });
  if (!broker) return;
  if (item.kind === 'echo') {
    const customer = normalizePhone(item.to);
    if (customer) await pauseLeadChat(customer, broker.id);
    return;
  }
  const from = normalizePhone(item.from);
  if (!from || (!item.text && !item.media)) return;
  const event = {
    messageId: item.messageId,
    from,
    name: item.name,
    type: item.buttonId ? 'button' : (item.media?.kind || 'text'),
    text: item.text,
    buttonId: item.buttonId,
    media: item.media,
    channel: 'meta',
    brokerId: broker.id,
    meta: {
      phoneNumberId: broker.whatsappNumberId,
      accessToken: broker.whatsappAccessToken,
    },
  };
  const result = await handleIncoming(event);
  await deliverResult(event, result);
}

router.get('/connect', async (req, res) => {
  const brokerId = String(req.query.brokerId || '');
  const broker = brokerId ? await prisma.broker.findUnique({ where: { id: brokerId } }) : null;
  res.type('html').send(connectPage({
    appId: config.metaAppId,
    configId: config.metaEmbeddedConfigId,
    brokerId: broker?.id || '',
    ready: Boolean(broker && config.metaAppId && config.metaEmbeddedConfigId),
  }));
});

const facebookForm = express.urlencoded({ extended: false });

function facebookUser(req) {
  const signed = req.body?.signed_request;
  if (!signed) return null;
  return parseSignedRequest(signed, config.metaAppSecret);
}

router.get('/api/auth/facebook/deauthorize', (_req, res) => {
  res.type('html').send(facebookStatusPage('ביטול החיבור', 'הכתובת פעילה. Meta שולחת לכאן בקשה כשמסירים את NadlanBot.'));
});

router.post('/api/auth/facebook/deauthorize', facebookForm, (req, res) => {
  if (req.body?.signed_request && !facebookUser(req)) {
    res.sendStatus(400);
    return;
  }
  res.sendStatus(200);
});

router.post('/api/auth/facebook/delete-data', facebookForm, (req, res) => {
  const user = facebookUser(req);
  if (!user) {
    res.sendStatus(400);
    return;
  }
  const code = rememberDeletion(user.user_id);
  res.json({
    url: `${config.publicBaseUrl}/api/auth/facebook/delete-data?code=${encodeURIComponent(code)}`,
    confirmation_code: code,
  });
});

router.get('/api/auth/facebook/delete-data', (req, res) => {
  const code = String(req.query.code || '');
  const found = code && deletionStatus(code);
  const text = found
    ? `הבקשה ${code} הושלמה. NadlanBot לא שומר פרופיל פייסבוק נפרד.`
    : 'הכתובת פעילה. אחרי בקשת מחיקה Meta מפנה לכאן עם קוד אישור.';
  res.type('html').send(facebookStatusPage('מחיקת נתונים', text));
});

router.post('/api/whatsapp/connect-callback', express.json({ limit: '100kb' }), async (req, res) => {
  try {
    const broker = await connectBrokerWhatsApp({
      code: req.body?.code,
      brokerId: req.body?.brokerId,
      wabaId: req.body?.wabaId,
      phoneNumberId: req.body?.phoneNumberId,
    });
    res.json({ ok: true, brokerId: broker.id, connected: true });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || 'החיבור נכשל' });
  }
});

function facebookStatusPage(title, text) {
  const escape = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>${escape(title)}</title><body style="font-family:Segoe UI,Arial,sans-serif"><h1>${escape(title)}</h1><p>${escape(text)}</p></body></html>`;
}

function connectPage({ appId, configId, brokerId, ready }) {
  const payload = JSON.stringify({ appId, configId, brokerId, ready }).replace(/</g, '\\u003c');
  const close = '<' + '/script>';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>חיבור וואטסאפ עסקי</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f1ea; font-family: "Segoe UI", Arial, sans-serif; color: #1d1a16; }
    main { width: min(440px, calc(100% - 32px)); background: white; border-radius: 24px; padding: 28px; }
    button { font: inherit; background: #1f6b4a; color: white; border: 0; border-radius: 999px; padding: 12px 18px; cursor: pointer; }
    p { color: #665f56; line-height: 1.5; }
  </style>
</head>
<body>
<main>
  <h1>חיבור וואטסאפ עסקי</h1>
  <p>האפליקציה בנייד נשארת פעילה. הבוט עונה ללקוחות על אותו מספר, ונעצר ל־24 שעות אחרי שאתה כותב מהטלפון.</p>
  <button id="connect" type="button">חבר את ה-WhatsApp העסקי שלך ל-NadlanBot</button>
  <p id="status"></p>
</main>
<script>
  const setup = ${payload};
  if (window.location.search) history.replaceState(null, '', window.location.pathname);
  let sessionInfo = {};
  window.addEventListener('message', (event) => {
    if (!String(event.origin || '').endsWith('facebook.com')) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data && data.type === 'WA_EMBEDDED_SIGNUP' && data.data) sessionInfo = data.data;
    } catch (error) {}
  });
  window.fbAsyncInit = function () {
    FB.init({ appId: setup.appId, cookie: true, xfbml: false, version: 'v21.0' });
  };
  document.getElementById('connect').addEventListener('click', () => {
    const status = document.getElementById('status');
    if (!setup.ready) {
      status.textContent = 'חיבור Meta עדיין לא מוגדר בשרת.';
      return;
    }
    const options = {
      config_id: setup.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding' }
    };
    FB.login(function (response) {
      if (!(response.authResponse && response.authResponse.code)) {
        status.textContent = 'החיבור בוטל.';
        return;
      }
      fetch('/api/whatsapp/connect-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: response.authResponse.code,
          brokerId: setup.brokerId,
          wabaId: sessionInfo.waba_id || '',
          phoneNumberId: sessionInfo.phone_number_id || ''
        })
      }).then((res) => res.json()).then((data) => {
        if (!data.ok) {
          status.textContent = data.error || 'החיבור נכשל';
          return;
        }
        alert('החיבור הושלם בהצלחה! אפליקציית הוואטסאפ נשארת פעילה כרגיל בנייד שלך.');
        window.close();
      }).catch(() => {
        status.textContent = 'החיבור נכשל';
      });
    }, options);
  });
${close}
<script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js">${close}
</body>
</html>`;
}

export default router;
