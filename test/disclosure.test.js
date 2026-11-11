import assert from 'node:assert/strict';
import test from 'node:test';
import { propertyPage } from '../src/crm/render.js';
import { clientProperty, parkingPhrase, readDisclosure } from '../src/domain/disclosure.js';
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

test('the exposure card is a row of toggles', () => {
  const html = propertyPage('', {
    code: 'APT-101',
    address: 'הרב צבי יהודה',
    neighborhood: 'באבוב',
    city: 'בת ים',
    rooms: 4,
    floor: '5',
    sizeSqm: 125,
    price: 3300000,
    featuresText: 'משופצת, עורפית',
    amenities: { parking: true, parkingKind: 'tabu', elevator: true, balcony: true, mamad: true },
    disclosure: { price: 'hide' },
    media: [],
    conversations: [],
    publications: [],
    socialPosts: [],
    broker: { fullName: 'עזרא' },
    owner: {},
    status: 'active',
    listingType: 'sale',
  });
  assert.match(html, /הגדרות חשיפת פרטי נכס/);
  assert.match(html, /name="expose_price"/);
  assert.equal(html.includes('לומר'), false);
  assert.equal(html.includes('name="show_price"'), false);
  assert.match(html, /name="expose_rooms" value="on" checked/);
  assert.equal(/name="expose_price" value="on" checked/.test(html), false);
  assert.match(html, /שמירת הגדרות חשיפה/);
});

test('an exposure toggle turns a detail on or off together', () => {
  const saved = readDisclosure({
    exposureForm: '1',
    expose_price: 'on',
    expose_address: 'on',
  });
  assert.equal(saved.price, 'say');
  assert.equal(saved.rooms, 'hide');
  assert.equal(saved.address, 'say');
  assert.equal(saved.neighborhood, 'say');
  assert.equal(saved.city, 'say');
  assert.equal(saved.featuresText, 'hide');
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
