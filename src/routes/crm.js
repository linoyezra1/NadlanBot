import express from 'express';
import { config } from '../config.js';
import { dashboardData, getLead, getProperty, listLeads, listProperties } from '../crm/data.js';
import { dashboardPage, leadPage, leadsPage, missingPage, propertiesPage, propertyPage } from '../crm/render.js';
import { layout } from '../crm/layout.js';

const router = express.Router();

function allowed(req) {
  if (!config.adminToken) return config.nodeEnv !== 'production';
  const presented = req.get('x-admin-token') || req.query.token || req.body?.token;
  return presented === config.adminToken;
}

router.use((req, res, next) => {
  if (!allowed(req)) {
    res.status(403).type('html').send(layout({
      title: 'חסום',
      active: '',
      token: '',
      body: '<header class="page-head"><div><h1>המסך סגור</h1><p>צריך ADMIN_TOKEN כדי לפתוח את ה-CRM.</p></div></header>',
    }));
    return;
  }
  req.crmToken = String(req.query.token || '');
  next();
});

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const message = config.nodeEnv === 'production' ? 'לא הצלחנו לטעון את הנתונים.' : error.message;
      res.status(500).type('html').send(missingPage(req.crmToken, '', 'תקלה', message));
    }
  };
}

router.get('/', wrap(async (req, res) => {
  res.type('html').send(dashboardPage(req.crmToken, await dashboardData()));
}));

router.get('/properties', wrap(async (req, res) => {
  const query = String(req.query.q || '');
  res.type('html').send(propertiesPage(req.crmToken, await listProperties(query), query));
}));

router.get('/properties/:code', wrap(async (req, res) => {
  const property = await getProperty(req.params.code);
  if (!property) {
    res.status(404).type('html').send(missingPage(req.crmToken, 'properties', 'הנכס לא נמצא', 'אין נכס עם הקוד הזה.'));
    return;
  }
  res.type('html').send(propertyPage(req.crmToken, property));
}));

router.get('/leads', wrap(async (req, res) => {
  const filter = String(req.query.status || '');
  res.type('html').send(leadsPage(req.crmToken, await listLeads(filter), filter));
}));

router.get('/leads/:id', wrap(async (req, res) => {
  const lead = await getLead(req.params.id);
  if (!lead) {
    res.status(404).type('html').send(missingPage(req.crmToken, 'leads', 'הלקוח לא נמצא', 'אין שיחה עם המזהה הזה.'));
    return;
  }
  res.type('html').send(leadPage(req.crmToken, lead));
}));

export default router;
