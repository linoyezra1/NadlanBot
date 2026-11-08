import { normalizePhone } from '../domain/phone.js';

const BUTTON_IDS = {
  'שמירת הנכס': 'save',
  'עריכה': 'edit',
  'ביטול': 'cancel',
  'פרסום עכשיו': 'publish_now',
  'אחר כך': 'publish_later',
  'אישור הנוסח': 'approve_copy',
  'כל הערוצים': 'channels_all',
  'בלי טיקטוק': 'channels_no_tiktok',
};

function mediaKind(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('video')) return 'video';
  if (type.startsWith('audio')) return 'audio';
  if (type.startsWith('application') || type.includes('pdf')) return 'document';
  return 'image';
}

function buttonIdFor(body) {
  const payload = body.ButtonPayload || body.ListId || '';
  if (payload) return String(payload);
  return BUTTON_IDS[String(body.Body || body.ButtonText || body.ListTitle || '').trim()] || null;
}

export function parseWebhookBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  if (body.MessageStatus && body.MessageStatus !== 'received') return [];
  const from = normalizePhone(body.From || '');
  if (!from) return [];

  const text = String(body.Body || body.ButtonText || body.ListTitle || '').trim();
  const numMedia = Number(body.NumMedia || 0);
  const buttonId = buttonIdFor(body);
  const messageId = body.MessageSid || body.SmsSid || null;
  if (!text && numMedia === 0) return [];

  if (numMedia > 0) {
    const events = [];
    for (let index = 0; index < numMedia; index += 1) {
      const contentType = body[`MediaContentType${index}`] || '';
      const kind = mediaKind(contentType);
      events.push({
        messageId: index === 0 ? messageId : `${messageId}:${index}`,
        from,
        name: body.ProfileName || '',
        type: kind,
        text: index === 0 ? text : '',
        buttonId: null,
        media: {
          kind,
          id: null,
          url: body[`MediaUrl${index}`] || null,
          mimeType: contentType || null,
          caption: index === 0 ? text : '',
          filename: null,
        },
      });
    }
    return events;
  }

  return [{
    messageId,
    from,
    name: body.ProfileName || '',
    type: buttonId ? 'button' : 'text',
    text,
    buttonId,
    media: null,
  }];
}
