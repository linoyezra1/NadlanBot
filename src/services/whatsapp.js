import twilio from 'twilio';
import { config } from '../config.js';
import { expandReplies, text } from '../domain/replies.js';
import { logger } from '../logger.js';

const SESSION_LIMIT = 1500;

export function whatsappConfigured() {
  return Boolean(config.twilioAccountSid && config.twilioAuthToken && (config.twilioWhatsappNumber || config.twilioMessagingServiceSid));
}

export function whatsappAddress(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `whatsapp:+${digits}` : '';
}

export function isTwilioMediaUrl(url) {
  try {
    return new URL(url).hostname.endsWith('twilio.com');
  } catch {
    return false;
  }
}

function twilioClient() {
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

function authHeader() {
  const token = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
  return `Basic ${token}`;
}

function contentSid() {
  if (config.twilioContentSid) return config.twilioContentSid;
  return config.brokerTemplateName.startsWith('HX') ? config.brokerTemplateName : '';
}

function senderFields() {
  if (config.twilioMessagingServiceSid) return { messagingServiceSid: config.twilioMessagingServiceSid };
  return { from: whatsappAddress(config.twilioWhatsappNumber) };
}

function replyBody(reply) {
  if (reply.type !== 'buttons') return reply.text || reply.caption || '';
  const choices = (reply.buttons || []).map((button) => button.title).filter(Boolean);
  return [reply.text, ...choices].filter(Boolean).join('\n');
}

function messageFields(to, reply) {
  const fields = {
    ...senderFields(),
    to: whatsappAddress(to),
  };
  if (reply.type === 'image' || reply.type === 'video') {
    fields.body = reply.caption || '';
    fields.mediaUrl = [reply.url];
    return fields;
  }
  fields.body = replyBody(reply);
  return fields;
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

async function sendOne(to, reply) {
  const client = twilioClient();
  try {
    const message = await client.messages.create(messageFields(to, reply));
    return message.sid || null;
  } catch (error) {
    const sid = contentSid();
    if (error.code === 63016 && sid && (reply.type === 'text' || reply.type === 'buttons')) {
      const message = await client.messages.create({
        ...senderFields(),
        to: whatsappAddress(to),
        contentSid: sid,
        contentVariables: JSON.stringify({ 1: replyBody(reply).replace(/\s+/g, ' ').slice(0, 900) }),
      });
      return message.sid || null;
    }
    throw error;
  }
}

export async function markRead() {
  return undefined;
}

export async function deliver(to, replies) {
  const expanded = expandReplies(replies).flatMap(pieces);
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

export async function downloadWhatsAppMedia(mediaUrl) {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error('לא הוגדר חיבור לוואטסאפ, אי אפשר למשוך את הקובץ.');
  }
  const file = await fetch(mediaUrl, {
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(30000),
  });
  if (!file.ok) throw new Error('הורדת המדיה מוואטסאפ נכשלה');
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    mimeType: file.headers.get('content-type') || 'application/octet-stream',
  };
}
