import { config } from '../../config.js';
import { formatDraftCard, formatPrice } from '../../domain/card.js';
import { parseChannels, parseGroupSelection } from '../../domain/channels.js';
import {
  DETAILS_INTRO,
  assignAnswer,
  blankFields,
  extractedCount,
  mergeExtract,
  nextField,
  questionFor,
} from '../../domain/fields.js';
import {
  isDoneMedia,
  isExactCancel,
  isExactConfirm,
  isGuidedRequest,
  isConnectSocialIntent,
  isListGroupsIntent,
  isListIntent,
  isMenuIntent,
  isNewPropertyIntent,
  brokerInterrupt,
  parseAddGroup,
  parseDeleteRequest,
  parseEditRequest,
  parsePublishRequest,
} from '../../domain/intents.js';
import { buttons, text } from '../../domain/replies.js';
import { naturalWaLink, postWaMe } from '../../domain/waLink.js';
import { prisma } from '../../db.js';
import { readFlow, rememberInbound, saveFlow } from '../conversationStore.js';
import { extractFromUtterance } from '../extract.js';
import { attachMedia, countConversationMedia } from '../media.js';
import { generateMarketing } from '../openai.js';
import { attachDraftMedia, createPropertyFromDraft, findBrokerProperty, listBrokerProperties, updatePropertyFromFields } from '../properties.js';
import { distribute } from '../social/distribute.js';
import { brokerConnectUrl } from '../socialPublisher.js';

function freshFlow() {
  return {
    mode: 'free',
    fields: blankFields(),
    skipped: [],
    propertyId: null,
    code: null,
    marketingText: null,
    channels: [],
  };
}

async function ensureInbox(broker) {
  const existing = await prisma.conversation.findFirst({
    where: { brokerId: broker.id, role: 'broker', status: 'active', flowStep: 'idle' },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      role: 'broker',
      brokerId: broker.id,
      brokerPhone: broker.phoneNumber,
      status: 'active',
      flowStep: 'idle',
      flowData: freshFlow(),
    },
  });
}

function findOnboarding(brokerId) {
  return prisma.conversation.findFirst({
    where: { brokerId, role: 'broker', status: 'onboarding' },
    orderBy: { updatedAt: 'desc' },
  });
}

async function listText(broker) {
  const properties = await listBrokerProperties(broker.id);
  if (!properties.length) return 'עדיין אין נכסים שמורים. אפשר להתחיל עם "דירה חדשה".';
  const lines = ['הנכסים שלך:'];
  for (const property of properties) {
    const place = [property.address, property.city].filter(Boolean).join(', ');
    lines.push(`• ${property.code} — ${place || 'בלי כתובת'} — ${property.price != null ? formatPrice(property.price) : 'בלי מחיר'} — ${propertyStateLabel(property.status)}`);
  }
  return lines.join('\n');
}

async function addGroup(broker, parsed) {
  await prisma.facebookGroup.upsert({
    where: { brokerId_groupId: { brokerId: broker.id, groupId: parsed.groupId } },
    update: { name: parsed.name },
    create: { brokerId: broker.id, groupId: parsed.groupId, name: parsed.name },
  });
  return `הקבוצה "${parsed.name}" נשמרה. פרסום אוטומטי יעבוד רק אם העמוד מנהל בקבוצה והאפליקציה מותקנת בה.`;
}

function propertyStateLabel(status) {
  if (status === 'active') return 'פעיל';
  if (status === 'draft') return 'טיוטה';
  if (status === 'archived') return 'בארכיון';
  return status;
}

function menuText() {
  return [
    'אפשר לכתוב:',
    'דירה חדשה',
    'הנכסים שלי',
    'פרסם APT-104',
    'ערוך APT-104',
    'מחק APT-104',
    'ביטול',
  ].join('\n');
}

function keptDraftNote(flow, interrupt) {
  if (!flow?.code) return '';
  if (interrupt?.code && interrupt.code === flow.code) return '';
  return `הנכס ${flow.code} נשאר באזור האישי.`;
}

