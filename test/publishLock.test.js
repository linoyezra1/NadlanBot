import assert from 'node:assert/strict';
import test from 'node:test';
import { propertyPage } from '../src/crm/render.js';
import { publishOnce } from '../src/crm/publishLock.js';

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
  }, '', '/b/broker-1', 'בדיקה');
  assert.match(html, /פרסם בפייסבוק/);
  assert.match(html, /פרסם באינסטגרם/);
  assert.match(html, /פרסם בטיקטוק/);
  assert.match(html, /dataset\.busy/);
  assert.match(html, /מפרסם\.\.\./);
  assert.match(html, /button\.disabled = true/);
});
