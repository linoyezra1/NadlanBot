import assert from 'node:assert/strict';
import test from 'node:test';
import { clientProperty, parkingPhrase } from '../src/domain/disclosure.js';
import { fallbackMarketing } from '../src/domain/marketing.js';

const property = {
  address: 'הרב צבי יהודה 5',
  city: 'בת ים',
  rooms: 4,
  price: 3300000,
  amenities: { parking: true, parkingKind: 'tabu', elevator: true },
  disclosure: { price: 'private', rooms: 'hide' },
};

test('apartment parking is tabu and a building lot is not', () => {
  assert.equal(parkingPhrase({ parking: true, parkingKind: 'tabu' }), 'חנייה בטאבו');
  assert.equal(parkingPhrase({ parking: true }), 'חנייה בטאבו');
  assert.match(parkingPhrase({ parking: true, parkingKind: 'building' }), /לא בטאבו/);
});

test('a hidden field stays with us and a private field stays off the post', () => {
  const post = clientProperty(property, 'post');
  const privately = clientProperty(property, 'private');
  assert.equal(post.price, null);
  assert.equal(post.rooms, null);
  assert.equal(privately.price, 3300000);
  assert.equal(privately.rooms, null);
  assert.equal(fallbackMarketing(post, 'https://wa.me/972500000000', {}).includes('3,300,000'), false);
  assert.equal(property.price, 3300000);
});
