import { toPublicCard, formatPublicSummary } from '../../domain/card.js';
import { formatHotLead } from '../../domain/hotLead.js';
import { text } from '../../domain/replies.js';
import { image, video } from '../../domain/replies.js';
import { hotLeadSignal } from '../../domain/intents.js';
import { matchMedia } from '../../domain/tags.js';
import { prisma } from '../../db.js';
import { readFlow, recentMessages, rememberInbound, saveFlow } from '../conversationStore.js';
import { completeLeadTurn, hasOpenAI, summarizeForBroker } from '../openai.js';
import { chooseProperty, formatPropertyChoices, matchPropertyFromText } from '../propertyMatcher.js';
import { isBotPaused } from '../whatsappMode.js';
import { fallbackLeadTurn } from './fallback.js';
import { leadSystemPrompt, leadTools } from './prompt.js';

export function leadLookup(phone, brokerId = null) {
  return {
    leadPhone: phone,
    role: 'lead',
    status: { not: 'closed' },
    ...(brokerId
      ? { brokerId, whatsappChannel: 'meta' }
      : { OR: [{ whatsappChannel: null }, { whatsappChannel: { not: 'meta' } }] }),
  };
}

async function openLead(phone, name, brokerId = null) {
  const where = leadLookup(phone, brokerId);
  const existing = await prisma.conversation.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      role: 'lead',
      leadPhone: phone,
      brokerId: brokerId || null,
      whatsappChannel: brokerId ? 'meta' : null,
      contactName: name || null,
      status: 'active',
      flowStep: 'chat',
      flowData: { mediaSends: 0 },
    },
  });
}

function mediaReplies(items) {
  return items.map((item) => {
    const kind = item.mediaType || item.type;
    const url = item.cloudUrl || item.url;
    return kind === 'video' ? video(url, item.caption || '') : image(url, item.caption || '');
  });
}

async function handoff({ conversation, property, card, leadPhone, leadName, preferredTime, highlights, messages }) {
  const summary = highlights || await summarizeForBroker({
    card,
    messages,
    leadName,
    preferredTime,
  });
  const notice = formatHotLead({
    code: property.code,
    address: property.address,
    neighborhood: property.neighborhood,
    city: property.city,
    leadName,
    leadPhone,
    preferredTime,
    highlights: summary,
  });
  const flow = readFlow(conversation);
  flow.leadName = leadName;
  flow.preferredTime = preferredTime;
  await saveFlow(conversation.id, {
    status: 'converted_hot_lead',
    flowStep: 'handed_off',
    flow,
    summary: notice,
    contactName: leadName,
    propertyId: property.id,
  });
  await prisma.message.create({
    data: { conversationId: conversation.id, sender: 'notice', text: notice },
  });
  const notifications = property.broker?.phoneNumber
    ? [{ to: property.broker.phoneNumber, replies: [text(notice)] }]
    : [];
  return { notice, notifications };
}

async function runFallback({ conversation, property, card, event }) {
  const flow = readFlow(conversation);
  const history = await recentMessages(conversation.id, ['lead'], 8);
  const turn = fallbackLeadTurn({
    card,
    incoming: event.text,
    state: { step: conversation.flowStep, name: flow.leadName, time: flow.preferredTime, mediaSends: flow.mediaSends },
    recentLeadTexts: history.map((message) => message.text).filter(Boolean),
  });
  flow.mediaSends = turn.state.mediaSends;
  flow.leadName = turn.state.name;
  flow.preferredTime = turn.state.time;
  let notifications = [];
  if (turn.handoff) {
    const handed = await handoff({
      conversation,
      property,
      card,
      leadPhone: event.from,
      leadName: turn.handoff.leadName,
      preferredTime: turn.handoff.preferredTime,
      highlights: turn.handoff.highlights,
      messages: history,
    });
    notifications = handed.notifications;
  } else {
    await saveFlow(conversation.id, {
      flowStep: turn.state.step,
      flow,
      contactName: turn.state.name || undefined,
      propertyId: property.id,
    });
  }
  return { replies: turn.replies, notifications, conversationId: conversation.id };
}

