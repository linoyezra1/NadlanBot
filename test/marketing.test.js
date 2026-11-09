import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureMarketingLink, fallbackMarketing } from '../src/domain/marketing.js';
import { formatHotLead } from '../src/domain/hotLead.js';

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
  assert.match(rent, /^להשכרה 3 חדרים בThe Five/);
  assert.match(rent, /כצנלסון 41, בת ים/);
  assert.match(rent, /מחיר: 6,500 ש"ח לרציניים בלבד/);
  assert.match(rent, /חגית נדל"ן 050-6962827/);
  assert.match(rent, /לשליחת הודעה ישירה ותמונות בוואטסאפ/);
  assert.equal(rent.includes('ישראל'), false);
  const sale = fallbackMarketing({
    listingType: 'sale',
    rooms: 4,
    city: 'בת ים',
    neighborhood: 'קו ראשון לים',
    price: 2800000,
    ownerName: 'ישראל כהן',
  }, link, broker);
  assert.match(sale, /^למכירה בקו ראשון לים/);
  assert.match(sale, /4 חדרים/);
  assert.match(sale, /למביני עניין/);
  assert.match(sale, /לפרטים מלאים בוואטסאפ/);
  assert.equal(sale.includes('ישראל'), false);
  assert.match(ensureMarketingLink('דירה יפה', link), /wa\.me/);
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
