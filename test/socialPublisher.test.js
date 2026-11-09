import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { zernioApiRoot } from '../src/config.js';
import { facebookSharerUrl, forwardCard, groupShareMessage } from '../src/domain/share.js';
import { signaturesMatch } from '../src/routes/socialWebhook.js';
import { selectPublicMedia } from '../src/services/socialPublisher.js';

test('keeps only public https media for the social gateway', () => {
  const items = selectPublicMedia([
    { mediaType: 'image', cloudUrl: 'https://cdn.example.com/a.jpg' },
    { mediaType: 'image', cloudUrl: 'http://localhost:3000/media/a.jpg' },
    { mediaType: 'video', cloudUrl: 'https://cdn.example.com/a.mp4' },
  ]);
  assert.deepEqual(items, [
    { url: 'https://cdn.example.com/a.jpg', type: 'image' },
    { url: 'https://cdn.example.com/a.mp4', type: 'video' },
  ]);
});

test('checks the social gateway webhook signature', () => {
  const body = Buffer.from('{"event":"account.connected"}');
  const header = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(signaturesMatch('secret', body, header), true);
  assert.equal(signaturesMatch('secret', body, 'nope'), false);
});

test('uses the Zernio host and keeps the v1 prefix', () => {
  assert.equal(zernioApiRoot('https://api.zernio.com'), 'https://api.zernio.com/v1');
  assert.equal(zernioApiRoot('https://api.zernio.com/v1'), 'https://api.zernio.com/v1');
  assert.equal(zernioApiRoot('https://zernio.com/api'), 'https://zernio.com/api/v1');
});

test('builds a Facebook group sharer and a forward card', () => {
  const postUrl = 'https://facebook.com/hagit.nadlan/posts/12345678';
  const share = groupShareMessage(postUrl);
  assert.match(share, /הפוסט עלה בהצלחה לעמוד שלך/);
  assert.match(share, /לחצי כאן לשיתוף מהיר/);
  assert.equal(
    facebookSharerUrl(postUrl),
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`,
  );
  const card = forwardCard(
    { rooms: 4, price: 2800000, code: 'APT-104' },
    'wa.me/12762762210?text=APT-104',
  );
  assert.equal(card, 'דירת 4 חדרים חדשה! 2.8 מיליון ₪. לפרטים ותמונות ישירות מהבוט: wa.me/12762762210?text=APT-104');
});