async function runModel({ conversation, property, card, event }) {
  const history = await recentMessages(conversation.id, ['lead', 'bot'], 20);
  const messages = [{ role: 'system', content: leadSystemPrompt(card) }];
  if (hotLeadSignal(event.text)) {
    messages.push({
      role: 'system',
      content: 'ההודעה האחרונה מביעה רצון לסיור או לשיחה עם המתווך. אם חסר שם מלא או שעה, בקש רק את מה שחסר. אם שניהם כבר נאמרו, קרא ל-submit_hot_lead.',
    });
  }
  for (const message of history) {
    if (!message.text) continue;
    messages.push({ role: message.sender === 'lead' ? 'user' : 'assistant', content: message.text });
  }

  const flow = readFlow(conversation);
  const outboundMedia = [];
  let handed = conversation.status === 'converted_hot_lead';
  let notifications = [];

  for (let round = 0; round < 3; round += 1) {
    const completion = await completeLeadTurn({ messages, tools: leadTools });
    const message = completion.choices[0]?.message;
    if (!message) break;
    if (!message.tool_calls?.length) {
      const reply = (message.content || '').trim() || (handed
        ? 'תודה, הפרטים אצל המתווך והוא יחזור אליך.'
        : 'אני כאן. אפשר לשאול על הנכס או לבקש תמונות.');
      if (!handed) await saveFlow(conversation.id, { flow, propertyId: property.id });
      return { replies: [...outboundMedia, text(reply)], notifications, conversationId: conversation.id };
    }
    messages.push(message);
    for (const call of message.tool_calls) {
      const result = await runTool(call, { conversation, property, card, event, flow, outboundMedia, handed });
      if (result.handed) handed = true;
      if (result.notifications) notifications = result.notifications;
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result.data),
      });
    }
  }
  return {
    replies: [...outboundMedia, text(handed ? 'תודה, הפרטים אצל המתווך והוא יחזור אליך.' : 'אפשר לנסח שוב מה חשוב לך לדעת?')],
    notifications,
    conversationId: conversation.id,
  };
}

async function runTool(call, context) {
  let args = {};
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    args = {};
  }
  if (call.function.name === 'send_property_media') {
    if (context.flow.mediaSends >= 4) {
      return { data: { ok: false, error: 'limit', instruction: 'Say the broker can show more on the tour.' } };
    }
    const matched = matchMedia(context.property.media || [], args.request || '');
    if (!matched.items.length) return { data: { ok: false, sent: 0, note: 'No media is stored for this property.' } };
    context.flow.mediaSends += 1;
    context.outboundMedia.push(...mediaReplies(matched.items));
    return {
      data: {
        ok: true,
        sent: matched.items.length,
        matched: matched.matched,
        note: matched.matched ? 'Sent matching media.' : 'No exact tag match, sent general photos.',
      },
    };
  }
  if (call.function.name === 'submit_hot_lead') {
    if (context.handed || context.conversation.status === 'converted_hot_lead') {
      return { data: { ok: true, duplicate: true } };
    }
    const leadName = String(args.full_name || '').trim();
    const preferredTime = String(args.preferred_time || '').trim();
    if (leadName.length < 2 || preferredTime.length < 2) {
      return { data: { ok: false, error: 'Need both full_name and preferred_time before submitting.' } };
    }
    const history = await recentMessages(context.conversation.id, ['lead', 'bot'], 20);
    const handed = await handoff({
      conversation: context.conversation,
      property: context.property,
      card: context.card,
      leadPhone: context.event.from,
      leadName,
      preferredTime,
      highlights: args.highlights,
      messages: history,
    });
    context.handed = true;
    return {
      handed: true,
      notifications: handed.notifications,
      data: { ok: true, tell_the_user: 'Confirm that the broker will call.' },
    };
  }
  return { data: { ok: false, error: 'Unknown tool' } };
}

function openingReplies(property) {
  const card = toPublicCard(property);
  const where = [property.address, property.city].filter(Boolean).join(', ');
  const summary = formatPublicSummary(card);
  const lines = [
    where ? `הנה הדירה: ${where}` : 'הנה הדירה.',
    summary,
    'אפשר לשאול על המחיר, החדרים או המיקום, או לבקש תמונות נוספות.',
  ].filter(Boolean);
  const media = Array.isArray(property.media) ? property.media : [];
  const photos = media.filter((item) => item.mediaType !== 'video' && item.cloudUrl).slice(0, 3);
  const clips = photos.length ? photos : media.filter((item) => item.cloudUrl).slice(0, 1);
  return [
    text(lines.join('\n')),
    ...clips.map((item) => (item.mediaType === 'video'
      ? video(item.cloudUrl, item.caption || '')
      : image(item.cloudUrl, item.caption || ''))),
  ];
}

