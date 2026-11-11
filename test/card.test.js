import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDraftCard, formatPrice, toPublicCard } from '../src/domain/card.js';

test('formats price with digits intact', () => {
  assert.equal(formatPrice(2450000).replace(/\D/g, ''), '2450000');
});

test('public card never includes the owner', () => {
  const card = toPublicCard({
    code: 'APT-101',
    address: 'רחוב הרצל 10',
    city: 'תל אביב',
    price: 2450000,
    owner: { ownerName: 'ישראל כהן', ownerPhone: '972501234567' },
    media: [],
  });
  assert.equal(JSON.stringify(card).includes('ישראל'), false);
  assert.equal(JSON.stringify(card).includes('972501234567'), false);
  assert.equal(card.owner, undefined);
  assert.equal(card.address, 'רחוב הרצל');
});

test('broker preview keeps owner details marked private', () => {
  const card = formatDraftCard({ ownerName: 'ישראל כהן', ownerPhone: '972501234567', address: 'רחוב הרצל 10' }, 'APT-101');
  assert.match(card, /ישראל כהן/);
  assert.match(card, /חסוי/);
  assert.match(card, /רחוב הרצל 10/);
  assert.equal(card.includes('יש לשים תמונות'), false);
  assert.match(formatDraftCard({ address: 'רחוב הרצל 10' }, 'טיוטה', { hasMedia: false }), /יש לשים תמונות/);
});
