import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureMarketingLink, fallbackMarketing, polishListing } from '../src/domain/marketing.js';
import { formatHotLead, formatLeadUpdate } from '../src/domain/hotLead.js';

test('marketing copy includes the whatsapp link and not the owner', () => {
  const link = 'wa.me/12762762210?text=פרטים_על_APT-104';
  const broker = { businessName: 'חגית נדל"ן', phoneNumber: '972506962827' };
  const rent = fallbackMarketing({
    listingType: 'rent',
    rooms: 3,
    city: 'בת ים',
    neighborhood: 'The Five',
    address: 'כצנלסון 41',
    floor: '6',
    price: 6500,
    featuresText: 'דירה חדשה מהקבלן',
    ownerName: 'ישראל כהן',
  }, link, broker);
  assert.match(rent, /^להשכרה 3 חדרים בבת ים/);
  assert.match(rent, /The Five/);
  assert.match(rent, /רחוב כצנלסון בת ים/);
  assert.match(rent, /קומה 6/);
  assert.match(rent, /דירה חדשה מהקבלן/);
  assert.match(rent, /מחיר 6500 ש"ח לרציניים בלבד/);
  assert.match(rent, /לפרטים חגית נדל"ן/);
  assert.match(rent, /0506962827/);
  assert.equal(rent.includes('כתובת:'), false);
  assert.equal(rent.includes('אין'), false);
  assert.equal(rent.includes('לחץ כאן'), false);
  assert.equal(rent.includes('ישראל'), false);
  const sale = fallbackMarketing({
    listingType: 'sale',
    rooms: 4,
    city: 'בת ים',
    neighborhood: 'קו ראשון לים',
    price: 2800000,
    ownerName: 'ישראל כהן',
  }, link, broker);
  assert.match(sale, /^למכירה 4 חדרים בבת ים/);
  assert.match(sale, /קו ראשון לים/);
  assert.match(sale, /למביני עניין/);
  assert.equal(sale.includes('לפרטים מלאים בוואטסאפ'), false);
  assert.equal(sale.includes('ישראל'), false);
  assert.match(ensureMarketingLink('דירה יפה', link), /wa\.me/);
});

test('a form-shaped post is rewritten like a real listing', () => {
  const raw = [
    'להשכרה 4.5 חדרים בחולון',
    'כתובת: מבצע סיני 10',
    'קומה: קרקע',
    'גודל: 91 מ"ר',
    'חניה: כן',
    'חצר: יש',
    'מעלית: אין',
    'תאריך הפנוי: גמיש',
    'מחיר: 7000 ש"ח לרציניים בלבד',
    'טלפון: 972535314055',
    '[לחץ כאן לוואטסאפ](https://wa.me/12762762210?text=hi)',
  ].join('\n');
  const text = polishListing(raw);
  assert.match(text, /רחוב מבצע סיני$/m);
  assert.match(text, /קומה קרקע/);
  assert.match(text, /91 מ"ר/);
  assert.match(text, /^חניה$/m);
  assert.match(text, /^חצר$/m);
  assert.match(text, /פינוי גמיש/);
  assert.match(text, /מחיר 7000 ש"ח לרציניים בלבד/);
  assert.match(text, /0535314055/);
  assert.equal(text.includes('אין'), false);
  assert.equal(text.includes('לחץ כאן'), false);
  assert.equal(text.includes('972'), false);
  assert.equal(text.includes('כתובת:'), false);
});

test('missing amenities are left out of the listing', () => {
  const text = fallbackMarketing({
    listingType: 'rent',
    rooms: 4.5,
    city: 'חולון',
    address: 'מבצע סיני 10',
    floor: 'קרקע',
    sizeSqm: 91,
    price: 7000,
    vacancyDate: 'גמיש',
    amenities: { parking: true, elevator: false, balcony: false, mamad: false },
    featuresText: 'חצר',
  }, 'https://wa.me/12762762210', { businessName: 'תיווך בע"מ', phoneNumber: '972535314055' });
  assert.match(text, /^להשכרה 4.5 חדרים בחולון/);
  assert.match(text, /חניה/);
  assert.match(text, /חצר/);
  assert.equal(/\b10\b/.test(text), false);
  assert.equal(text.includes('אין'), false);
  assert.equal(text.includes('מעלית'), false);
  assert.equal(text.includes('מרפסת'), false);
  assert.equal(text.includes('ממ"ד'), false);
});

test('hot lead summary is ready for the broker', () => {
  const notice = formatHotLead({
    code: 'APT-101',
    city: 'תל אביב',
    leadName: 'דנה לוי',
    leadPhone: '972502222222',
    preferredTime: 'מחר ב-17:00',
    highlights: 'מחפשת כניסה מיידית',
  });
  assert.match(notice, /ליד חם/);
  assert.match(notice, /דנה לוי/);
  assert.match(notice, /APT-101/);
});

test('a later lead update names the customer and quotes the message', () => {
  const note = formatLeadUpdate({
    name: 'מומו',
    phone: '050-535-3140',
    text: 'מתי אפשר לראות את הדירה?',
  });
  assert.equal(note, '*עדכון*\n\nהלקוח מומו 050-535-3140\n"מתי אפשר לראות את הדירה?"');
});
