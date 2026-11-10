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
import { mobileOAuthUrl } from '../domain/whatsappOAuth.js';
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
    version: config.graphVersion || 'v21.0',
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

router.get('/privacy', (_req, res) => {
  res.type('html').send(privacyPage());
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
      redirectUri: req.body?.redirectUri,
    });
    res.json({ ok: true, brokerId: broker.id, connected: true });
  } catch (error) {
    logger.error('whatsapp connect failed', error.message);
    res.status(error.status || 400).json({ error: error.message || 'החיבור נכשל' });
  }
});

function privacyPage() {
  const base = config.publicBaseUrl || '';
  const deletion = `${base}/api/auth/facebook/delete-data`;
  const digits = String(config.whatsappDisplayNumber || '').replace(/\D/g, '');
  const contact = digits
    ? `<a href="https://wa.me/${digits}">וואטסאפ ${digits}</a>`
    : 'השיחה בוואטסאפ מול NadlanBot';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>מדיניות פרטיות · NadlanBot</title>
  <link rel="stylesheet" href="/crm.css">
</head>
<body class="connect-screen">
<main class="connect-card privacy">
  <h1>מדיניות פרטיות</h1>
  <p>NadlanBot מפעילה עוזר וואטסאפ למתווכי נדל״ן: קליטת נכסים, פרסום לפי בקשת המתווך, ומענה ללקוחות שפונים על דירה.</p>
  <h2>איזה מידע נשמר</h2>
  <p>כדי לנהל שיחה וליד נשמרים מספר הטלפון, שם אם נמסר, תוכן ההודעות, והנכס שעליו מדובר. מתווך שמעלה תמונות או סרטון שומר אותם לצורך הצגה ופרסום. מתווך שמחבר וואטסאפ עסקי, פייסבוק, אינסטגרם או טיקטוק מאפשר לשרת לשלוח הודעות ולפרסם בשמו. לא נמכר מידע לגורם פרסום חיצוני.</p>
  <h2>מחיקת נתונים</h2>
  <p>אפשר לבקש מחיקה של פרטי השיחה והליד. Meta שולחת בקשת מחיקה לכתובת <a href="${deletion}">${deletion}</a>. אפשר גם לבקש מחיקה ישירות דרך ${contact}.</p>
  <h2>יצירת קשר</h2>
  <p>לשאלה על המידע שנשמר: ${contact}.</p>
  <p class="muted">עודכן בנובמבר 2026.</p>
</main>
</body>
</html>`;
}

function facebookStatusPage(title, text) {
  const escape = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>${escape(title)}</title><body style="font-family:Segoe UI,Arial,sans-serif"><h1>${escape(title)}</h1><p>${escape(text)}</p></body></html>`;
}

