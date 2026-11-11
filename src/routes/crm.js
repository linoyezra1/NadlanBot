import express from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { dashboardData, getBroker, getLead, getProperty, listLeads, listProperties } from '../crm/data.js';
import { listSocialPosts } from '../services/socialFeed.js';
import { readMultipart, uploadFailure } from '../crm/multipart.js';
import { brokerFormPage, calendarPage, connectPage, dashboardPage, leadPage, leadsPage, missingPage, propertiesPage, propertyFormPage, propertyPage, socialFeedPage } from '../crm/render.js';
import { openBroker } from '../services/brokers.js';
import { addPropertyFiles, createPropertyFromDraft, officeFields, saveCardSettings } from '../services/properties.js';
import { gatewayConfigured, platformAuthUrl } from '../services/socialPublisher.js';
import { crmPublishNotice, crmPublishPopup, publishPropertyChannel } from '../services/social/distribute.js';
import { publishOnce } from '../crm/publishLock.js';

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const failure = uploadFailure(error);
      logger.error('request failed', req.method, req.originalUrl, failure.message);
      const url = String(req.originalUrl || '');
      const showDetail = url.includes('/connect/') || /\/media(?:\?|$)|\/properties(?:\?|$)/.test(url);
      const message = showDetail || config.nodeEnv !== 'production'
        ? failure.message
        : 'לא הצלחנו לטעון את הנתונים.';
      res.status(failure.status || 500).type('html').send(missingPage('', '', 'תקלה', message));
    }
  };
}

function area(broker) {
  return [`/b/${broker.id}`, broker.fullName];
}

router.get('/', (req, res) => {
  res.redirect(302, '/admin');
});

router.get('/properties', (req, res) => {
  res.redirect(302, '/admin');
});

router.get('/leads', (req, res) => {
  res.redirect(302, '/admin');
});

router.get('/office', (req, res) => {
  res.redirect(302, '/admin');
});

router.get('/office/brokers/new', (req, res) => {
  res.redirect(302, '/admin');
});

router.get('/properties/:code', wrap(async (req, res) => {
  const property = await getProperty(req.params.code);
  if (!property?.brokerId) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה.'));
    return;
  }
  const notice = req.query.notice ? `?notice=${encodeURIComponent(String(req.query.notice))}` : '';
  res.redirect(302, `/b/${property.brokerId}/properties/${encodeURIComponent(property.code)}${notice}`);
}));

router.get('/leads/:id', wrap(async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead?.brokerId) {
    res.status(404).type('html').send(missingPage('', 'leads', 'הלקוח לא נמצא', 'אין שיחה עם המזהה הזה.'));
    return;
  }
  res.redirect(302, `/b/${lead.brokerId}/leads/${encodeURIComponent(lead.id)}`);
}));

router.get('/office/:brokerId', (req, res) => {
  res.redirect(302, `/b/${req.params.brokerId}`);
});

router.get('/office/:brokerId/*', (req, res) => {
  const tail = req.params[0] ? `/${req.params[0]}` : '';
  res.redirect(302, `/b/${req.params.brokerId}${tail}`);
});

router.post('/office/brokers', wrap(async (req, res) => {
  const values = {
    fullName: req.body.fullName || '',
    phone: req.body.phone || '',
    businessName: req.body.businessName || '',
  };
  try {
    const { broker } = await openBroker(values);
    res.redirect(303, `/b/${broker.id}`);
  } catch (error) {
    if (error.status !== 400) throw error;
    res.status(400).type('html').send(brokerFormPage('', { errors: [error.message], values }));
  }
}));

router.get('/b/:brokerId', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'home', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const [base, subtitle] = area(broker);
  const data = await dashboardData(broker.id);
  data.broker = { isWhatsAppConnected: broker.isWhatsAppConnected };
  res.type('html').send(dashboardPage('', data, base, subtitle));
}));

router.get('/b/:brokerId/properties/new', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'properties', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  res.type('html').send(propertyFormPage('', broker));
}));

router.post('/b/:brokerId/properties', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'properties', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const payload = await formPayload(req);
  const { fields, errors } = officeFields(payload.fields);
  if (errors.length) {
    res.status(400).type('html').send(propertyFormPage('', broker, { errors, values: payload.fields }));
    return;
  }
  const property = await createPropertyFromDraft({ brokerId: broker.id, fields });
  const media = await addPropertyFiles(property.id, payload.files);
  const notice = mediaNotice(media);
  const query = notice ? `?notice=${encodeURIComponent(notice)}` : '';
  res.redirect(303, `/b/${broker.id}/properties/${encodeURIComponent(property.code)}${query}`);
}));

router.get('/b/:brokerId/properties', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'properties', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const query = String(req.query.q || '');
  const [base, subtitle] = area(broker);
  res.type('html').send(propertiesPage('', await listProperties(query, broker.id), query, base, subtitle));
}));

router.get('/b/:brokerId/properties/:code', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  const property = await getProperty(req.params.code);
  if (!broker || !property || property.brokerId !== broker.id) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה אצל המתווך.'));
    return;
  }
  const [base, subtitle] = area(broker);
  const popup = req.query.published === 'tiktok'
    ? { platform: 'tiktok', url: String(req.query.video || property.tiktokPostUrl || '') }
    : null;
  res.type('html').send(propertyPage('', property, String(req.query.notice || ''), base, subtitle, popup));
}));

