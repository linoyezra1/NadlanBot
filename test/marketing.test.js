import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureMarketingLink, fallbackMarketing } from '../src/domain/marketing.js';
import { formatHotLead } from '../src/domain/hotLead.js';

test('marketing copy includes the whatsapp link and not the owner', () => {
  const link = 'https://wa.me/972500000000?text=APT-101';
  const copy = fallbackMarketing({
    rooms: 3.5,
    city: 'תל אביב',
    neighborhood: 'נווה צדק',
    price: 2450000,
    featuresText: 'משופצת',
    ownerName: 'ישראל כהן',
  }, link);
  assert.match(copy, /wa\.me/);
  assert.equal(copy.includes('ישראל'), false);
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
