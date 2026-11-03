import assert from 'node:assert/strict';
import test from 'node:test';
import { planPosts } from '../src/domain/plan.js';

const image = { mediaType: 'image', cloudUrl: 'https://cdn.example.com/a.jpg' };
const localImage = { mediaType: 'image', cloudUrl: 'http://localhost:3000/media/a.jpg' };

test('skips TikTok when the property has no video', () => {
  const posts = planPosts({
    channels: ['facebook', 'instagram', 'tiktok'],
    media: [image],
    connected: { facebook: true, instagram: true, tiktok: true },
  });
  assert.equal(posts.find((post) => post.platform === 'tiktok').error.includes('סרטון'), true);
  assert.equal(posts.find((post) => post.platform === 'facebook').status, 'ready');
});

test('does not publish localhost media', () => {
  const posts = planPosts({
    channels: ['facebook'],
    media: [localImage],
    connected: { facebook: true },
  });
  assert.equal(posts[0].status, 'skipped');
});
