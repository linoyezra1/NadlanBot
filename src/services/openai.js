import OpenAI from 'openai';
import { config } from '../config.js';
import { ensureMarketingLink, fallbackMarketing } from '../domain/marketing.js';
import { naturalWaLink, postWaMe } from '../domain/waLink.js';
import { SYSTEM_PROMPT_POST_GENERATION } from './socialPublisher.js';
import { hotLeadSignal } from '../domain/intents.js';
import { highlightsFromTranscript } from '../domain/hotLead.js';
import { logger } from '../logger.js';
import { clientProperty, parkingPhrase } from '../domain/disclosure.js';
import { INQUIRY_SYSTEM_PROMPT } from './leads/prompt.js';

const INQUIRY_TIMEOUT_MS = 3000;

export function hasOpenAI() {
  return Boolean(process.env.OPENAI_API_KEY || config.openaiApiKey);
}

function client() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || config.openaiApiKey,
    timeout: 20000,
  });
}

export function propertyFacts(property) {
  if (!property) return null;
  const amenities = property.amenities || {};
  const advantages = [
    property.featuresText,
    parkingPhrase(amenities),
    amenities.elevator === true ? 'מעלית' : null,
    amenities.balcony === true ? 'מרפסת' : null,
    amenities.mamad === true ? 'ממ"ד' : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ"ר` : null,
    property.vacancyDate ? `פינוי ${property.vacancyDate}` : null,
  ].filter(Boolean);
  const address = [property.address, property.neighborhood, property.city].filter(Boolean).join(', ');
  return {
    listingType: property.listingType || null,
    price: property.price ?? null,
    rooms: property.rooms ?? null,
    floor: property.floor || null,
    address: address || null,
    advantages,
  };
}

export function inquiryMessages({ authorName, question, property, waLink, recent = [] }) {
  return [
    { role: 'system', content: INQUIRY_SYSTEM_PROMPT },
    ...recent.filter((line) => line?.role && line?.content).slice(-6),
    {
      role: 'user',
      content: JSON.stringify({
        authorName: authorName || null,
        question: question || '',
        property: propertyFacts(property),
        waLink: waLink || null,
      }),
    },
  ];
}

export function withDeadline(work, ms = INQUIRY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('openai timeout')), ms);
  });
  return Promise.race([Promise.resolve().then(work), timeout]).finally(() => clearTimeout(timer));
}

function ensureWaLink(answer, waLink) {
  const text = String(answer || '').trim();
  if (!text) return '';
  if (!waLink || text.includes('wa.me/')) return text;
  return `${text}\n${waLink}`;
}

export async function generateInquiryReply({ authorName, question, property, waLink, recent, complete, timeoutMs = INQUIRY_TIMEOUT_MS } = {}) {
  const userText = question || '';
  console.log('Calling OpenAI with prompt for:', userText);
  if (!complete && !hasOpenAI()) {
    console.error('OpenAI failed, falling back:', 'OPENAI_API_KEY is empty');
    return null;
  }
  const started = Date.now();
  try {
    const response = await withDeadline(() => (complete || defaultInquiryComplete)(
      inquiryMessages({ authorName, question, property, waLink, recent }),
    ), timeoutMs);
    const answer = ensureWaLink(response?.choices?.[0]?.message?.content, waLink);
    if (!answer) {
      console.error('OpenAI failed, falling back:', 'empty response');
      return null;
    }
    console.log('OpenAI answered in', Date.now() - started, 'ms:', answer);
    console.log('AI response generated for:', authorName);
    return answer;
  } catch (error) {
    console.error('OpenAI failed, falling back:', error.message);
    logger.warn('inquiry reply failed', error.message);
    return null;
  }
}

export function readViewingDecision(content) {
  const match = String(content || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return typeof parsed.viewing === 'boolean' ? parsed.viewing : null;
  } catch {
    return null;
  }
}

export async function brokerShouldHear(message, { complete, timeoutMs = INQUIRY_TIMEOUT_MS } = {}) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (!complete && !hasOpenAI()) return hotLeadSignal(text);
  try {
    const response = await withDeadline(() => (complete || defaultViewingComplete)(text), timeoutMs);
    const viewing = readViewingDecision(response?.choices?.[0]?.message?.content);
    return viewing == null ? hotLeadSignal(text) : viewing;
  } catch (error) {
    logger.warn('viewing decision failed', error.message);
    return hotLeadSignal(text);
  }
}

