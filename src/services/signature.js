import crypto from 'node:crypto';
import { config } from '../config.js';

export function twilioSignatureValid(authToken, signature, url, params) {
  if (!authToken || !signature || !url) return false;
  const data = Object.keys(params || {})
    .sort()
    .reduce((acc, key) => acc + key + String(params[key] ?? ''), url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const actual = Buffer.from(String(signature));
  const exp = Buffer.from(expected);
  if (actual.length !== exp.length) return false;
  return crypto.timingSafeEqual(exp, actual);
}

export function twilioRequestUrl(req) {
  const pathAndQuery = req.originalUrl || '/webhook';
  if (config.publicBaseUrl) return `${config.publicBaseUrl}${pathAndQuery}`;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}${pathAndQuery}`;
}

export function isWebhookAuthorized(url, params, header) {
  if (!config.twilioAuthToken) return config.nodeEnv !== 'production';
  return twilioSignatureValid(config.twilioAuthToken, header, url, params);
}
