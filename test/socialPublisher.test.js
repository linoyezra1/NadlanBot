import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { config, zernioApiRoot } from '../src/config.js';
import { connectedPage } from '../src/domain/connectedPage.js';
import { cloudinaryFolderName, signedCloudinaryParams } from '../src/services/storage.js';
import { facebookSharerUrl, forwardCard, groupShareMessage } from '../src/domain/share.js';
import { signaturesMatch } from '../src/routes/socialWebhook.js';
import { commentReplyPlan, commentWebhookEvents, facebookPostExtras, selectPublicMedia, splitFeedMedia } from '../src/services/socialPublisher.js';
import { publicCommentReply } from '../src/domain/waLink.js';

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
  const feed = splitFeedMedia([
    ...Array.from({ length: 11 }, (_, index) => ({ mediaType: 'image', cloudUrl: `https://cdn.example.com/${index}.jpg` })),
    { mediaType: 'video', cloudUrl: 'https://cdn.example.com/tour.mp4' },
    { mediaType: 'video', cloudUrl: 'https://cdn.example.com/tour.webm' },
  ]);
  assert.equal(feed.images.length, 10);
  assert.deepEqual(feed.video, [{ url: 'https://cdn.example.com/tour.mp4', type: 'video' }]);
  const saved = config.whatsappDisplayNumber;
  config.whatsappDisplayNumber = '12762762210';
  const property = { listingType: 'rent', address: 'כצנלסון 41', city: 'בת ים', price: 6500 };
  const extras = facebookPostExtras(property, [
    { url: 'https://cdn.example.com/1.jpg', type: 'image' },
    { url: 'https://cdn.example.com/2.jpg', type: 'image' },
  ]);
  assert.equal(extras.facebookSettings.carouselCards.length, 2);
  assert.match(extras.facebookSettings.carouselCards[0].link, /^https:\/\/wa\.me\/12762762210\?text=/);
  assert.match(extras.firstComment, /wa\.me\/12762762210/);
  const reply = publicCommentReply(property, 'דנה');
  assert.match(reply, /היי דנה/);
  assert.match(reply, /להשכרה/);
  assert.match(reply, /כצנלסון/);
  assert.match(reply, /בת ים/);
  assert.match(decodeURIComponent(reply), /היי, הגבתי לפוסט על הדירה ברחוב כצנלסון בבת ים/);
  assert.equal(reply.includes('APT-'), false);
  config.whatsappDisplayNumber = saved;
});

test('checks the social gateway webhook signature', () => {
  const body = Buffer.from('{"event":"account.connected"}');
  const header = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(signaturesMatch('secret', body, header), true);
  assert.equal(signaturesMatch('secret', body, 'nope'), false);
});

test('signs Cloudinary uploads into the nadlanbot folder', () => {
  assert.equal(cloudinaryFolderName('nadlan bot'), 'nadlanbot');
  const dynamic = signedCloudinaryParams({
    apiSecret: 'secret',
    folder: 'nadlanbot',
    publicId: '2026/abc',
    timestamp: 1700000000,
    mode: 'dynamic',
  });
  const fixed = signedCloudinaryParams({
    apiSecret: 'secret',
    folder: 'nadlanbot',
    publicId: '2026/abc',
    timestamp: 1700000000,
    mode: 'fixed',
  });
  assert.equal(dynamic.asset_folder, 'nadlanbot');
  assert.equal(dynamic.signature, crypto.createHash('sha1')
    .update('asset_folder=nadlanbot&public_id=2026/abc&timestamp=1700000000secret')
    .digest('hex'));
  assert.equal(fixed.folder, 'nadlanbot');
  assert.equal(fixed.signature, crypto.createHash('sha1')
    .update('folder=nadlanbot&public_id=2026/abc&timestamp=1700000000secret')
    .digest('hex'));
});

test('shows a finished connection screen', () => {
  const html = connectedPage({
    iconUrl: '/brand/icon.png',
    homeUrl: '/b/cmw95m9ky0000pj014nyfk9lq',
    username: 'hagit',
  });
  assert.match(html, /החיבור הושלם/);
  assert.match(html, /חזרה לאזור האישי/);
  assert.match(html, /href="\/b\/cmw95m9ky0000pj014nyfk9lq"/);
  assert.equal(html.includes('חזרה לוואטסאפ'), false);
  assert.equal(html.includes('wa.me'), false);
  assert.match(html, /\/brand\/icon\.png/);
  assert.equal(html.includes('החיבור הסתיים'), false);
  assert.equal(html.includes('פייסבוק'), false);
  assert.equal(html.includes('טיקטוק'), false);
  const instagram = connectedPage({ platform: 'instagram', username: 'momoevents_' });
  assert.match(instagram, /אינסטגרם מחובר/);
  assert.match(instagram, /momoevents_/);
  assert.equal(instagram.includes('פייסבוק'), false);
  assert.equal(instagram.includes('טיקטוק'), false);
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

test('subscribes only to comment and account events Zernio accepts', () => {
  assert.deepEqual(commentWebhookEvents(), ['comment.received', 'account.connected', 'account.disconnected']);
  const events = commentWebhookEvents(['comment.received', 'profile.connected', 'mention.received', 'post.platform.published']);
  assert.deepEqual(events, ['comment.received', 'account.connected', 'account.disconnected']);
  assert.equal(events.includes('profile.connected'), false);
  assert.equal(events.includes('mention.received'), false);
  assert.equal(events.includes('post.platform.published'), false);
});

test('plans a public and a private reply for Instagram and Facebook comments', () => {
  const instagram = commentReplyPlan({
    account: { id: 'acc-1' },
    comment: {
      id: 'c-1',
      platform: 'instagram',
      platformPostId: 'media-9',
      postId: 'zernio-9',
      author: { name: 'דנה' },
    },
  });
  assert.equal(instagram.publicPostId, 'zernio-9');
  assert.equal(instagram.privatePostId, 'media-9');
  assert.deepEqual(instagram.lookupIds, ['media-9', 'zernio-9']);
  const own = commentReplyPlan({
    account: { accountId: 'acc-1' },
    comment: { id: 'c-2', platform: 'facebook', platformPostId: 'post-1', author: { isOwnAccount: true } },
  });
  assert.equal(own, null);
  const tiktok = commentReplyPlan({
    account: { id: 'acc-2' },
    comment: { id: 'c-3', platform: 'tiktok', platformPostId: 'video-1', author: { username: 'dan' } },
  });
  assert.equal(tiktok.privatePostId, '');
  assert.equal(tiktok.publicPostId, 'video-1');
});
