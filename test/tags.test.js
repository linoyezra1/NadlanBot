import assert from 'node:assert/strict';
import test from 'node:test';
import { detectTags, matchMedia } from '../src/domain/tags.js';

test('matches a kitchen photo and falls back to general photos', () => {
  const media = [
    { mediaType: 'image', cloudUrl: 'https://cdn.example.com/k.jpg', tags: ['kitchen'], caption: 'מטבח' },
    { mediaType: 'image', cloudUrl: 'https://cdn.example.com/l.jpg', tags: ['living_room'], caption: 'סלון' },
  ];
  assert.deepEqual(detectTags('מטבח'), ['kitchen']);
  const kitchen = matchMedia(media, 'אפשר תמונות של המטבח?');
  assert.equal(kitchen.matched, true);
  assert.equal(kitchen.items.length, 1);
  const general = matchMedia(media, 'אפשר תמונות?');
  assert.equal(general.matched, false);
  assert.equal(general.items.length, 2);
});
