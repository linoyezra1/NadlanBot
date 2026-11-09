import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/config.js';
import { naturalWaLink } from '../src/domain/waLink.js';
import { chooseProperty, extractPropertyHints, formatPropertyChoices } from '../src/services/propertyMatcher.js';

test('reads a natural rental sentence', () => {
  const hints = extractPropertyHints('היי, אשמח לשמוע פרטים נוספים על הדירה להשכרה ברחוב כצנלסון בבת ים');
  assert.equal(hints.listingType, 'rent');
  assert.equal(hints.street, 'כצנלסון');
  assert.equal(hints.city, 'בת ים');
  assert.equal(hints.code, null);
  assert.equal(hints.rooms, null);
});

test('keeps a property code ahead of the address', () => {
  const hints = extractPropertyHints('פרטים על APT-104 ברחוב כצנלסון בבת ים');
  assert.equal(hints.code, 'APT-104');
});

test('reads rooms and a sale', () => {
  const hints = extractPropertyHints('דירה למכירה 4 חדרים ברחוב הנביאים בחולון');
  assert.equal(hints.listingType, 'sale');
  assert.equal(hints.street, 'הנביאים');
  assert.equal(hints.city, 'חולון');
  assert.equal(hints.rooms, 4);
});

test('lists matching apartments without a property code', () => {
  const text = formatPropertyChoices([
    { rooms: 3, floor: '6', price: 6500, address: 'כצנלסון 41', city: 'בת ים' },
    { rooms: 4, floor: '3', price: 7500, address: 'כצנלסון 12', city: 'בת ים' },
  ], { street: 'כצנלסון', city: 'בת ים' });
  assert.match(text, /יש לנו 2 דירות ברחוב כצנלסון בבת ים/);
  assert.match(text, /3 חדרים קומה 6 \(6,500 ₪\)/);
  assert.match(text, /4 חדרים קומה 3 \(7,500 ₪\)/);
  assert.match(text, /על איזו מהן תרצה לשמוע פרטים/);
  assert.equal(text.includes('APT-'), false);
});

test('chooses from the list by number or rooms', () => {
  const properties = [
    { id: 'a', rooms: 3, floor: '6' },
    { id: 'b', rooms: 4, floor: '3' },
  ];
  assert.equal(chooseProperty('1', properties).id, 'a');
  assert.equal(chooseProperty('4 חדרים', properties).id, 'b');
});

test('builds the post link as a natural sentence', () => {
  const previous = config.whatsappDisplayNumber;
  config.whatsappDisplayNumber = '972506962827';
  const link = naturalWaLink({
    listingType: 'rent',
    address: 'כצנלסון 41',
    city: 'בת ים',
    code: 'APT-104',
  });
  const decoded = decodeURIComponent(link);
  assert.equal(decoded, 'https://wa.me/972506962827?text=היי, אשמח לפרטים על הדירה להשכרה ברחוב כצנלסון בבת ים');
  config.whatsappDisplayNumber = previous;
});
