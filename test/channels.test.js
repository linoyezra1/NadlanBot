import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicHttpUrl, parseChannels, parseGroupSelection } from '../src/domain/channels.js';
import { buildWaLink } from '../src/domain/waLink.js';

test('parses channel choices', () => {
  assert.deepEqual(parseChannels('הכל'), ['facebook', 'instagram', 'tiktok']);
  assert.deepEqual(parseChannels('בלי טיקטוק'), ['facebook', 'instagram']);
  assert.deepEqual(parseChannels('רק פייסבוק'), ['facebook']);
});

test('parses group choices', () => {
  const groups = [{ name: 'א', groupId: '1' }, { name: 'ב', groupId: '2' }];
  assert.equal(parseGroupSelection('כל הקבוצות', groups).groups.length, 2);
  assert.deepEqual(parseGroupSelection('2', groups).groups.map((group) => group.groupId), ['2']);
  assert.deepEqual(parseGroupSelection('בלי קבוצות', groups).groups, []);
});

test('builds the spec click-to-whatsapp link', () => {
  const link = buildWaLink('972500000000', 'APT-104');
  assert.equal(link.startsWith('https://wa.me/972500000000?text='), true);
  assert.match(decodeURIComponent(link), /APT-104/);
});

test('rejects local media urls for social posting', () => {
  assert.equal(isPublicHttpUrl('https://cdn.example.com/a.jpg'), true);
  assert.equal(isPublicHttpUrl('http://cdn.example.com/a.jpg'), false);
  assert.equal(isPublicHttpUrl('https://localhost/a.jpg'), false);
});