function flowPatch(flowStep, flow) {
  return {
    flowStep,
    flow,
    ...(flow.propertyId ? { propertyId: flow.propertyId } : {}),
  };
}

function fieldsFromProperty(property) {
  return {
    ...freshFlow(),
    mode: 'guided',
    fields: {
      ...blankFields(),
      address: property.address,
      city: property.city,
      neighborhood: property.neighborhood,
      rooms: property.rooms,
      floor: property.floor,
      sizeSqm: property.sizeSqm,
      price: property.price,
      amenities: property.amenities,
      vacancyDate: property.vacancyDate,
      featuresText: property.featuresText,
      listingType: property.listingType,
      ownerName: property.owner?.ownerName || null,
      ownerPhone: property.owner?.ownerPhone || null,
      privateNotes: property.owner?.privateNotes || null,
    },
    propertyId: property.id,
    code: property.code,
  };
}

async function syncDraft(broker, conversation, flow) {
  const address = String(flow.fields?.address || '').trim();
  if (address.length < 3) return { created: false };
  if (!flow.propertyId) {
    const property = await createPropertyFromDraft({
      brokerId: broker.id,
      fields: flow.fields,
      status: 'draft',
    });
    await attachDraftMedia(conversation.id, property.id);
    flow.propertyId = property.id;
    flow.code = property.code;
    conversation.propertyId = property.id;
    return { created: true, code: property.code };
  }
  await updatePropertyFromFields(flow.propertyId, flow.fields);
  return { created: false, code: flow.code };
}

function connectText(broker) {
  return `לחץ כאן כדי לחבר את פייסבוק, אינסטגרם וטיקטוק: ${brokerConnectUrl(broker.id)}`;
}

async function groupsText(broker) {
  const groups = await prisma.facebookGroup.findMany({
    where: { brokerId: broker.id },
    orderBy: { name: 'asc' },
  });
  if (!groups.length) return 'עדיין אין קבוצות. אפשר להוסיף: הוסף קבוצה 1234567890 דירות תל אביב';
  return ['הקבוצות המחוברות:', ...groups.map((group, index) => `${index + 1}. ${group.name} (${group.groupId})`)].join('\n');
}

async function startOnboarding(broker) {
  const flow = { ...freshFlow(), mode: 'guided' };
  const conversation = await prisma.conversation.create({
    data: {
      role: 'broker',
      brokerId: broker.id,
      brokerPhone: broker.phoneNumber,
      status: 'onboarding',
      flowStep: 'details',
      flowData: flow,
    },
  });
  return {
    conversation,
    replies: [text(newPropertyOpening(broker.id, flow))],
  };
}

export function newPropertyOpening(brokerId, flow = freshFlow()) {
  const formUrl = `${config.publicBaseUrl}/b/${brokerId}/properties/new`;
  return [
    'דירה חדשה. נמלא את תעודת הנכס שאלה אחרי שאלה, וכל תשובה נשמרת.',
    'אפשר לשלוח תמונות וסרטונים בכל שלב.',
    '',
    questionFor(nextField(flow.fields, flow.skipped) || 'listingType', flow.fields),
    'או שאפשר למלא את הפרטים בקישור הבא:',
    'טופס קליטת נכס',
    formUrl,
  ].join('\n');
}

async function previewReplies(conversation, flow) {
  const mediaCount = await countConversationMedia(conversation.id);
  return [
    text(formatDraftCard(flow.fields, flow.code || 'טיוטה', { hasMedia: mediaCount > 0 })),
    buttons('לשמור את הנכס במערכת?', [
      { id: 'save', title: 'שמירת הנכס' },
      { id: 'edit', title: 'עריכה' },
      { id: 'cancel', title: 'ביטול' },
    ]),
  ];
}

