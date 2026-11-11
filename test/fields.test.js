import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExtract, naiveExtract, nextField, parseAmenities, parsePrice, blankFields } from '../src/domain/fields.js';

const GOLDEN = `למכירה
כתובת: רחוב הרצל 10
עיר: תל אביב
שכונה: נווה צדק
3.5 חדרים, קומה 2, 82 מ"ר
מחיר: 2,450,000 ₪
יש חניה, יש מעלית, יש מרפסת, יש ממ"ד
פינוי: מיידי
יתרונות: משופצת עם נוף פתוח
בעל הנכס: ישראל כהן
טלפון: 0501234567
הערות: לא להתקשר אחרי 20:00`;

test('parses prices and amenities', () => {
  assert.equal(parsePrice('2.45 מיליון'), 2450000);
  assert.equal(parsePrice('950 אלף'), 950000);
  assert.deepEqual(parseAmenities('יש חניה ומעלית, אין מרפסת, יש ממ"ד'), {
    parking: true,
    parkingKind: 'tabu',
    elevator: true,
    balcony: false,
    mamad: true,
  });
  assert.equal(parseAmenities('יש חניון לבניין').parkingKind, 'building');
  assert.equal(parseAmenities('אין חניה').parking, false);
});

test('a single broker message fills the property card', () => {
  const fields = mergeExtract(blankFields(), naiveExtract(GOLDEN));
  assert.equal(fields.listingType, 'sale');
  assert.equal(fields.address, 'רחוב הרצל 10');
  assert.equal(fields.city, 'תל אביב');
  assert.equal(fields.neighborhood, 'נווה צדק');
  assert.equal(fields.rooms, 3.5);
  assert.equal(fields.floor, '2');
  assert.equal(fields.sizeSqm, 82);
  assert.equal(fields.price, 2450000);
  assert.deepEqual(fields.amenities, { parking: true, parkingKind: 'tabu', elevator: true, balcony: true, mamad: true });
  assert.equal(fields.vacancyDate, 'מיידי');
  assert.match(fields.featuresText, /משופצת/);
  assert.equal(fields.ownerName, 'ישראל כהן');
  assert.equal(fields.ownerPhone, '972501234567');
  assert.match(fields.privateNotes, /20:00/);
  assert.equal(nextField(fields, []), null);
});
