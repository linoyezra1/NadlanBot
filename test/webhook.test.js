import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { twilioSignatureValid } from '../src/services/signature.js';
import { parseWebhookBody } from '../src/services/webhookParse.js';

test('parses a Twilio WhatsApp text, button and image payload', () => {
  const events = parseWebhookBody({
    MessageSid: 'SM123',
    From: 'whatsapp:+972501111111',
    ProfileName: 'דנה',
    Body: 'APT-104',
    NumMedia: '0',
    SmsStatus: 'received',
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].from, '972501111111');
  assert.equal(events[0].text, 'APT-104');
  assert.equal(events[0].name, 'דנה');

  const button = parseWebhookBody({
    MessageSid: 'SM124',
    From: 'whatsapp:+972501111111',
    Body: 'שמירת הנכס',
  });
  assert.equal(button[0].buttonId, 'save');

  const image = parseWebhookBody({
    MessageSid: 'SM125',
    From: 'whatsapp:+972501111111',
    Body: 'מטבח',
    NumMedia: '1',
    MediaUrl0: 'https://api.twilio.com/media/1',
    MediaContentType0: 'image/jpeg',
  });
  assert.equal(image[0].media.url, 'https://api.twilio.com/media/1');
  assert.equal(image[0].media.caption, 'מטבח');
  assert.equal(image[0].type, 'image');
});

test('ignores Twilio delivery status callbacks', () => {
  const events = parseWebhookBody({
    MessageSid: 'SM999',
    MessageStatus: 'delivered',
    From: 'whatsapp:+12762762210',
    To: 'whatsapp:+972501111111',
  });
  assert.deepEqual(events, []);
});

test('checks the Twilio webhook signature', () => {
  const params = { Body: 'APT-104', From: 'whatsapp:+972501111111' };
  const url = 'https://example.com/webhook';
  const data = `BodyAPT-104Fromwhatsapp:+972501111111`;
  const header = crypto.createHmac('sha1', 'secret').update(Buffer.from(url + data, 'utf-8')).digest('base64');
  assert.equal(twilioSignatureValid('secret', header, url, params), true);
  assert.equal(twilioSignatureValid('secret', header, url, { Body: 'nope' }), false);
});