async function continueDetails(broker, conversation, flow) {
  const opened = await syncDraft(broker, conversation, flow);
  const note = opened.created
    ? `נשמרה טיוטה ${opened.code}. אפשר לעצור בכל רגע, לפתוח דירה אחרת, או לפרסם נכס קיים.`
    : '';
  const pending = nextField(flow.fields, flow.skipped);
  if (pending) {
    flow.mode = 'guided';
    await saveFlow(conversation.id, flowPatch('details', flow));
    return [text([note, questionFor(pending, flow.fields)].filter(Boolean).join('\n'))];
  }
  await saveFlow(conversation.id, flowPatch('preview', flow));
  const preview = await previewReplies(conversation, flow);
  return note ? [text(note), ...preview] : preview;
}

async function loadProperty(propertyId) {
  return prisma.property.findUnique({ where: { id: propertyId }, include: { media: true } });
}

async function beginMarketing(conversation, flow) {
  const waLink = naturalWaLink(flow.fields) || postWaMe(flow.code);
  if (!waLink) {
    await saveFlow(conversation.id, { status: 'closed', flowStep: 'done', flow });
    return [text(`הנכס ${flow.code} שמור, אבל חסר TWILIO_WHATSAPP_NUMBER ולכן אי אפשר לבנות קישור wa.me. אחרי ההגדרה כתוב: פרסם ${flow.code}`)];
  }
  const broker = await prisma.broker.findUnique({ where: { id: conversation.brokerId } });
  const marketingText = await generateMarketing({ ...flow.fields, code: flow.code }, waLink, broker);
  flow.marketingText = marketingText;
  await saveFlow(conversation.id, { flowStep: 'marketing', flow });
  return [
    text(`הנה נוסח לפוסט:\n\n${marketingText}`),
    buttons('לאשר את הנוסח? אפשר גם לשלוח נוסח אחר בהודעה.', [
      { id: 'approve_copy', title: 'אישור הנוסח' },
      { id: 'cancel', title: 'ביטול' },
    ]),
  ];
}

async function askChannels(conversation, flow) {
  await saveFlow(conversation.id, { flowStep: 'channels', flow });
  return [
    text('אפשר גם לכתוב "הכל", "רק אינסטגרם", או שילוב כמו "פייסבוק ואינסטגרם".'),
    buttons('באיזה ערוץ לפרסם?', [
      { id: 'channels_facebook', title: 'פרסם בפייסבוק' },
      { id: 'channels_instagram', title: 'פרסם באינסטגרם' },
      { id: 'channels_tiktok', title: 'פרסם בטיקטוק' },
    ]),
  ];
}

async function finishPublish(broker, conversation, flow, channels, groups) {
  const property = await loadProperty(flow.propertyId);
  const outcome = await distribute({
    broker,
    property,
    channels,
    groups,
    caption: flow.marketingText,
  });
  await saveFlow(conversation.id, { status: 'closed', flowStep: 'done', flow, propertyId: property.id });
  const messages = outcome.messages?.length ? outcome.messages : [outcome.summary];
  return messages.filter(Boolean).map((body) => text(body));
}

async function afterChannels(broker, conversation, flow, channels) {
  flow.channels = channels;
  if (!channels.length) {
    return [text('לא זיהיתי ערוץ. כתוב "הכל", "בלי טיקטוק", או את השמות: פייסבוק, אינסטגרם, טיקטוק.')];
  }
  const groups = !config.socialGatewayApiKey && channels.includes('facebook')
    ? await prisma.facebookGroup.findMany({ where: { brokerId: broker.id }, orderBy: { name: 'asc' } })
    : [];
  if (groups.length) {
    await saveFlow(conversation.id, { flowStep: 'groups', flow });
    const lines = groups.map((group, index) => `${index + 1}. ${group.name}`);
    return [text(`הקבוצות המחוברות לעמוד:\n${lines.join('\n')}\nלפרסם בכל הקבוצות, לבחור מספרים (1,3), או "בלי קבוצות"?`)];
  }
  return finishPublish(broker, conversation, flow, channels, []);
}

