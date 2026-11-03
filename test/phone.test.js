import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhone, samePhone } from '../src/domain/phone.js';

test('normalizes Israeli numbers to 972', () => {
  assert.equal(normalizePhone('0501234567'), '972501234567');
  assert.equal(normalizePhone('+972-50-123-4567'), '972501234567');
  assert.equal(normalizePhone('972501234567'), '972501234567');
  assert.equal(samePhone('0501234567', '972501234567'), true);
});
