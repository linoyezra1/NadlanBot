import { blankFields } from '../domain/fields.js';
import { prisma } from '../db.js';

export function readFlow(conversation) {
  const data = conversation?.flowData && typeof conversation.flowData === 'object' && !Array.isArray(conversation.flowData)
    ? conversation.flowData
    : {};
  return {
    mode: data.mode || 'free',
    fields: { ...blankFields(), ...(data.fields || {}) },
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
    propertyId: data.propertyId || conversation?.propertyId || null,
    code: data.code || null,
    marketingText: data.marketingText || null,
    channels: Array.isArray(data.channels) ? data.channels : [],
    mediaSends: Number(data.mediaSends || 0),
    leadName: data.leadName || conversation?.contactName || null,
    preferredTime: data.preferredTime || null,
    pendingPropertyIds: Array.isArray(data.pendingPropertyIds) ? data.pendingPropertyIds : [],
  };
}

export function packFlow(flow) {
  return {
    mode: flow.mode || 'free',
    fields: flow.fields || blankFields(),
    skipped: flow.skipped || [],
    propertyId: flow.propertyId || null,
    code: flow.code || null,
    marketingText: flow.marketingText || null,
    channels: flow.channels || [],
    mediaSends: flow.mediaSends || 0,
    leadName: flow.leadName || null,
    preferredTime: flow.preferredTime || null,
    pendingPropertyIds: Array.isArray(flow.pendingPropertyIds) ? flow.pendingPropertyIds : [],
  };
}

export async function saveFlow(id, { flowStep, status, propertyId, flow, summary, contactName } = {}) {
  const data = {};
  if (flowStep) data.flowStep = flowStep;
  if (status) data.status = status;
  if (propertyId !== undefined) data.propertyId = propertyId;
  if (flow) data.flowData = packFlow(flow);
  if (summary !== undefined) data.summary = summary;
  if (contactName !== undefined) data.contactName = contactName;
  return prisma.conversation.update({ where: { id }, data });
}

export async function rememberInbound(conversationId, event, sender) {
  await prisma.message.create({
    data: {
      conversationId,
      sender,
      text: (event.text || event.media?.caption || (event.media ? `[${event.media.kind}]` : '')).slice(0, 4000),
      mediaUrl: event.media?.url || null,
      externalId: event.messageId || null,
    },
  });
}

export async function rememberOutbound(conversationId, replies) {
  if (!conversationId) return;
  for (const reply of replies || []) {
    await prisma.message.create({
      data: {
        conversationId,
        sender: 'bot',
        text: (reply.text || reply.caption || `[${reply.type}]`).slice(0, 4000),
        mediaUrl: reply.url || null,
      },
    });
  }
}

export async function recentMessages(conversationId, senders, take = 20) {
  const rows = await prisma.message.findMany({
    where: { conversationId, sender: { in: senders } },
    orderBy: { timestamp: 'desc' },
    take,
  });
  return rows.reverse();
}
