import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackLeadTurn } from '../src/services/leads/fallback.js';

const card = {
  code: 'APT-101',
  address: 'רחוב הרצל 10',
  city: 'תל אביב',
  neighborhood: 'נווה צדק',
  rooms: 3.5,
  floor: '2',
  sizeSqm: 82,
  price: 2450000,
  amenities: { parking: true, elevator: true, balcony: true, mamad: true },
  vacancyDate: 'מיידי',
  featuresText: 'משופצת עם נוף פתוח',
  media: [{ mediaType: 'image', cloudUrl: 'https://cdn.example.com/k.jpg', tags: ['kitchen'], caption: 'מטבח' }],
};

test('answers the ad opener without treating it as a tour request', () => {
  const turn = fallbackLeadTurn({ card, incoming: 'שלום, אני מעוניין בפרטים על דירה APT-101', state: { step: 'chat' } });
  assert.equal(turn.handoff, null);
  assert.match(turn.replies[0].text, /3\.5/);
  assert.equal(turn.replies[0].text.includes('בעל'), false);
});

test('sends the kitchen photo and refuses to reveal the owner', () => {
  const photos = fallbackLeadTurn({ card, incoming: 'אפשר תמונות של המטבח?', state: { step: 'chat' } });
  assert.equal(photos.replies[0].type, 'image');
  const owner = fallbackLeadTurn({ card, incoming: 'מי הבעלים של הדירה?', state: { step: 'chat' } });
  assert.match(owner.replies[0].text, /לא נמסרים/);
});

test('answers a new question after handoff without asking for the name again', () => {
  const turn = fallbackLeadTurn({ card, incoming: 'כמה עולה?', state: { step: 'handed_off', name: 'דנה לוי', time: 'מחר' } });
  assert.equal(turn.handoff, null);
  assert.equal(turn.state.step, 'handed_off');
  assert.match(turn.replies[0].text, /2,450,000/);
  assert.equal(turn.replies[0].text.includes('איך קוראים'), false);
});

test('collects name and time before the hot lead handoff', () => {
  const asked = fallbackLeadTurn({ card, incoming: 'אני רוצה לבוא לראות', state: { step: 'chat' } });
  assert.equal(asked.state.step, 'name');
  const named = fallbackLeadTurn({ card, incoming: 'דנה לוי', state: asked.state });
  assert.equal(named.state.step, 'time');
  const booked = fallbackLeadTurn({ card, incoming: 'מחר ב-17:00', state: named.state });
  assert.equal(booked.handoff.leadName, 'דנה לוי');
  assert.equal(booked.handoff.preferredTime, 'מחר ב-17:00');
});
