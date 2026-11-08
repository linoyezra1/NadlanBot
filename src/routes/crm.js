import express from 'express';
import { config } from '../config.js';
import { dashboardData, getLead, getProperty, listLeads, listProperties } from '../crm/data.js';
import { dashboardPage, leadPage, leadsPage, missingPage, propertiesPage, propertyPage } from '../crm/render.js';

const router = express.Router();

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
  res.type('html').send(propertyPage('', property));
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

export default router;
