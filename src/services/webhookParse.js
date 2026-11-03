import { normalizePhone } from '../domain/phone.js';

function mediaBlock(message) {
  const media = message[message.type] || {};
  return {
    kind: message.type,
    id: media.id || null,
    url: null,
    mimeType: media.mime_type || null,
    caption: media.caption || '',
    filename: media.filename || null,
  };
}

export function normalizeWaMessage(message, name = '') {
  const event = {
    messageId: message.id || null,
    from: normalizePhone(message.from),
    name: name || '',
    type: message.type || 'text',
    text: '',
    buttonId: null,
    media: null,
  };

  if (message.type === 'text') event.text = message.text?.body || '';
  if (message.type === 'interactive') {
    const reply = message.interactive?.button_reply || message.interactive?.list_reply;
    event.text = reply?.title || '';
    event.buttonId = reply?.id || null;
    event.type = 'button';
  }
  if (message.type === 'button') {
    event.text = message.button?.text || '';
    event.buttonId = message.button?.payload || null;
  }
  if (['image', 'video', 'document', 'audio'].includes(message.type)) {
    event.media = mediaBlock(message);
    event.text = event.media.caption || '';
  }
  return event;
}

export function parseWebhookBody(body) {
  const events = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || '']));
      for (const message of value.messages || []) {
        events.push(normalizeWaMessage(message, names.get(message.from) || ''));
      }
    }
  }
  return events;
}
