import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { signaturesMatch } from '../src/services/signature.js';
import { parseWebhookBody } from '../src/services/webhookParse.js';

test('parses a WhatsApp text and image payload', () => {
  const events = parseWebhookBody({
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: '972501111111', profile: { name: 'דנה' } }],
          messages: [
            { id: 'wamid.1', from: '972501111111', type: 'text', text: { body: 'APT-104' } },
            { id: 'wamid.2', from: '972501111111', type: 'image', image: { id: 'media-1', caption: 'מטבח', mime_type: 'image/jpeg' } },
            {
              id: 'wamid.3',
              from: '972501111111',
              type: 'interactive',
              interactive: { type: 'button_reply', button_reply: { id: 'save', title: 'שמירת הנכס' } },
            },
          ],
        },
      }],
    }],
  });
  assert.equal(events.length, 3);
  assert.equal(events[0].text, 'APT-104');
  assert.equal(events[0].name, 'דנה');
  assert.equal(events[1].media.id, 'media-1');
  assert.equal(events[2].buttonId, 'save');
});

test('checks the Meta webhook signature', () => {
  const body = Buffer.from('{"ok":true}');
  const header = `sha256=${crypto.createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(signaturesMatch('secret', body, header), true);
  assert.equal(signaturesMatch('secret', body, 'sha256=nope'), false);
});