async function handleBrokerTurn(broker, event) {
  if (broker.status !== 'active') {
    return { replies: [text('המספר הזה רשום, אבל החשבון אינו פעיל.')], conversationId: null };
  }

  const rawText = (event.text || '').trim();
  const buttonId = event.buttonId;
  let onboarding = await findOnboarding(broker.id);

  if (onboarding) {
    const interrupt = buttonId === 'cancel' ? { kind: 'cancel' } : brokerInterrupt(rawText);
    if (interrupt) {
      await rememberInbound(onboarding.id, event, 'broker');
      const flow = readFlow(onboarding);
      await saveFlow(onboarding.id, { status: 'closed', flowStep: interrupt.kind === 'cancel' ? 'cancelled' : 'paused' });
      if (interrupt.kind === 'cancel') {
        const note = flow.code
          ? `הקליטה נעצרה. הנכס ${flow.code} נשאר באזור האישי.`
          : 'הקליטה בוטלה. אפשר להתחיל מחדש עם "דירה חדשה".';
        return { replies: [text(note)], conversationId: onboarding.id };
      }
      const result = await handleIdle(broker, event, { storeInbound: false });
      const note = keptDraftNote(flow, interrupt);
      if (note) result.replies = [text(note), ...(result.replies || [])];
      return result;
    }
  }

  if (!onboarding) return handleIdle(broker, event);

  await rememberInbound(onboarding.id, event, 'broker');

  if (event.media?.kind === 'audio') {
    return {
      replies: [text('הודעות קוליות עדיין לא נקלחות. אפשר טקסט, תמונה או סרטון.')],
      conversationId: onboarding.id,
    };
  }

  if (event.media && event.media.kind !== 'audio') {
    try {
      await attachMedia(onboarding, event);
    } catch (error) {
      const message = error.code === 'MEDIA_LIMIT'
        ? 'הגענו ל-20 קבצים. כתוב "סיימתי" כדי להמשיך.'
        : `לא הצלחתי לשמור את הקובץ: ${error.message}`;
      return { replies: [text(message)], conversationId: onboarding.id };
    }
    const count = await countConversationMedia(onboarding.id);
    if (onboarding.flowStep === 'media' || !rawText) {
      const flow = readFlow(onboarding);
      const pending = nextField(flow.fields, flow.skipped);
      const follow = pending ? `\n${questionFor(pending, flow.fields)}` : '';
      const hint = onboarding.flowStep === 'media' ? ' אפשר לשלוח עוד, או לכתוב "סיימתי".' : follow;
      return {
        replies: [text(`קיבלתי את הקובץ (${count}).${hint}`)],
        conversationId: onboarding.id,
      };
    }
  }

  if (isListIntent(rawText)) {
    return {
      replies: [text(await listText(broker)), text('יש קליטה פתוחה. אפשר להמשיך, או לכתוב ביטול.')],
      conversationId: onboarding.id,
    };
  }

  const flow = readFlow(onboarding);
  const replies = await step(broker, onboarding, flow, rawText, buttonId);
  return { replies, conversationId: onboarding.id };
}

export async function handleBroker(broker, event) {
  const prior = await prisma.message.count({
    where: { conversation: { brokerId: broker.id, role: 'broker' } },
  });
  const result = await handleBrokerTurn(broker, event);
  const rawText = (event.text || '').trim();
  const firstContact = prior === 0 && broker.status === 'active' && !broker.socialConnected;
  if (firstContact && !isConnectSocialIntent(rawText) && result?.replies) {
    result.replies = [...result.replies, text(await connectText(broker))];
  }
  return result;
}

async function step(broker, conversation, flow, rawText, buttonId) {
  if (conversation.flowStep === 'media') return mediaStep(conversation, rawText);
  if (conversation.flowStep === 'details') return detailsStep(broker, conversation, flow, rawText);
  if (conversation.flowStep === 'edit') return editStep(broker, conversation, flow, rawText);
  if (conversation.flowStep === 'preview') return previewStep(broker, conversation, flow, rawText, buttonId);
  if (conversation.flowStep === 'publish_ask') return publishAskStep(conversation, flow, rawText, buttonId);
  if (conversation.flowStep === 'marketing') return marketingStep(broker, conversation, flow, rawText, buttonId);
  if (conversation.flowStep === 'channels') return channelsStep(broker, conversation, flow, rawText, buttonId);
  if (conversation.flowStep === 'groups') return groupsStep(broker, conversation, flow, rawText);
  return detailsStep(broker, conversation, flow, rawText);
}

