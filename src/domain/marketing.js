import { formatAmenities, formatPrice } from './card.js';

export function fallbackMarketing(fields, waLink) {
  const place = [fields.neighborhood, fields.city].filter(Boolean).join(', ');
  const facts = [
    fields.sizeSqm != null ? `${fields.sizeSqm} מ"ר` : null,
    fields.floor ? `קומה ${fields.floor}` : null,
  ].filter(Boolean);
  const lines = [
    `🏠 ${fields.rooms != null ? `${fields.rooms} חדרים` : 'דירה'}${place ? ` ב${place}` : ''}`,
    fields.address ? `📍 ${fields.address}` : null,
    facts.length ? facts.join(' · ') : null,
    fields.price != null ? `💰 ${formatPrice(fields.price)}` : null,
    formatAmenities(fields.amenities),
    fields.featuresText || null,
    '',
    'לפרטים ותיאום סיור:',
    waLink,
  ];
  return lines.filter((line) => line != null && line !== '').join('\n');
}

export function ensureMarketingLink(text, waLink) {
  const body = String(text || '').trim();
  if (!waLink) return body;
  if (body.includes(waLink) || body.includes('wa.me/')) return body;
  return `${body}\n\nלפרטים ותיאום סיור:\n${waLink}`;
}