router.post('/b/:brokerId/properties/:code/publish', wrap(async (req, res) => {
  const platform = String(req.body?.platform || '');
  const names = { facebook: 'פייסבוק', instagram: 'אינסטגרם', tiktok: 'טיקטוק' };
  const broker = await getBroker(req.params.brokerId);
  const property = await getProperty(req.params.code);
  const back = `/b/${req.params.brokerId}/properties/${encodeURIComponent(req.params.code)}`;
  if (!broker || !property || property.brokerId !== broker.id || !names[platform]) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה אצל המתווך.'));
    return;
  }
  const key = `${property.id}:${platform}`;
  let notice = '';
  try {
    const outcome = await publishOnce(key, () => publishPropertyChannel(broker, property, platform));
    const popup = crmPublishPopup(outcome);
    if (popup) {
      const query = new URLSearchParams({ published: 'tiktok' });
      if (/^https:\/\//i.test(popup.url)) query.set('video', popup.url);
      res.redirect(303, `${back}?${query}`);
      return;
    }
    notice = crmPublishNotice(outcome) || `הפרסום ל${names[platform]} הסתיים.`;
  } catch (error) {
    logger.error('publish failed', req.params.code, platform, error.message);
    notice = error.message || `הפרסום ל${names[platform]} נכשל.`;
  }
  res.redirect(303, `${back}?notice=${encodeURIComponent(notice.slice(0, 500))}`);
}));

router.post('/b/:brokerId/properties/:code/card', wrap(async (req, res) => {
  const payload = await formPayload(req);
  const property = await getProperty(req.params.code);
  if (!property || property.brokerId !== req.params.brokerId) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה אצל המתווך.'));
    return;
  }
  await saveCardSettings(property, payload.fields);
  res.redirect(303, `/b/${req.params.brokerId}/properties/${encodeURIComponent(property.code)}?notice=${encodeURIComponent('נשמר מה מותר לומר ללקוח')}`);
}));

router.post('/b/:brokerId/properties/:code/media', wrap(async (req, res) => {
  const property = await getProperty(req.params.code);
  if (!property || property.brokerId !== req.params.brokerId) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה אצל המתווך.'));
    return;
  }
  const payload = await formPayload(req);
  const media = await addPropertyFiles(property.id, payload.files);
  const notice = mediaNotice(media) || (payload.files.length ? '' : 'לא נבחר קובץ.');
  const query = notice ? `?notice=${encodeURIComponent(notice)}` : '';
  res.redirect(303, `/b/${req.params.brokerId}/properties/${encodeURIComponent(property.code)}${query}`);
}));

router.get('/b/:brokerId/social-feed', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'feed', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const propertyCode = String(req.query.property || '');
  const [base, subtitle] = area(broker);
  const posts = await listSocialPosts(broker.id, propertyCode);
  res.type('html').send(socialFeedPage('', posts, base, subtitle, propertyCode));
}));

router.get('/b/:brokerId/calendar', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'calendar', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const [base, subtitle] = area(broker);
  res.type('html').send(calendarPage('', await listLeads('hot', broker.id), base, subtitle));
}));

router.get('/b/:brokerId/leads', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'leads', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const filter = String(req.query.status || '');
  const [base, subtitle] = area(broker);
  res.type('html').send(leadsPage('', await listLeads(filter, broker.id), filter, base, subtitle));
}));

router.get('/b/:brokerId/leads/:id', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  const lead = await getLead(req.params.id, req.params.brokerId);
  if (!broker || !lead) {
    res.status(404).type('html').send(missingPage('', 'leads', 'הלקוח לא נמצא', 'אין שיחה עם המזהה הזה.'));
    return;
  }
  const [base, subtitle] = area(broker);
  res.type('html').send(leadPage('', lead, base, subtitle));
}));

router.get('/b/:brokerId/connect', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'connect', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  const notice = gatewayConfigured() ? '' : 'שער הסושיאל עדיין לא מוגדר בשרת.';
  res.type('html').send(connectPage('', broker, notice));
}));

router.get('/b/:brokerId/connect/:platform', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'connect', 'המתווך לא נמצא', 'אין נתיב עם המזהה הזה.'));
    return;
  }
  if (!gatewayConfigured()) {
    res.type('html').send(connectPage('', broker, 'שער הסושיאל עדיין לא מוגדר בשרת.'));
    return;
  }
  const url = await platformAuthUrl(broker.id, req.params.platform);
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `nadlan_broker=${encodeURIComponent(broker.id)}; Path=/; Max-Age=1800; HttpOnly; SameSite=Lax${secure}`);
  res.redirect(302, url);
}));

async function formPayload(req) {
  const type = String(req.headers['content-type'] || '');
  if (type.includes('multipart/form-data')) return readMultipart(req);
  return { fields: req.body || {}, files: [] };
}

function mediaNotice(media) {
  if (!media?.rejected?.length) return '';
  return `חלק מהקבצים לא נשמרו: ${media.rejected.join(', ')}`;
}

export default router;
