import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPropertyCode,
  hotLeadSignal,
  isNewPropertyIntent,
  parseAddGroup,
  parsePublishCommand,
  parsePublishRequest,
  brokerInterrupt,
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
  assert.equal(parseAddGroup('הוסף קבוצה 1234567890 דירות תל אביב').name, 'דירות תל אביב');
  assert.equal(parseAddGroup('הוסף קבוצה 1234567890 דירות תל אביב').groupId, '1234567890');
});

test('a property command leaves the intake instead of answering the open question', () => {
  assert.equal(brokerInterrupt('למכירה'), null);
  assert.equal(brokerInterrupt('פרסם APT-102').kind, 'publish');
  assert.equal(brokerInterrupt('פרסם APT-102').code, 'APT-102');
  assert.equal(brokerInterrupt('מחק APT-102').kind, 'delete');
  assert.equal(brokerInterrupt('ערוך apt-8').kind, 'edit');
  assert.equal(brokerInterrupt('דירה חדשה').kind, 'new');
  assert.equal(brokerInterrupt('תפריט').kind, 'menu');
  assert.equal(brokerInterrupt('ביטול').kind, 'cancel');
  assert.equal(brokerInterrupt('דירה חדשה מהקבלן'), null);
  assert.equal(brokerInterrupt('פרסם'), null);
});
