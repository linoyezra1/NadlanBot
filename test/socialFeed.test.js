import assert from 'node:assert/strict';
import test from 'node:test';
import { socialFeedPage } from '../src/crm/render.js';
import { publicationLine } from '../src/domain/publicationText.js';
import { commentSnapshot, leadContact, storedPostId } from '../src/services/socialFeed.js';

const DUPLICATE = 'This exact content is already scheduled, publishing, or was posted to this account within the last 24 hours.';

test('publication updates are shown in Hebrew', () => {
  assert.equal(
    publicationLine({ platform: 'social', status: 'failed', error: DUPLICATE }),
    'רשתות · נכשל · התוכן הזה כבר עלה, בפרסום, או פורסם לחשבון הזה ב-24 השעות האחרונות.',
  );
  assert.equal(publicationLine({ platform: 'facebook', status: 'published' }), 'פייסבוק · פורסם');
  assert.equal(publicationLine({ platform: 'instagram', status: 'processing' }), 'אינסטגרם · בעיבוד');
  assert.equal(publicationLine({ platform: 'tiktok', status: 'published' }), 'טיקטוק · פורסם');
  const hebrew = 'טיקטוק דורש סרטון MP4 או MOV בכתובת https ציבורית';
  assert.equal(publicationLine({ platform: 'social', status: 'failed', error: hebrew }), `רשתות · נכשל · ${hebrew}`);
});

test('the same wording with a new post id is a different post', () => {
  const body = (platformPostId) => ({
    profiles: [{ externalId: 'broker-1' }],
    post: { id: 'zernio-1', platformPostId, content: 'דירה למכירה' },
    comment: { id: 'c-1', platform: 'facebook', text: 'אפשר פרטים', author: { name: 'עזרא יצחק' } },
  });
  assert.equal(storedPostId(commentSnapshot(body('post-a'))), 'post-a');
  assert.equal(storedPostId(commentSnapshot(body('post-b'))), 'post-b');
  assert.notEqual(storedPostId(commentSnapshot(body('post-a'))), storedPostId(commentSnapshot(body('post-b'))));
});

test('one gateway id stays separate on each network', () => {
  assert.equal(storedPostId({ platform: 'facebook', platformPostId: 'z1', zernioPostId: 'z1' }), 'facebook:z1');
  assert.equal(storedPostId({ platform: 'instagram', platformPostId: 'z1', zernioPostId: 'z1' }), 'instagram:z1');
});

test('the feed card shows the post, the comment, and the bot reply', () => {
  const html = socialFeedPage('', [{
    platform: 'facebook',
    publishedAt: new Date('2026-11-11T10:00:00Z'),
    content: 'דירה למכירה',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    permalink: 'https://facebook.com/posts/1',
    broker: { fullName: 'עזרא', businessName: 'משרד עזרא' },
    property: { code: 'A1', conversations: [{ contactName: 'עזרא יצחק', leadPhone: '0501234567' }] },
    comments: [{ authorName: 'עזרא יצחק', text: 'אפשר פרטים', botReplyText: 'היי, הפרטים בוואטסאפ' }],
  }], '/b/broker');
  assert.match(html, /פעילות ברשתות/);
  assert.match(html, /דירה למכירה/);
  assert.match(html, /אפשר פרטים/);
  assert.match(html, /תג AI/);
  assert.match(html, /היי, הפרטים בוואטסאפ/);
  assert.match(html, /צפה בפוסט המקורי בפייסבוק/);
  assert.match(html, /צור קשר עם הליד בוואטסאפ/);
  assert.match(html, /https:\/\/wa\.me\/972501234567/);
  const quiet = socialFeedPage('', [{
    platform: 'tiktok',
    content: 'סרטון',
    broker: { fullName: 'עזרא' },
    comments: [{ authorName: 'דנה', text: 'יפה' }],
  }], '/b/broker');
  assert.equal(quiet.includes('צור קשר עם הליד בוואטסאפ'), false);
  assert.equal(quiet.includes('צפה בסרטון המקורי בטיקטוק'), false);
  assert.match(quiet, /יפה/);
});

test('a WhatsApp button needs a matched lead or a phone in the comment', () => {
  const post = { property: { conversations: [{ contactName: 'עזרא יצחק', leadPhone: '0501234567' }] } };
  assert.equal(leadContact(post, { authorName: 'עזרא יצחק', text: 'אפשר פרטים' }), '972501234567');
  assert.equal(leadContact(post, { authorName: 'דנה', text: 'אפשר פרטים' }), '');
  assert.equal(leadContact(post, { authorName: 'דנה', text: 'תתקשרו 052-111-2233' }), '972521112233');
});