async function mediaStep(conversation, rawText) {
  if (!isDoneMedia(rawText)) {
    return [text('אני מחכה לתמונות או לסרטון. כשתסיים כתוב "סיימתי", או "בלי מדיה" אם אין קבצים.')];
  }
  const count = await countConversationMedia(conversation.id);
  if (count === 0 && rawText !== 'בלי מדיה') {
    return [text('עדיין לא קיבלתי מדיה. שלח לפחות תמונה אחת, או כתוב "בלי מדיה".')];
  }
  const flow = { ...freshFlow(), mode: 'guided' };
  await saveFlow(conversation.id, { flowStep: 'details', flow });
  return [text(questionFor('listingType', flow.fields))];
}

async function detailsStep(broker, conversation, flow, rawText) {
  if (isDoneMedia(rawText)) {
    const count = await countConversationMedia(conversation.id);
    const pending = nextField(flow.fields, flow.skipped);
    const follow = pending ? questionFor(pending, flow.fields) : 'אפשר להמשיך.';
    return [text(`הקבצים שמורים (${count}). ${follow}`)];
  }
  if (flow.mode !== 'guided') {
    if (isGuidedRequest(rawText)) {
      flow.mode = 'guided';
      return continueDetails(broker, conversation, flow);
    }
    const partial = await extractFromUtterance(rawText);
    if (extractedCount(partial) < 2 && rawText.length < 80) {
      return [text(DETAILS_INTRO)];
    }
    flow.fields = mergeExtract(flow.fields, partial);
    flow.mode = 'guided';
    return continueDetails(broker, conversation, flow);
  }
  const key = nextField(flow.fields, flow.skipped);
  if (!key) return continueDetails(broker, conversation, flow);
  if (!rawText) return [text(questionFor(key, flow.fields))];
  if (/^(?:פרסם|מחק|למחוק|ערוך|לערוך)\b/.test(rawText)) {
    return [text(`כדי לצאת מהשאלון צרף קוד נכס, למשל: פרסם APT-104.\n${questionFor(key, flow.fields)}`)];
  }
  const dumped = await extractFromUtterance(rawText);
  if (extractedCount(dumped) >= 2) {
    flow.fields = mergeExtract(flow.fields, dumped);
    return continueDetails(broker, conversation, flow);
  }
  const assigned = assignAnswer(flow.fields, key, rawText);
  if (assigned.error) return [text(assigned.error)];
  if (assigned.skip) flow.skipped = [...flow.skipped, key];
  else flow.fields = assigned.fields;
  return continueDetails(broker, conversation, flow);
}

async function editStep(broker, conversation, flow, rawText) {
  const partial = await extractFromUtterance(rawText);
  if (extractedCount(partial) === 0) {
    return [text('לא קלטתי מה לשנות. אפשר לכתוב למשל: המחיר 2,300,000, הכתובת רחוב הרצל 12.')];
  }
  flow.fields = mergeExtract(flow.fields, partial);
  await syncDraft(broker, conversation, flow);
  await saveFlow(conversation.id, flowPatch('preview', flow));
  return previewReplies(conversation, flow);
}

async function previewStep(broker, conversation, flow, rawText, buttonId) {
  if (buttonId === 'save' || isExactConfirm(rawText)) return commitProperty(broker, conversation, flow);
  if (buttonId === 'edit' || rawText === 'עריכה') {
    await saveFlow(conversation.id, flowPatch('edit', flow));
    return [text('מה לשנות? אפשר משפט אחד, למשל: המחיר 2,300,000 והקומה 4.')];
  }
  return editStep(broker, conversation, flow, rawText);
}

