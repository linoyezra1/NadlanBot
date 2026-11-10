import { config } from '../config.js';
import { expandReplies, text } from '../domain/replies.js';
import { normalizePhone } from '../domain/phone.js';
import { logger } from '../logger.js';

const SESSION_LIMIT = 1500;

function replyBody(reply) {
  if (reply.type !== 'buttons') return reply.text || reply.caption || '';
  const choices = (reply.buttons || []).map((button) => button.title).filter(Boolean);
  return [reply.text, ...choices].filter(Boolean).join('\n');
}

function pieces(reply) {
  const body = reply.type === 'buttons' ? { ...reply, type: 'text', text: replyBody(reply) } : reply;
  if (body.type !== 'text' || String(body.text || '').length <= SESSION_LIMIT) return [body];
  const parts = [];
  const value = String(body.text);
  for (let index = 0; index < value.length; index += SESSION_LIMIT) {
    parts.push(text(value.slice(index, index + SESSION_LIMIT)));
  }
  return parts;
}

function cloudPayload(to, reply) {
  const recipient = normalizePhone(to);
  if (reply.type === 'image' && reply.url) {
    return {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'image',
      image: { link: reply.url, caption: reply.caption || undefined },
    };
  }
  if (reply.type === 'video' && reply.url) {
    return {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'video',
      video: { link: reply.url, caption: reply.caption || undefined },
    };
  }
  return {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'text',
    text: { body: replyBody(reply) },
  };
}

export async function deliverCloud(meta, to, replies) {
  const expanded = expandReplies(replies).flatMap(pieces);
  if (!to || !meta?.phoneNumberId || !meta?.accessToken) {
    return expanded.map((reply) => ({ ...reply, ok: false, error: 'missing cloud sender' }));
  }
  const sent = [];
  for (const reply of expanded) {
    try {
      const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${meta.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${meta.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cloudPayload(to, reply)),
        signal: AbortSignal.timeout(20000),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error?.message || `WhatsApp Cloud HTTP ${response.status}`);
      sent.push({ ...reply, ok: true, id: json.messages?.[0]?.id || null });
    } catch (error) {
      logger.error('whatsapp cloud send failed', error.message);
      sent.push({ ...reply, ok: false, error: error.message });
    }
  }
  return sent;
}