async function attachProperty(conversation, property) {
  const flow = readFlow(conversation);
  flow.pendingPropertyIds = [];
  const saved = await saveFlow(conversation.id, { flow, propertyId: property.id });
  if (property.brokerId && saved.brokerId !== property.brokerId) {
    return prisma.conversation.update({
      where: { id: conversation.id },
      data: { brokerId: property.brokerId },
    });
  }
  return saved;
}

function clarify() {
  return text('לא הצלחתי לאתר את הדירה המדויקת. באיזה עיר ורחוב מדובר, או מה מספר החדרים שמעניין אותך?');
}

async function rememberChoices(conversation, match) {
  const flow = readFlow(conversation);
  flow.pendingPropertyIds = match.properties.map((property) => property.id);
  await saveFlow(conversation.id, { flow });
  return {
    replies: [text(formatPropertyChoices(match.properties, match.hints))],
    notifications: [],
    conversationId: conversation.id,
  };
}

export async function handleLead(event) {
  const incoming = `${event.text || ''} ${event.media?.caption || ''}`.trim();
  let conversation = await openLead(event.from, event.name, event.brokerId || null);
  await rememberInbound(conversation.id, event, 'lead');
  if (isBotPaused(conversation)) {
    return { replies: [], notifications: [], conversationId: conversation.id };
  }

  if (!conversation.propertyId) {
    const flow = readFlow(conversation);
    if (flow.pendingPropertyIds.length) {
      const options = await prisma.property.findMany({
        where: { id: { in: flow.pendingPropertyIds }, status: 'active' },
        include: { media: { orderBy: { createdAt: 'asc' } }, broker: true },
      });
      const ordered = flow.pendingPropertyIds
        .map((id) => options.find((property) => property.id === id))
        .filter(Boolean);
      const chosen = chooseProperty(incoming, ordered);
      if (chosen) {
        conversation = await attachProperty(conversation, chosen);
        return { replies: openingReplies(chosen), notifications: [], conversationId: conversation.id };
      }
    }
    const match = await matchPropertyFromText(incoming, event.brokerId || null);
    if (match.kind === 'missing-code') {
      return {
        replies: [text(`לא מצאתי נכס פעיל עם הקוד ${match.hints.code}. כדאי לבדוק את המספר שמופיע במודעה.`)],
        notifications: [],
        conversationId: conversation.id,
      };
    }
    if (match.kind === 'one') {
      conversation = await attachProperty(conversation, match.properties[0]);
      return { replies: openingReplies(match.properties[0]), notifications: [], conversationId: conversation.id };
    }
    if (match.kind === 'many') return rememberChoices(conversation, match);
    return { replies: [clarify()], notifications: [], conversationId: conversation.id };
  }

  const property = await prisma.property.findFirst({
    where: { id: conversation.propertyId, status: 'active' },
    include: { media: true, broker: true },
  });

  if (!property) {
    return { replies: [clarify()], notifications: [], conversationId: conversation.id };
  }

  const card = toPublicCard(property);
  if (conversation.flowStep === 'handed_off' || conversation.status === 'converted_hot_lead') {
    const replies = [text('המתווך כבר קיבל את הפרטים ויחזור אליך. אם בא לך להוסיף משהו לקראת השיחה, כתוב לי ואעביר.')];
    const notifications = [];
    if ((event.text || '').trim().length > 12) {
      const note = `עדכון מהליד ${conversation.contactName || event.from} על ${property.code}:\n${event.text.trim()}`;
      replies[0] = text('העברתי את העדכון למתווך.');
      if (property.broker?.phoneNumber) notifications.push({ to: property.broker.phoneNumber, replies: [text(note)] });
    }
    return { replies, notifications, conversationId: conversation.id };
  }

  if (!hasOpenAI()) return runFallback({ conversation, property, card, event });
  try {
    return await runModel({ conversation, property, card, event });
  } catch (error) {
    const fresh = await prisma.conversation.findUnique({ where: { id: conversation.id } });
    if (fresh?.status === 'converted_hot_lead') {
      return {
        replies: [text('הפרטים אצל המתווך והוא יחזור אליך.')],
        notifications: [],
        conversationId: conversation.id,
      };
    }
    return runFallback({ conversation: fresh || conversation, property, card, event });
  }
}