function defaultViewingComplete(message) {
  return client().chat.completions.create({
    model: config.openaiModel,
    temperature: 0,
    max_tokens: 30,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'אתה מחליט אם הודעת ליד מעניינת מתווך נדל"ן.',
          'החזר JSON בלבד: {"viewing": true} או {"viewing": false}.',
          'true רק אם הליד רותח ורוצה לראות את הדירה: לבוא, לקבוע ביקור, או לשאול מתי מראים.',
          'דוגמאות true: "אפשר לראות את הדירה", "מתי אפשר לראות", "אפשר לבוא?", "מתי מראים דירה?"',
          'false לשאלות על מחיר, חדרים, קומה, כתובת, תמונות, תודה, או בקשת פרטים כללית.',
        ].join(' '),
      },
      { role: 'user', content: message },
    ],
  }, { timeout: INQUIRY_TIMEOUT_MS });
}

function defaultInquiryComplete(messages) {
  return client().chat.completions.create({
    model: config.openaiModel,
    temperature: 0.5,
    max_tokens: 180,
    messages,
  }, { timeout: INQUIRY_TIMEOUT_MS });
}

function publicFields(fields) {
  return {
    address: fields.address,
    city: fields.city,
    neighborhood: fields.neighborhood,
    rooms: fields.rooms,
    floor: fields.floor,
    sizeSqm: fields.sizeSqm,
    price: fields.price,
    amenities: fields.amenities,
    vacancyDate: fields.vacancyDate,
    featuresText: fields.featuresText,
    listingType: fields.listingType,
  };
}

export async function generateMarketing(fields, waLink, broker) {
  const visible = clientProperty(fields, 'post') || fields;
  const link = waLink || naturalWaLink(visible) || postWaMe(fields?.code);
  const fallback = ensureMarketingLink(fallbackMarketing(visible, link, broker), link);
  if (!hasOpenAI()) return fallback;
  try {
    const response = await client().chat.completions.create({
      model: config.openaiModel,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_POST_GENERATION },
        {
          role: 'user',
          content: JSON.stringify({
            property: Object.fromEntries(Object.entries(publicFields(visible)).filter(([, value]) => value != null && value !== '')),
            broker: {
              name: broker?.businessName || broker?.fullName || null,
              phone: broker?.phoneNumber || null,
            },
            waLink: link,
          }),
        },
      ],
    });
    return ensureMarketingLink(response.choices[0]?.message?.content || fallback, link);
  } catch (error) {
    logger.warn('marketing generation failed', error.message);
    return fallback;
  }
}

export async function extractWithModel(text) {
  const response = await client().chat.completions.create({
    model: config.openaiModel,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'חלץ שדות נכס מהודעה בעברית.',
          'החזר JSON עם המפתחות: listingType, address, city, neighborhood, rooms, floor, sizeSqm, price, parking, elevator, balcony, mamad, vacancyDate, featuresText, ownerName, ownerPhone, privateNotes.',
          'listingType הוא sale או rent רק אם נאמר במפורש למכירה או להשכרה.',
          'price הוא מספר בשקלים. rooms ו-sizeSqm מספרים. parking, elevator, balcony, mamad הם true או false רק אם נאמרו במפורש.',
          'שדה לא ידוע יהיה null. אל תנחש.',
        ].join(' '),
      },
      { role: 'user', content: text },
    ],
  });
  return JSON.parse(response.choices[0]?.message?.content || '{}');
}

export async function summarizeForBroker({ card, messages, leadName, preferredTime }) {
  const fallback = highlightsFromTranscript(messages);
  if (!hasOpenAI()) return fallback;
  try {
    const transcript = messages
      .filter((message) => message.sender === 'lead' || message.sender === 'bot')
      .map((message) => `${message.sender}: ${message.text || ''}`)
      .join('\n')
      .slice(-6000);
    const response = await client().chat.completions.create({
      model: config.openaiModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'סכם שיחת ליד נדל"ן בעברית ב-2 עד 4 שורות למתווך. רק מה שנאמר: תקציב, דחיפות, אילוצים, מה ביקש לראות. אל תמציא ואל תזכיר בעל נכס.',
        },
        {
          role: 'user',
          content: `נכס ${card.code}. לקוח: ${leadName}. שעה: ${preferredTime}.\n${transcript}`,
        },
      ],
    });
    return (response.choices[0]?.message?.content || fallback).trim();
  } catch (error) {
    logger.warn('summary failed', error.message);
    return fallback;
  }
}

export async function completeLeadTurn({ messages, tools }) {
  return client().chat.completions.create({
    model: config.openaiModel,
    temperature: 0.4,
    messages,
    tools,
  }, { timeout: INQUIRY_TIMEOUT_MS });
}
