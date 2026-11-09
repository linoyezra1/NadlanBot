import express from 'express';
import { config } from '../config.js';
import { dashboardData, getBroker, getLead, getProperty, listBrokers, listLeads, listProperties } from '../crm/data.js';
import { readMultipart } from '../crm/multipart.js';
import { brokersPage, dashboardPage, leadPage, leadsPage, missingPage, officePage, propertiesPage, propertyFormPage, propertyPage } from '../crm/render.js';
import { addPropertyFiles, createPropertyFromDraft, officeFields } from '../services/properties.js';
import { createConnectUrl, gatewayConfigured } from '../services/socialPublisher.js';

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const message = config.nodeEnv === 'production' ? 'לא הצלחנו לטעון את הנתונים.' : error.message;
      res.status(500).type('html').send(missingPage('', '', 'תקלה', message));
    }
  };
}

router.get('/', wrap(async (req, res) => {
  res.type('html').send(dashboardPage('', await dashboardData()));
}));

router.get('/properties', wrap(async (req, res) => {
  const query = String(req.query.q || '');
  res.type('html').send(propertiesPage('', await listProperties(query), query));
}));

router.get('/properties/:code', wrap(async (req, res) => {
  const property = await getProperty(req.params.code);
  if (!property) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה.'));
    return;
  }
  res.type('html').send(propertyPage('', property, String(req.query.notice || '')));
}));

router.get('/leads', wrap(async (req, res) => {
  const filter = String(req.query.status || '');
  res.type('html').send(leadsPage('', await listLeads(filter), filter));
}));

router.get('/leads/:id', wrap(async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) {
    res.status(404).type('html').send(missingPage('', 'leads', 'הלקוח לא נמצא', 'אין שיחה עם המזהה הזה.'));
    return;
  }
  res.type('html').send(leadPage('', lead));
}));

router.get('/office', wrap(async (req, res) => {
  const brokers = await listBrokers();
  if (brokers.length === 1) {
    res.redirect(302, `/office/${brokers[0].id}`);
    return;
  }
  res.type('html').send(brokersPage('', brokers));
}));

router.get('/office/:brokerId', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'office', 'המתווך לא נמצא', 'אין אזור אישי עם המזהה הזה.'));
    return;
  }
  res.type('html').send(officePage('', broker, String(req.query.notice || '')));
}));

router.get('/office/:brokerId/properties/new', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'office', 'המתווך לא נמצא', 'אין אזור אישי עם המזהה הזה.'));
    return;
  }
  res.type('html').send(propertyFormPage('', broker));
}));

router.post('/office/:brokerId/properties', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'office', 'המתווך לא נמצא', 'אין אזור אישי עם המזהה הזה.'));
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
  res.redirect(303, `/properties/${encodeURIComponent(property.code)}${query}`);
}));

router.post('/office/:brokerId/properties/:code/media', wrap(async (req, res) => {
  const property = await getProperty(req.params.code);
  if (!property || property.brokerId !== req.params.brokerId) {
    res.status(404).type('html').send(missingPage('', 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה אצל המתווך.'));
    return;
  }
  const payload = await formPayload(req);
  const media = await addPropertyFiles(property.id, payload.files);
  const notice = mediaNotice(media) || (payload.files.length ? '' : 'לא נבחר קובץ.');
  const query = notice ? `?notice=${encodeURIComponent(notice)}` : '';
  res.redirect(303, `/properties/${encodeURIComponent(property.code)}${query}`);
}));

router.get('/office/:brokerId/connect', wrap(async (req, res) => {
  const broker = await getBroker(req.params.brokerId);
  if (!broker) {
    res.status(404).type('html').send(missingPage('', 'office', 'המתווך לא נמצא', 'אין אזור אישי עם המזהה הזה.'));
    return;
  }
  if (!gatewayConfigured()) {
    res.type('html').send(officePage('', broker, 'שער הסושיאל עדיין לא מוגדר בשרת.'));
    return;
  }
  const connectUrl = await createConnectUrl(broker.id);
  res.redirect(302, connectUrl);
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
