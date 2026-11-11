import assert from 'node:assert/strict';
import test from 'node:test';
import { INQUIRY_SYSTEM_PROMPT } from '../src/services/leads/prompt.js';
import { brokerShouldHear, generateInquiryReply, inquiryMessages, propertyFacts, readViewingDecision } from '../src/services/openai.js';
import { isDetailsAsk } from '../src/domain/details.js';

const property = {
  listingType: 'sale',
  address: 'הרב צבי יהודה 5',
  city: 'בת ים',
  rooms: 4,
  floor: '5',
  price: 3300000,
  sizeSqm: 125,
  featuresText: 'משופצת',
  amenities: { parking: true, balcony: true, mamad: true },
  ownerName: 'לא לפרסום',
  ownerPhone: '0500000000',
};

test('property facts include the public listing and leave out the owner', () => {
  const facts = propertyFacts(property);
  assert.equal(facts.price, 3300000);
  assert.equal(facts.rooms, 4);
  assert.equal(facts.floor, '5');
  assert.match(facts.address, /בת ים/);
  assert.equal(facts.address.includes('5'), false);
  assert.equal(facts.advantages.includes('חנייה בטאבו'), true);
  assert.equal(JSON.stringify(facts).includes('לא לפרסום'), false);
  assert.equal(JSON.stringify(facts).includes('0500000000'), false);
});

test('the inquiry prompt carries the question, the listing and the WhatsApp link', () => {
  const messages = inquiryMessages({
    authorName: 'עזרא יצחק',
    question: 'אפשר פרטים',
    property,
    waLink: 'https://wa.me/972500000000?text=hi',
  });
  assert.match(messages[0].content, /לעוד פרטים ולתיאום סיור בוואטסאפ/);
  assert.match(messages[0].content, /לא תוכל לפנות למתווך בוואטסאפ/);
  assert.equal(messages[0].content, INQUIRY_SYSTEM_PROMPT);
  const body = JSON.parse(messages.at(-1).content);
  assert.equal(body.question, 'אפשר פרטים');
  assert.equal(body.property.rooms, 4);
  assert.match(body.waLink, /wa\.me/);
});

test('only a viewing request is worth telling the broker', async () => {
  assert.equal(readViewingDecision('{"viewing": true}'), true);
  assert.equal(readViewingDecision('{"viewing": false}'), false);
  const price = await brokerShouldHear('כמה עולה?', {
    timeoutMs: 30,
    complete: async () => ({ choices: [{ message: { content: '{"viewing": false}' } }] }),
  });
  const visit = await brokerShouldHear('מתי אפשר לראות?', {
    timeoutMs: 30,
    complete: async () => ({ choices: [{ message: { content: '{"viewing": true}' } }] }),
  });
  const slow = await brokerShouldHear('אפשר לבוא?', {
    timeoutMs: 30,
    complete: () => new Promise(() => {}),
  });
  assert.equal(price, false);
  assert.equal(visit, true);
  assert.equal(slow, true);
});

test('פרטים on a post returns the dry facts and a photos link', async () => {
  assert.equal(isDetailsAsk('פרטים'), true);
  assert.equal(isDetailsAsk('אפשר פרטים!'), true);
  assert.equal(isDetailsAsk('מה המחיר?'), false);
  let called = false;
  const answer = await generateInquiryReply({
    authorName: 'דנה',
    question: 'פרטים',
    property,
    waLink: 'https://wa.me/972500000000?text=hi',
    complete: async () => {
      called = true;
      return { choices: [{ message: { content: 'אין לי את המידע הזה לגבי הדירה' } }] };
    },
  });
  assert.equal(called, false);
  const [message] = answer.split('\nלעוד פרטים');
  assert.equal(message.includes('\n'), false);
  assert.match(message, /הדירה למכירה, 4 חדרים/);
  assert.match(message, /בקומה 5/);
  assert.match(message, /125 מ"ר/);
  assert.match(message, /3,300,000 ₪/);
  assert.match(message, /ברחוב הרב צבי יהודה/);
  assert.match(message, /בבת ים/);
  assert.match(answer, /לעוד פרטים ולתיאום סיור בוואטסאפ/);
  assert.match(answer, /wa\.me\/972500000000/);
  assert.equal(answer.includes('יהודה 5'), false);
  assert.equal(answer.includes('אין לי את המידע'), false);
  assert.equal(answer.includes('אין חניה'), false);
});

test('an address comment answers only the street, then the tour link', async () => {
  let called = false;
  const answer = await generateInquiryReply({
    authorName: 'דנה',
    question: 'מה הכתובת?',
    property,
    waLink: 'https://wa.me/972500000000?text=hi',
    complete: async () => {
      called = true;
      return { choices: [{ message: { content: 'אין לי את המידע הזה לגבי הדירה. 4 חדרים.' } }] };
    },
  });
  assert.equal(called, false);
  assert.match(answer, /^הכתובת היא רחוב הרב צבי יהודה, בת ים\./);
  assert.equal(answer.includes('4 חדרים'), false);
  assert.equal(answer.includes('3,300,000'), false);
  assert.equal(answer.includes('יהודה 5'), false);
  assert.match(answer, /לעוד פרטים ולתיאום סיור בוואטסאפ/);
  assert.match(answer, /wa\.me\/972500000000/);
});

test('a slow model falls back and a fast one is logged', async () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args);
  try {
    const slow = await generateInquiryReply({
      authorName: 'עזרא',
      question: 'אפשר עם כלב?',
      property,
      waLink: 'https://wa.me/972500000000',
      timeoutMs: 30,
      complete: () => new Promise(() => {}),
    });
    assert.equal(slow, null);
    const fast = await generateInquiryReply({
      authorName: 'עזרא יצחק',
      question: 'אפשר עם כלב?',
      property,
      waLink: 'https://wa.me/972500000000',
      complete: async () => ({ choices: [{ message: { content: '4 חדרים בקומה 5, 3.3 מיליון. אם צריך משהו אני כאן בשבילך. לא תוכל לפנות למתווך בוואטסאפ.' } }] }),
    });
    assert.match(fast, /4 חדרים/);
    assert.equal(/אני כאן בשבילך/.test(fast), false);
    assert.equal(/לא תוכל לפנות/.test(fast), false);
    assert.match(fast, /לעוד פרטים ולתיאום סיור בוואטסאפ/);
    assert.equal(fast.split('\nלעוד פרטים')[0].includes('\n'), false);
    assert.match(fast, /wa\.me\/972500000000/);
    assert.deepEqual(lines.at(-1), ['AI response generated for:', 'עזרא יצחק']);
  } finally {
    console.log = original;
  }
});
