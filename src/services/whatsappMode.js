import { prisma } from '../db.js';

export const BROKER_PAUSE_MS = 24 * 60 * 60 * 1000;

export function isBotPaused(conversation, now = Date.now()) {
  if (!conversation?.botPausedUntil) return false;
  return new Date(conversation.botPausedUntil).getTime() > now;
}

export async function pauseLeadChat(leadPhone, brokerId, now = Date.now()) {
  const until = new Date(now + BROKER_PAUSE_MS);
  const existing = await prisma.conversation.findFirst({
    where: {
      leadPhone,
      role: 'lead',
      brokerId,
      whatsappChannel: 'meta',
      status: { not: 'closed' },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) {
    return prisma.conversation.update({
      where: { id: existing.id },
      data: { botPausedUntil: until },
    });
  }
  return prisma.conversation.create({
    data: {
      role: 'lead',
      leadPhone,
      brokerId,
      whatsappChannel: 'meta',
      status: 'active',
      flowStep: 'chat',
      flowData: { mediaSends: 0 },
      botPausedUntil: until,
    },
  });
}
