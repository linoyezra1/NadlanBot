import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPropertyCode,
  hotLeadSignal,
  isNewPropertyIntent,
  parseAddGroup,
  parsePublishCommand,
  parsePublishRequest,
} from '../src/domain/intents.js';

test('reads a property code from the click-to-chat opener', () => {
  assert.equal(extractPropertyCode('שלום, אני מעוניין בפרטים על דירה APT-104'), 'APT-104');
  assert.equal(extractPropertyCode('apt-12'), 'APT-12');
});

test('the ad opener is not a hot lead', () => {
  assert.equal(hotLeadSignal('שלום, אני מעוניין בפרטים על דירה APT-104'), false);
  assert.equal(hotLeadSignal('אני רוצה לבוא לראות'), true);
  assert.equal(hotLeadSignal('אפשר לתאם סיור מחר?'), true);
  assert.equal(hotLeadSignal('אפשר לראות את הדירה'), true);
  assert.equal(hotLeadSignal('מתי אפשר לראות'), true);
  assert.equal(hotLeadSignal('אפשר לבוא?'), true);
  assert.equal(hotLeadSignal('מתי מראים דירה?'), true);
  assert.equal(hotLeadSignal('כמה עולה?'), false);
});

test('recognizes broker commands', () => {
  assert.equal(isNewPropertyIntent('יש לי דירה חדשה להעלות'), true);
  assert.equal(parsePublishCommand('פרסם APT-104'), 'APT-104');
  assert.equal(parsePublishCommand('פרסם באינסטגרם APT-104'), 'APT-104');
  assert.equal(parsePublishCommand('פרסם APT-104 בפייסבוק'), 'APT-104');
  assert.equal(parsePublishCommand('פרסם בטיקטוק'), null);
  assert.deepEqual(parsePublishRequest('פרסם באינסטגרם APT-8').channels, ['instagram']);
  assert.deepEqual(parsePublishRequest('פרסם APT-8 בפייסבוק ובטיקטוק').channels, ['facebook', 'tiktok']);
  assert.deepEqual(parseAddGroup('הוסף קבוצה 1234567890 דירות תל אביב'), {
    groupId: '1234567890',
    name: 'דירות תל אביב',
  });
});
