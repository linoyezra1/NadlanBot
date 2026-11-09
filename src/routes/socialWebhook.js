import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { text } from '../domain/replies.js';
import { logger } from '../logger.js';
import { readConnectSession } from '../services/socialPublisher.js';
import { deliver } from '../services/whatsapp.js';

const router = express.Router();

router.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

function signaturesMatch(secret, rawBody, header) {
  if (!secret || !header || rawBody == null) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = Buffer.from(String(header));
  const exp = Buffer.from(expected);
  if (actual.length !== exp.length) return false;
  return crypto.timingSafeEqual(exp, actual);
}

function authorized(req) {
  if (!config.socialGatewayWebhookSecret) return config.nodeEnv !== 'production';
  const header = req.get('x-zernio-signature') || req.get('x-late-signature') || '';
  return signaturesMatch(config.socialGatewayWebhookSecret, req.rawBody, header);
}

async function rememberEvent(eventId) {
  if (!eventId) return true;
  try {
    await prisma.inboundEvent.create({ data: { id: `social:${eventId}` } });
    return true;
  } catch (error) {
    if (error.code === 'P2002') return false;
    throw error;
  }
}

function connectionIds(body) {
  const account = body.account || {};
  const profile = body.profile || {};
  const wrapped = (body.profiles || [])[0] || {};
  return {
    brokerId: body.brokerId || body.externalUserId || body.externalId || profile.externalId || wrapped.externalId || null,
    profileId: body.socialProfileId || body.returnedProfileId || body.profileId || profile._id || profile.id || account.profileId || wrapped.id || null,
    platform: account.platform || body.platform || null,
  };
}

async function applyConnection(body) {
  const event = body.event;
  const { brokerId, profileId, platform } = connectionIds(body);
  const filters = [];
  if (brokerId) filters.push({ id: brokerId });
  if (profileId) filters.push({ socialProfileId: profileId });
  if (!filters.length) return;
  const broker = await prisma.broker.findFirst({ where: { OR: filters } });
  if (!broker) return;

  const networks = new Set(broker.connectedNetworks || []);
  const profileEvent = event === 'profile.connected' || event === 'account.connected';
  const added = profileEvent && (event === 'profile.connected' || (platform && !networks.has(platform)));
  if (platform && profileEvent) networks.add(platform);
  if (event === 'account.disconnected' && platform) networks.delete(platform);
  const connected = event === 'profile.connected' || networks.size > 0;
  await prisma.broker.update({
    where: { id: broker.id },
    data: {
      socialProfileId: profileId || broker.socialProfileId,
      socialConnected: connected,
      connectedNetworks: [...networks],
    },
  });
  if (!added || broker.socialConnected) return;
  await deliver(broker.phoneNumber, [text('חשבונות הסושיאל חוברו בהצלחה! מעכשיו כל נכס שתפרסם יופץ לעמודים שלך.')]);
}

function receive(req, res) {
  if (!authorized(req)) return res.status(401).send('invalid signature');
  const body = req.body || {};
  res.sendStatus(200);
  const eventId = body.id || req.get('x-zernio-event-id') || req.get('x-late-event-id');
  rememberEvent(eventId)
    .then((fresh) => {
      if (!fresh) return null;
      if (body.event === 'profile.connected' || body.event === 'account.connected' || body.event === 'account.disconnected') {
        return applyConnection(body);
      }
      return null;
    })
    .catch((error) => logger.error('social webhook failed', error));
  return undefined;
}

const NETWORK_LABELS = { facebook: 'פייסבוק', instagram: 'אינסטגרם', tiktok: 'טיקטוק' };

router.get('/connect/:token', (req, res) => {
  const session = readConnectSession(req.params.token);
  if (!session) {
    res.status(404).type('html').send('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><body><p>הקישור כבר לא בתוקף. שלחו שוב "חיבור רשתות" בוואטסאפ.</p></body></html>');
    return;
  }
  const buttons = session.links.map((item) => {
    const label = NETWORK_LABELS[item.platform] || item.platform;
    return `<p><a href="${String(item.url).replace(/"/g, '&quot;')}">${label}</a></p>`;
  }).join('');
  res.type('html').send(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>חיבור רשתות</title><body><h1>חברו את החשבונות</h1>${buttons}</body></html>`);
});

router.get('/callback', (_req, res) => {
  res.type('html').send('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><body><p>החיבור הסתיים. אפשר לחזור לוואטסאפ.</p></body></html>');
});

router.get('/connected', (_req, res) => {
  res.redirect(302, '/social/callback');
});

router.post('/', receive);
router.post('/webhook', receive);

export { signaturesMatch };
export default router;
