import assert from 'node:assert/strict';
import test from 'node:test';
import { brokerChatPage, brokerStepLabel } from '../src/services/brokerChat.js';

test('an open intake shows the step on the chat', () => {
  assert.equal(brokerStepLabel('details'), 'הזנת נכס חדש');
  assert.equal(brokerStepLabel('media'), 'ממתין לתמונות');
  assert.equal(brokerStepLabel('channels'), 'הפצה לפייסבוק');
  assert.equal(brokerStepLabel('idle'), '');
});

test('the audit chat puts the bot on the left and the broker on the right', () => {
  const html = brokerChatPage({
    broker: { id: 'b1', fullName: 'עזרא', phoneNumber: '972501234567' },
    brokers: [{ id: 'b1', fullName: 'עזרא', phoneNumber: '972501234567', chatMessages: [], conversations: [] }],
    step: 'media',
    messages: [
      { sender: 'BROKER', text: 'דירה חדשה', mediaUrl: 'https://cdn.example/a.jpg', createdAt: new Date('2026-11-11T10:00:00Z') },
      { sender: 'BOT', text: 'קיבלתי. שלח תמונות.', mediaUrl: null, createdAt: new Date('2026-11-11T10:00:05Z') },
    ],
  });
  assert.match(html, /צפה בשיחה|מתווכים/);
  assert.match(html, /ממתין לתמונות/);
  assert.match(html, /class="bubble broker"/);
  assert.match(html, /class="bubble bot"/);
  assert.match(html, /https:\/\/cdn\.example\/a\.jpg/);
  assert.match(html, /chat-log/);
  assert.match(html, /scrollTop/);
  const brokerAt = html.indexOf('class="bubble broker"');
  const botAt = html.indexOf('class="bubble bot"');
  assert.ok(brokerAt > 0 && botAt > brokerAt);
});
