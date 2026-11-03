import crypto from 'node:crypto';
import { config } from '../config.js';

export function signaturesMatch(secret, rawBody, header) {
  if (!secret || !header || rawBody == null) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(String(header));
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function isWebhookAuthorized(rawBody, header) {
  if (!config.metaAppSecret) return config.nodeEnv !== 'production';
  return signaturesMatch(config.metaAppSecret, rawBody, header);
}
