import express from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { deliverResult } from '../services/deliverAll.js';
import { handleIncoming } from '../services/router.js';
import { isWebhookAuthorized } from '../services/signature.js';
import { parseWebhookBody } from '../services/webhookParse.js';

const router = express.Router();

router.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && config.verifyToken && token === config.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/', (req, res) => {
  if (!isWebhookAuthorized(req.rawBody, req.get('x-hub-signature-256'))) {
    return res.sendStatus(401);
  }
  let events = [];
  try {
    events = parseWebhookBody(req.body);
  } catch (error) {
    logger.error('webhook parse failed', error.message);
  }
  res.sendStatus(200);
  for (const event of events) {
    handleIncoming(event)
      .then((result) => deliverResult(event, result))
      .catch((error) => logger.error('webhook handling failed', error));
  }
  return undefined;
});

export default router;