async function commitProperty(broker, conversation, flow) {
  if (String(flow.fields?.address || '').trim().length < 3) {
    return [text('עדיין אין כתובת, אז לא נפתח כרטיס. מה הכתובת המלאה?')];
  }
  const property = flow.propertyId
    ? await updatePropertyFromFields(flow.propertyId, flow.fields, { status: 'active' })
    : await createPropertyFromDraft({ brokerId: broker.id, fields: flow.fields, status: 'active' });
  await attachDraftMedia(conversation.id, property.id);
  flow.code = property.code;
  flow.propertyId = property.id;
  await saveFlow(conversation.id, { flowStep: 'publish_ask', flow, propertyId: property.id });
  return [
    text(`הנכס נשמר כ-${property.code}.`),
    buttons('לפרסם עכשיו בפייסבוק, אינסטגרם וטיקטוק?', [
      { id: 'publish_now', title: 'פרסום עכשיו' },
      { id: 'publish_later', title: 'אחר כך' },
    ]),
  ];
}

async function publishAskStep(conversation, flow, rawText, buttonId) {
  if (buttonId === 'publish_later' || /אחר כך|לא עכשיו|מאוחר/.test(rawText)) {
    await saveFlow(conversation.id, { status: 'closed', flowStep: 'done', flow });
    return [text(`הנכס ${flow.code} שמור. כשתרצה לפרסם, כתוב: פרסם ${flow.code}`)];
  }
  if (buttonId === 'publish_now' || /עכשיו|פרסם|כן/.test(rawText)) return beginMarketing(conversation, flow);
  return [text('לפרסם עכשיו, או להשאיר את הנכס שמור לאחר כך?')];
}

async function marketingStep(broker, conversation, flow, rawText, buttonId) {
  if (buttonId === 'approve_copy' || isExactConfirm(rawText)) {
    if (flow.channels?.length) return afterChannels(broker, conversation, flow, flow.channels);
    return askChannels(conversation, flow);
  }
  if (rawText.length < 8) return [text('אפשר לאשר את הנוסח, או לשלוח נוסח חלופי מלא.')];
  flow.marketingText = rawText;
  await saveFlow(conversation.id, { flowStep: 'marketing', flow });
  return [
    text(`עדכנתי את הנוסח:\n\n${rawText}`),
    buttons('לאשר את הנוסח הזה?', [
      { id: 'approve_copy', title: 'אישור הנוסח' },
      { id: 'cancel', title: 'ביטול' },
    ]),
  ];
}

const CHANNEL_BUTTONS = {
  channels_all: ['facebook', 'instagram', 'tiktok'],
  channels_no_tiktok: ['facebook', 'instagram'],
  channels_facebook: ['facebook'],
  channels_instagram: ['instagram'],
  channels_tiktok: ['tiktok'],
};

async function channelsStep(broker, conversation, flow, rawText, buttonId) {
  const channels = CHANNEL_BUTTONS[buttonId] || parseChannels(rawText);
  return afterChannels(broker, conversation, flow, channels);
}

async function groupsStep(broker, conversation, flow, rawText) {
  const groups = await prisma.facebookGroup.findMany({
    where: { brokerId: broker.id },
    orderBy: { name: 'asc' },
  });
  const selection = parseGroupSelection(rawText, groups);
  if (!selection.ok) return [text('אפשר "כל הקבוצות", מספרים כמו 1,3, או "בלי קבוצות".')];
  return finishPublish(broker, conversation, flow, flow.channels, selection.groups);
}