function connectPage({ appId, configId, brokerId, version, ready }) {
  const payload = JSON.stringify({ appId, configId, brokerId, version, ready }).replace(/</g, '\\u003c');
  const oauthFn = mobileOAuthUrl.toString();
  const close = '<' + '/script>';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>חיבור וואטסאפ עסקי</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap">
  <link rel="stylesheet" href="/crm.css">
</head>
<body class="connect-screen">
<main class="connect-card">
  <h1>חיבור וואטסאפ עסקי</h1>
  <p>האפליקציה בנייד נשארת פעילה. הבוט עונה ללקוחות על אותו מספר, ונעצר ל־24 שעות אחרי שאתה כותב מהטלפון.</p>
  <button id="connect" class="wa-connect" type="button">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12.04 3C7.31 3 3.48 6.83 3.48 11.56c0 1.5.39 2.96 1.14 4.25L3 21l5.33-1.4a8.5 8.5 0 0 0 3.71.84h.01c4.73 0 8.56-3.83 8.56-8.56C20.61 6.83 16.77 3 12.04 3zm4.9 12.16c-.2.57-1.17 1.04-1.63 1.1-.42.06-.95.08-1.53-.1-.35-.1-.8-.26-1.38-.51-2.43-1.05-4.01-3.5-4.13-3.66-.12-.16-.99-1.32-.99-2.52s.63-1.79.85-2.03c.22-.24.48-.3.64-.3h.46c.15 0 .35-.06.55.42.2.5.69 1.72.75 1.84.06.12.1.27.02.43-.08.16-.12.27-.24.41-.12.14-.25.32-.36.43-.12.12-.24.24-.1.47.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.58-.14 1.15z"/></svg>
    חבר את ה-WhatsApp העסקי שלך ל-NadlanBot
  </button>
  <p id="status" class="connect-status"></p>
</main>
<script>
  const setup = ${payload};
  const buildOAuthUrl = ${oauthFn};
  const brokerKey = 'nadlanbot.whatsappBroker';
  const returned = new URLSearchParams(window.location.search);
  const pageUri = window.location.origin + window.location.pathname;
  function rememberBroker(id) {
    if (!id) return;
    try { sessionStorage.setItem(brokerKey, id); } catch (error) {}
  }
  function storedBroker() {
    try { return sessionStorage.getItem(brokerKey) || ''; } catch (error) { return ''; }
  }
  rememberBroker(setup.brokerId);
  rememberBroker(returned.get('state'));
  let sessionInfo = {};
  function currentBrokerId() {
    return setup.brokerId || storedBroker() || returned.get('state') || '';
  }
  function finishConnect(code, redirectUri) {
    const status = document.getElementById('status');
    const brokerId = currentBrokerId();
    if (!brokerId) {
      status.textContent = 'פתחו שוב את החיבור מהאזור האישי של המתווך.';
      return;
    }
    status.textContent = 'משלימים את החיבור...';
    fetch('/api/whatsapp/connect-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        brokerId: brokerId,
        redirectUri: redirectUri,
        wabaId: sessionInfo.waba_id || '',
        phoneNumberId: sessionInfo.phone_number_id || ''
      })
    }).then((res) => res.json()).then((data) => {
      if (!data.ok) {
        status.textContent = data.error || 'החיבור נכשל';
        return;
      }
      status.textContent = 'החיבור הושלם בהצלחה! אפליקציית הוואטסאפ נשארת פעילה כרגיל בנייד שלך.';
      status.classList.add('ok');
      alert(status.textContent);
      if (window.opener) window.close();
    }).catch(() => {
      status.textContent = 'החיבור נכשל';
    });
  }
  if (returned.get('code') || returned.get('error') || returned.has('brokerId')) {
    history.replaceState(null, '', window.location.pathname);
  }
  if (returned.get('error')) {
    document.getElementById('status').textContent = 'החיבור בוטל.';
  } else if (returned.get('code')) {
    finishConnect(returned.get('code'), pageUri);
  }
  window.addEventListener('message', (event) => {
    if (!String(event.origin || '').endsWith('facebook.com')) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data && data.type === 'WA_EMBEDDED_SIGNUP' && data.data) sessionInfo = data.data;
    } catch (error) {}
  });
  window.fbAsyncInit = function () {
    FB.init({ appId: setup.appId, cookie: true, xfbml: false, version: setup.version });
  };
  function mobileBrowser() {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }
  document.getElementById('connect').addEventListener('click', () => {
    const status = document.getElementById('status');
    if (!setup.ready) {
      status.textContent = 'חיבור Meta עדיין לא מוגדר בשרת.';
      return;
    }
    if (mobileBrowser() || typeof FB === 'undefined') {
      window.location.assign(buildOAuthUrl({
        appId: setup.appId,
        version: setup.version,
        configId: setup.configId,
        redirectUri: pageUri,
        brokerId: currentBrokerId()
      }));
      return;
    }
    FB.login(function (response) {
      if (!(response.authResponse && response.authResponse.code)) {
        status.textContent = 'החיבור בוטל.';
        return;
      }
      finishConnect(response.authResponse.code, '');
    }, {
      config_id: setup.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding' }
    });
  });
${close}
<script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js">${close}
</body>
</html>`;
}

export default router;
