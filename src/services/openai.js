import OpenAI from 'openai';
import { config } from '../config.js';
import { ensureMarketingLink, fallbackMarketing } from '../domain/marketing.js';
import { naturalWaLink, postWaMe } from '../domain/waLink.js';
import { SYSTEM_PROMPT_POST_GENERATION } from './socialPublisher.js';
import { highlightsFromTranscript } from '../domain/hotLead.js';
import { logger } from '../logger.js';

export function hasOpenAI() {
  return Boolean(config.openaiApiKey);
}

function client() {
  return new OpenAI({ apiKey: config.openaiApiKey, timeout: 20000 });
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
  const link = waLink || naturalWaLink(fields) || postWaMe(fields?.code);
  const fallback = ensureMarketingLink(fallbackMarketing(fields, link, broker), link);
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
            property: publicFields(fields),
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
  });
}
