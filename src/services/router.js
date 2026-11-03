import { normalizePhone } from '../domain/phone.js';
import { text } from '../domain/replies.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { handleBroker } from './broker/brokerFlow.js';
import { rememberOutbound } from './conversationStore.js';
import { handleLead } from './leads/leadFlow.js';

const chains = new Map();
const buckets = new Map();

function withPhoneLock(phone, fn) {
  const previous = chains.get(phone) || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const tracked = run.finally(() => {
    if (chains.get(phone) === tracked) chains.delete(phone);
  });
  chains.set(phone, tracked);
  return tracked;
}

function allowMessage(phone) {
  const now = Date.now();
  const bucket = (buckets.get(phone) || []).filter((stamp) => now - stamp < 60_000);
  if (bucket.length >= 40) return false;
  bucket.push(now);
  buckets.set(phone, bucket);
  return true;
}

async function claimEvent(messageId) {
  if (!messageId) return true;
  try {
    await prisma.inboundEvent.create({ data: { id: messageId } });
    return true;
  } catch (error) {
    if (error.code === 'P2002') return false;
    throw error;
  }
}

async function dispatch(event) {
  const broker = await prisma.broker.findUnique({ where: { phoneNumber: event.from } });
  if (broker) return handleBroker(broker, event);
  return handleLead(event);
}

export async function handleIncoming(event) {
  const from = normalizePhone(event.from);
  if (!from) return { replies: [], notifications: [], conversationId: null, duplicate: false };
  event.from = from;
  if (!(await claimEvent(event.messageId))) {
    return { replies: [], notifications: [], conversationId: null, duplicate: true };
  }
  if (!allowMessage(from)) {
    return {
      replies: [text('קיבלתי הרבה הודעות בבת אחת. נמשיך בעוד רגע.')],
      notifications: [],
      conversationId: null,
    };
  }
  return withPhoneLock(from, async () => {
    try {
      const result = await dispatch(event);
      try {
        await rememberOutbound(result.conversationId, result.replies);
      } catch (error) {
        logger.error('failed to store outbound message', error);
      }
      return {
        replies: result.replies || [],
        notifications: result.notifications || [],
        conversationId: result.conversationId || null,
        duplicate: false,
      };
    } catch (error) {
      logger.error('conversation failed', error);
      return {
        replies: [text('נתקלתי בתקלה רגעית. אפשר לנסות שוב בעוד כמה שניות.')],
        notifications: [],
        conversationId: null,
      };
    }
  });
}
