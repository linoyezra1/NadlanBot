import { parseListingType } from './fields.js';
import { postWaMe } from './waLink.js';

function shekel(price) {
  return `${new Intl.NumberFormat('he-IL').format(price)} ש"ח`;
}

function localPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 12) {
    const local = `0${digits.slice(3)}`;
    return `${local.slice(0, 3)}-${local.slice(3)}`;
  }
  return String(phone || '').trim();
}

function amenityLine(amenities) {
  if (!amenities) return '';
  const bits = [];
  if (amenities.balcony) bits.push('מרפסת');
  if (amenities.parking) bits.push('חניה');
  if (amenities.mamad) bits.push('ממ"ד');
  if (amenities.elevator) bits.push('מעלית');
  return bits.join(', ');
}

export function resolveListingType(fields) {
  const explicit = fields?.listingType === 'rent' || fields?.listingType === 'sale'
    ? fields.listingType
    : parseListingType(fields?.listingType);
  if (explicit) return explicit;
  if (fields?.price != null && Number(fields.price) < 200000) return 'rent';
  return 'sale';
}

function contactLine(broker) {
  const name = broker?.businessName || broker?.fullName || '';
  const phone = localPhone(broker?.phoneNumber);
  return [name, phone].filter(Boolean).join(' ');
}

function placeLine(fields) {
  return fields.neighborhood || fields.city || '';
}

export function fallbackMarketing(fields, waLink, broker) {
  const kind = resolveListingType(fields || {});
  const link = waLink || postWaMe(fields?.code);
  const area = placeLine(fields || {});
  const rooms = fields?.rooms != null ? `${fields.rooms} חדרים` : '';
  const address = [fields?.address, fields?.city].filter(Boolean).join(', ');
  const floor = fields?.floor ? `קומה ${fields.floor}` : '';
  const amenities = amenityLine(fields?.amenities);
  const features = String(fields?.featuresText || '').trim();
  const contact = contactLine(broker);
  const lines = kind === 'rent'
    ? [
      `להשכרה${rooms ? ` ${rooms}` : ''}${area ? ` ב${area}` : ''}`,
      '',
      address,
      floor,
      amenities,
      features,
      '',
      fields?.price != null ? `מחיר: ${shekel(fields.price)} לרציניים בלבד` : '',
      fields?.vacancyDate || '',
      '',
      'לפרטים ותיאום סיור:',
      contact,
      'לשליחת הודעה ישירה ותמונות בוואטסאפ:',
      link,
    ]
    : [
      `למכירה${area ? ` ב${area}` : ''}`,
      '',
      [rooms, fields?.sizeSqm != null ? `${fields.sizeSqm} מ"ר` : ''].filter(Boolean).join(', '),
      address,
      floor,
      amenities,
      features,
      '',
      fields?.price != null ? `מחיר: ${shekel(fields.price)}` : '',
      'למביני עניין.',
      '',
      'לפרטים ותיאום ביקור:',
      contact,
      'לפרטים מלאים בוואטסאפ:',
      link,
    ];
  return lines.filter((line) => line != null && line !== '').join('\n');
}

export function ensureMarketingLink(text, waLink) {
  const body = String(text || '').trim();
  if (!waLink) return body;
  if (body.includes(waLink) || body.includes('wa.me/')) return body;
  return `${body}\n\n${waLink}`;
}
