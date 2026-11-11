import assert from 'node:assert/strict';
import test from 'node:test';
import { newPropertyOpening } from '../src/services/broker/brokerFlow.js';

test('a new apartment offers the chat and the intake form', () => {
  const text = newPropertyOpening('broker-1');
  assert.match(text, /נמלא את תעודת הנכס שאלה אחרי שאלה/);
  assert.match(text, /הדירה למכירה או להשכרה/);
  assert.match(text, /טופס קליטת נכס/);
  assert.match(text, /\/b\/broker-1\/properties\/new/);
});
