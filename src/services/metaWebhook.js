function textOf(message) {
  return message?.text?.body
    || message?.button?.text
    || message?.interactive?.button_reply?.title
    || message?.image?.caption
    || message?.video?.caption
    || '';
}

function mediaOf(message) {
  const item = message?.image || message?.video || message?.document || null;
  if (!item) return null;
  const kind = message.image ? 'image' : message.video ? 'video' : 'document';
  return {
    kind,
    id: item.id || null,
    url: null,
    mimeType: item.mime_type || null,
    caption: item.caption || '',
    filename: item.filename || null,
  };
}

export function parseMetaWebhook(body) {
  const events = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || '';
      if (!phoneNumberId) continue;
      if (change.field === 'smb_message_echoes') {
        for (const echo of value.message_echoes || []) {
          events.push({
            kind: 'echo',
            phoneNumberId,
            messageId: echo.id || null,
            from: echo.from || '',
            to: echo.to || '',
            text: textOf(echo),
          });
        }
      }
      if (change.field === 'messages') {
        for (const message of value.messages || []) {
          const contact = (value.contacts || []).find((item) => item.wa_id === message.from);
          events.push({
            kind: 'message',
            phoneNumberId,
            messageId: message.id || null,
            from: message.from || '',
            name: contact?.profile?.name || '',
            type: message.type || 'text',
            text: String(textOf(message) || '').trim(),
            buttonId: message.button?.payload || message.interactive?.button_reply?.id || null,
            media: mediaOf(message),
          });
        }
      }
    }
  }
  return events;
}
