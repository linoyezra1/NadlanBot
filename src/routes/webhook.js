import express from 'express';
import { logger } from '../logger.js';
import { deliverResult } from '../services/deliverAll.js';
import { handleIncoming } from '../services/router.js';
import { isWebhookAuthorized, twilioRequestUrl } from '../services/signature.js';
import { parseWebhookBody } from '../services/webhookParse.js';

const router = express.Router();

router.use(express.urlencoded({ extended: false, limit: '2mb' }));

router.post('/', (req, res) => {
  if (!isWebhookAuthorized(twilioRequestUrl(req), req.body || {}, req.get('x-twilio-signature'))) {
    logger.warn('twilio webhook rejected');
    return res.sendStatus(401);
  }
  let events = [];
  try {
    events = parseWebhookBody(req.body);
  } catch (error) {
    logger.error('webhook parse failed', error.message);
  }
  res.type('text/xml').status(200).send('<Response></Response>');
  for (const event of events) {
    handleIncoming(event)
      .then((result) => deliverResult(event, result))
      .catch((error) => logger.error('webhook handling failed', error));
  }
  return undefined;
});

export default router;
