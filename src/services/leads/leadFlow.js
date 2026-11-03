import { toPublicCard } from '../../domain/card.js';
import { formatHotLead } from '../../domain/hotLead.js';
import { extractPropertyCode, hotLeadSignal } from '../../domain/intents.js';
import { text } from '../../domain/replies.js';
import { image, video } from '../../domain/replies.js';
import { matchMedia } from '../../domain/tags.js';
import { prisma } from '../../db.js';
import { readFlow, recentMessages, rememberInbound, saveFlow } from '../conversationStore.js';
import { findActiveProperty } from '../properties.js';
import { completeLeadTurn, hasOpenAI, summarizeForBroker } from '../openai.js';
import { fallbackLeadTurn } from './fallback.js';
import { leadSystemPrompt, leadTools } from './prompt.js';

async function openLead(phone, name) {
  const existing = await prisma.conversation.findFirst({
    where: { leadPhone: phone, role: 'lead', status: { not: 'closed' } },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      role: 'lead',
      leadPhone: phone,
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

export async function handleLead(event) {
  const code = extractPropertyCode(`${event.text || ''} ${event.media?.caption || ''}`);
  let conversation = await openLead(event.from, event.name);
  await rememberInbound(conversation.id, event, 'lead');

  if (code) {
    const property = await findActiveProperty(code);
    if (!property) {
      return {
        replies: [text(`לא מצאתי נכס פעיל עם הקוד ${code}. כדאי לבדוק את המספר שמופיע במודעה.`)],
        notifications: [],
        conversationId: conversation.id,
      };
    }
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { propertyId: property.id },
    });
  }

  const property = conversation.propertyId
    ? await prisma.property.findFirst({
      where: { id: conversation.propertyId, status: 'active' },
      include: { media: true, broker: true },
    })
    : null;

  if (!property) {
    return {
      replies: [text('היי, כדי לפתוח את הנכס הנכון שלחו את קוד הדירה מהמודעה, למשל APT-104.')],
      notifications: [],
      conversationId: conversation.id,
    };
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
