import { config } from '../config.js';
import { expandReplies } from '../domain/replies.js';
import { logger } from '../logger.js';

export function whatsappConfigured() {
  return Boolean(config.whatsappToken && config.whatsappPhoneNumberId);
}

function endpoint() {
  return `https://graph.facebook.com/${config.graphVersion}/${config.whatsappPhoneNumberId}/messages`;
}

async function postMessage(payload) {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error?.message || `WhatsApp HTTP ${response.status}`);
    error.code = json.error?.code;
    throw error;
  }
  return json.messages?.[0]?.id || null;
}

function textPayload(to, body) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: true, body },
  };
}

function templatePayload(to, body) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: config.brokerTemplateName,
      language: { code: config.brokerTemplateLang || 'he' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: body.slice(0, 900) }],
        },
      ],
    },
  };
}

function payloadFor(to, reply) {
  if (reply.type === 'image') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: reply.url, caption: reply.caption || undefined },
    };
  }
  if (reply.type === 'video') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link: reply.url, caption: reply.caption || undefined },
    };
  }
  if (reply.type === 'buttons') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: reply.text.slice(0, 1000) },
        action: {
          buttons: (reply.buttons || []).slice(0, 3).map((button) => ({
            type: 'reply',
            reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) },
          })),
        },
      },
    };
  }
  return textPayload(to, reply.text);
}

async function sendOne(to, reply) {
  try {
    return await postMessage(payloadFor(to, reply));
  } catch (error) {
    if (error.code === 131047 && config.brokerTemplateName && reply.type === 'text') {
      return postMessage(templatePayload(to, reply.text));
    }
    throw error;
  }
}

export async function markRead(messageId) {
  if (!whatsappConfigured() || !messageId) return;
  try {
    await postMessage({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch (error) {
    logger.warn('whatsapp read receipt failed', error.message);
  }
}

export async function deliver(to, replies) {
  const expanded = expandReplies(replies);
  if (!to) return expanded.map((reply) => ({ ...reply, ok: false, error: 'missing recipient' }));
  if (!whatsappConfigured()) {
    return expanded.map((reply) => ({ ...reply, ok: true, simulated: true }));
  }
  const sent = [];
  for (const reply of expanded) {
    try {
      const id = await sendOne(to, reply);
      sent.push({ ...reply, ok: true, id });
    } catch (error) {
      logger.error('whatsapp send failed', error.message);
      sent.push({ ...reply, ok: false, error: error.message });
    }
  }
  return sent;
}

export async function downloadWhatsAppMedia(mediaId) {
  if (!config.whatsappToken) throw new Error('לא הוגדר חיבור לוואטסאפ, אי אפשר למשוך את הקובץ.');
  const meta = await fetch(`https://graph.facebook.com/${config.graphVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.whatsappToken}` },
    signal: AbortSignal.timeout(20000),
  });
  const description = await meta.json().catch(() => ({}));
  if (!meta.ok || !description.url) throw new Error(description.error?.message || 'לא הצלחתי לקבל את קובץ המדיה');
  const file = await fetch(description.url, {
    headers: { Authorization: `Bearer ${config.whatsappToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!file.ok) throw new Error('הורדת המדיה מוואטסאפ נכשלה');
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    mimeType: description.mime_type || file.headers.get('content-type') || 'application/octet-stream',
  };
}