async function handleIdle(broker, event, { storeInbound = true } = {}) {
  const inbox = await ensureInbox(broker);
  if (storeInbound) await rememberInbound(inbox.id, event, 'broker');
  const rawText = (event.text || '').trim();

  if (isNewPropertyIntent(rawText)) {
    const started = await startOnboarding(broker);
    return { replies: started.replies, conversationId: started.conversation.id };
  }
  if (isMenuIntent(rawText)) return { replies: [text(menuText())], conversationId: inbox.id };
  if (isListIntent(rawText)) return { replies: [text(await listText(broker))], conversationId: inbox.id };
  const request = parsePublishRequest(rawText);
  if (request) return startPublish(broker, request.code, inbox.id, request.channels);
  const deleted = parseDeleteRequest(rawText);
  if (deleted) return { replies: [text(await archiveProperty(broker, deleted))], conversationId: inbox.id };
  const edited = parseEditRequest(rawText);
  if (edited) return startEdit(broker, edited, inbox.id);
  if (/^פרסם(?:ו)?\b/.test(rawText) && parseChannels(rawText).length) {
    const channel = parseChannels(rawText)[0];
    const name = channel === 'instagram' ? 'באינסטגרם' : channel === 'tiktok' ? 'בטיקטוק' : 'בפייסבוק';
    return {
      replies: [text(`כדי לפרסם ${name} צרף את קוד הנכס, למשל: פרסם ${name} APT-104`)],
      conversationId: inbox.id,
    };
  }
  const group = parseAddGroup(rawText);
  if (group) return { replies: [text(await addGroup(broker, group))], conversationId: inbox.id };
  if (isListGroupsIntent(rawText)) return { replies: [text(await groupsText(broker))], conversationId: inbox.id };
  if (isConnectSocialIntent(rawText)) return { replies: [text(await connectText(broker))], conversationId: inbox.id };
  if (event.media?.kind === 'audio') {
    return { replies: [text('הודעות קוליות עדיין לא נקלחות. כדי להתחיל כתוב דירה חדשה.')], conversationId: inbox.id };
  }
  if (event.media) {
    const started = await startOnboarding(broker);
    try {
      await attachMedia(started.conversation, event);
    } catch (error) {
      return { replies: [text(`לא הצלחתי לשמור את הקובץ: ${error.message}`)], conversationId: started.conversation.id };
    }
    const count = await countConversationMedia(started.conversation.id);
    return {
      replies: [text(`קיבלתי את הקובץ (${count}).\n${started.replies[0].text}`)],
      conversationId: started.conversation.id,
    };
  }
  return {
    replies: [text('כדי לקלוט דירה כתוב דירה חדשה. לפרסום כתוב למשל: פרסם בפייסבוק APT-104, פרסם באינסטגרם APT-104, או פרסם בטיקטוק APT-104.')],
    conversationId: inbox.id,
  };
}

async function archiveProperty(broker, code) {
  const property = await findBrokerProperty(broker.id, code);
  if (!property) return `לא מצאתי אצלך נכס ${code}.`;
  if (property.status === 'archived') return `${code} כבר בארכיון.`;
  await prisma.property.update({ where: { id: property.id }, data: { status: 'archived' } });
  return `${code} הועבר לארכיון ולא יופיע ללקוחות.`;
}

async function startEdit(broker, code, inboxId) {
  const property = await findBrokerProperty(broker.id, code);
  if (!property) return { replies: [text(`לא מצאתי אצלך נכס ${code}.`)], conversationId: inboxId };
  const flow = fieldsFromProperty(property);
  const conversation = await prisma.conversation.create({
    data: {
      role: 'broker',
      brokerId: broker.id,
      brokerPhone: broker.phoneNumber,
      status: 'onboarding',
      flowStep: 'edit',
      propertyId: property.id,
      flowData: flow,
    },
  });
  return {
    replies: [text(`עורך את ${property.code}. מה לשנות? אפשר משפט אחד, למשל: המחיר 2,300,000 והקומה 4.`)],
    conversationId: conversation.id,
  };
}

async function startPublish(broker, code, inboxId, channels = []) {
  const property = await findBrokerProperty(broker.id, code);
  if (!property) return { replies: [text(`לא מצאתי אצלך נכס ${code}.`)], conversationId: inboxId };
  const open = await findOnboarding(broker.id);
  if (open) {
    return { replies: [text('יש קליטה פתוחה. סיים אותה או כתוב ביטול, ואז אפשר לפרסם.')], conversationId: open.id };
  }
  const flow = {
    ...fieldsFromProperty(property),
    channels,
  };
  const conversation = await prisma.conversation.create({
    data: {
      role: 'broker',
      brokerId: broker.id,
      brokerPhone: broker.phoneNumber,
      status: 'onboarding',
      flowStep: 'marketing',
      propertyId: property.id,
      flowData: flow,
    },
  });
  const replies = await beginMarketing(conversation, flow);
  return { replies, conversationId: conversation.id };
}
