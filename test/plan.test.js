import assert from 'node:assert/strict';
import test from 'node:test';
import { planPosts } from '../src/domain/plan.js';
import { TIKTOK_CRM_NOTICE, TIKTOK_WA_LINE, tiktokVideoUrl } from '../src/domain/tiktokVideo.js';
import { crmPublishNotice, crmPublishPopup, summarizeResults } from '../src/services/social/distribute.js';

const image = { mediaType: 'image', cloudUrl: 'https://cdn.example.com/a.jpg' };
const localImage = { mediaType: 'image', cloudUrl: 'http://localhost:3000/media/a.jpg' };

test('skips TikTok when the property has no video', () => {
  const posts = planPosts({
    channels: ['facebook', 'instagram', 'tiktok'],
    media: [image],
    connected: { facebook: true, instagram: true, tiktok: true },
  });
  const tiktok = posts.find((post) => post.platform === 'tiktok');
  assert.equal(tiktok.code, 'NO_VIDEO');
  assert.equal(tiktok.error, TIKTOK_WA_LINE);
  assert.equal(posts.find((post) => post.platform === 'facebook').status, 'ready');
  assert.equal(posts.find((post) => post.platform === 'instagram').status, 'ready');
});

test('publishes TikTok only from a public mp4 or mov', () => {
  assert.equal(tiktokVideoUrl([{ mediaType: 'video', cloudUrl: 'https://cdn.example.com/tour.webm' }]), '');
  assert.equal(tiktokVideoUrl([{ mediaType: 'video', cloudUrl: 'http://localhost:3000/tour.mp4' }]), '');
  assert.equal(tiktokVideoUrl([{ mediaType: 'video', cloudUrl: 'https://cdn.example.com/tour.mov' }]), 'https://cdn.example.com/tour.mov');
  const posts = planPosts({
    channels: ['tiktok'],
    media: [{ mediaType: 'video', cloudUrl: 'https://cdn.example.com/tour.mp4' }],
    connected: { tiktok: true },
  });
  assert.equal(posts[0].status, 'ready');
  assert.deepEqual(posts[0].urls, ['https://cdn.example.com/tour.mp4']);
});

test('keeps the other networks when TikTok has no video', () => {
  const results = [
    { platform: 'facebook', status: 'published', postUrl: 'https://facebook.com/post/1' },
    { platform: 'instagram', status: 'published', postUrl: 'https://instagram.com/p/1' },
    { platform: 'tiktok', status: 'skipped', code: 'NO_VIDEO', error: TIKTOK_WA_LINE },
  ];
  const summary = summarizeResults(results, 'https://wa.me/972500000000');
  assert.match(summary, /פייסבוק: עלה/);
  assert.match(summary, /אינסטגרם: עלה/);
  assert.match(summary, new RegExp(TIKTOK_WA_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const notice = crmPublishNotice({ results, waLink: 'https://wa.me/972500000000', summary });
  assert.match(notice, /פייסבוק: עלה/);
  assert.match(notice, new RegExp(TIKTOK_CRM_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(crmPublishNotice({
    results: [results[2]],
    summary,
  }), TIKTOK_CRM_NOTICE);
  const popup = crmPublishPopup({
    results: [{ platform: 'tiktok', status: 'published', postUrl: 'https://www.tiktok.com/@momo/video/1' }],
  });
  assert.equal(popup.title, 'הסרטון עלה לטיקטוק בהצלחה');
  assert.equal(popup.url, 'https://www.tiktok.com/@momo/video/1');
  assert.equal(crmPublishPopup({ results: [results[2]] }), null);
});

test('does not publish localhost media', () => {
  const posts = planPosts({
    channels: ['facebook'],
    media: [localImage],
    connected: { facebook: true },
  });
  assert.equal(posts[0].status, 'skipped');
});
