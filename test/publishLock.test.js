import assert from 'node:assert/strict';
import test from 'node:test';
import { leadsPage, propertiesPage, propertyPage } from '../src/crm/render.js';
import { TIKTOK_CRM_NOTICE } from '../src/domain/tiktokVideo.js';
import { publishOnce } from '../src/crm/publishLock.js';
import { uploadFailure } from '../src/crm/multipart.js';

test('a second publish waits for the first instead of starting another', async () => {
  let calls = 0;
  const key = `property-${Date.now()}`;
  const first = publishOnce(key, async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return 'done';
  });
  const second = publishOnce(key, async () => {
    calls += 1;
    return 'again';
  });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, 'done');
  assert.equal(b, 'done');
  assert.equal(calls, 1);
  const third = await publishOnce(key, async () => 'later');
  assert.equal(third, 'later');
});

test('publish buttons lock themselves while the request is running', () => {
  const html = propertyPage('', {
    code: 'APT-104',
    status: 'active',
    address: 'הרצל 1',
    city: 'בת ים',
    price: 2000,
    listingType: 'rent',
    media: [],
    publications: [],
    conversations: [],
    amenities: {},
    broker: { id: 'broker-1', fullName: 'בדיקה' },
  }, TIKTOK_CRM_NOTICE, '/b/broker-1', 'בדיקה');
  assert.match(html, /פרסם בפייסבוק/);
  assert.match(html, /פרסם באינסטגרם/);
  assert.match(html, /פרסם בטיקטוק/);
  assert.match(html, /dataset\.busy/);
  assert.match(html, /מפרסם\.\.\./);
  assert.match(html, /button\.disabled = true/);
  assert.match(html, /role="alert"/);
  assert.match(html, /פרסום לטיקטוק נכשל/);
  assert.match(html, /מעלה קובץ\.\.\./);
  assert.match(html, /גדול מ-50MB/);
  assert.match(uploadFailure(Object.assign(new Error('aborted'), { code: 'ECONNABORTED' })).message, /ההעלאה נותקה/);
  assert.match(html, /דשבורד/);
  assert.match(html, /נכסים/);
  assert.match(html, /לידים/);
  assert.match(html, /יומן/);
  assert.match(html, />עוד</);
  assert.match(html, /w-64|width: 16rem|class="side"/);
  assert.equal(html.includes('הדרכות'), false);
  const cards = propertiesPage('', [{
    code: 'APT-104',
    status: 'active',
    listingType: 'rent',
    address: 'הרצל 1',
    city: 'בת ים',
    rooms: 3,
    floor: '2',
    sizeSqm: 80,
    price: 5000,
    amenities: { parking: true },
    media: [],
    conversations: [],
  }], '', '/b/broker-1');
  assert.match(cards, /שתף בוואטסאפ/);
  assert.match(cards, /פרסם/);
  assert.match(cards, /חניה/);
  assert.match(cards, /3 חדרים/);
  const leads = leadsPage('', [{
    id: 'lead-1',
    status: 'active',
    leadPhone: '972501234567',
    contactName: 'דנה',
    summary: 'מעוניינת',
    updatedAt: new Date('2026-11-10T12:00:00Z'),
    botPausedUntil: new Date('2026-11-11T12:00:00Z'),
    property: { code: 'APT-104', city: 'בת ים', neighborhood: 'רמת יוסף', price: 5000 },
    messages: [],
  }], '', '/b/broker-1');
  assert.match(leads, /dir="ltr"/);
  assert.match(leads, /המתווך בשיחה/);
  assert.match(leads, /אזור רמת יוסף, בת ים/);
});
