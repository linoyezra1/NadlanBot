import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { leadLookup } from '../src/services/leads/leadFlow.js';
import { parseMetaWebhook } from '../src/services/metaWebhook.js';
import { idsFromDebug } from '../src/services/whatsappConnect.js';
import { isBotPaused } from '../src/services/whatsappMode.js';
import { createApp } from '../src/app.js';
import { deletionStatus, parseSignedRequest, rememberDeletion } from '../src/services/facebookSignedRequest.js';
import { signaturesMatch } from '../src/routes/whatsappConnect.js';

test('system leads stay separate from a broker WhatsApp chat', () => {
  const system = leadLookup('972501111111');
  assert.deepEqual(system.OR, [
    { whatsappChannel: null },
    { whatsappChannel: { not: 'meta' } },
  ]);
  assert.equal(system.brokerId, undefined);
  const direct = leadLookup('972501111111', 'broker-1');
  assert.equal(direct.brokerId, 'broker-1');
  assert.equal(direct.whatsappChannel, 'meta');
  assert.equal(direct.OR, undefined);
});

test('a manual phone send pauses the bot and a customer message does not', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  assert.equal(isBotPaused({ botPausedUntil: new Date(now + 60_000) }, now), true);
  assert.equal(isBotPaused({ botPausedUntil: new Date(now - 60_000) }, now), false);
  assert.equal(isBotPaused({}, now), false);
});

test('routes a customer message and a coexistence echo by phone number id', () => {
  const events = parseMetaWebhook({
    entry: [{
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: '111' },
            contacts: [{ wa_id: '972501111111', profile: { name: 'דנה' } }],
            messages: [{ id: 'wamid.1', from: '972501111111', type: 'text', text: { body: 'היי' } }],
          },
        },
        {
          field: 'smb_message_echoes',
          value: {
            metadata: { phone_number_id: '111' },
            message_echoes: [{ id: 'wamid.2', from: '972509999999', to: '972501111111', type: 'text', text: { body: 'אני אטפל' } }],
          },
        },
      ],
    }],
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'message');
  assert.equal(events[0].phoneNumberId, '111');
  assert.equal(events[0].text, 'היי');
  assert.equal(events[0].name, 'דנה');
  assert.equal(events[1].kind, 'echo');
  assert.equal(events[1].to, '972501111111');
});

test('reads the WhatsApp business account from a debug token', () => {
  assert.equal(idsFromDebug({
    data: {
      granular_scopes: [
        { scope: 'whatsapp_business_management', target_ids: ['waba-9'] },
      ],
    },
  }).wabaId, 'waba-9');
});

test('checks the Meta webhook signature', () => {
  const body = Buffer.from('{"ok":true}');
  const digest = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(signaturesMatch('secret', body, `sha256=${digest}`), true);
  assert.equal(signaturesMatch('secret', body, 'sha256=nope'), false);
});

test('accepts a signed Facebook data-deletion request', () => {
  const payload = Buffer.from(JSON.stringify({ user_id: '99', algorithm: 'HMAC-SHA256' })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'secret').update(payload).digest('base64url');
  const data = parseSignedRequest(`${sig}.${payload}`, 'secret');
  assert.equal(data.user_id, '99');
  assert.equal(parseSignedRequest(`${sig}.${payload}`, 'other'), null);
  const code = rememberDeletion(data.user_id);
  assert.equal(deletionStatus(code).userId, '99');
  assert.equal(deletionStatus('missing'), null);
});

test('facebook removal addresses answer', async () => {
  const app = createApp();
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const status = await fetch(`http://127.0.0.1:${port}/api/auth/facebook/delete-data`);
    const body = await status.text();
    assert.equal(status.status, 200);
    assert.match(body, /מחיקת נתונים/);
    const removed = await fetch(`http://127.0.0.1:${port}/api/auth/facebook/deauthorize`);
    assert.equal(removed.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
