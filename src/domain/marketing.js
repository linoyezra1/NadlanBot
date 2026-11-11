import { parseListingType } from './fields.js';
import { withoutBuildingNumber } from './waLink.js';

function shekel(price) {
  return `${new Intl.NumberFormat('he-IL').format(price)} ש"ח`;
}

function localDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 12) return `0${digits.slice(3)}`;
  if (digits.startsWith('0') && digits.length >= 9) return digits;
  return '';
}

function keptFeatures(text) {
  const clean = String(text || '')
    .replace(/אין\s+\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

export function spokenProperty(fields) {
  const source = fields || {};
  const current = source.amenities || {};
  const amenities = {};
  if (current.parking === true) {
    amenities.parking = true;
    if (current.parkingKind) amenities.parkingKind = current.parkingKind;
  }
  for (const key of ['elevator', 'balcony', 'mamad']) {
    if (current[key] === true) amenities[key] = true;
  }
  const features = keptFeatures(source.featuresText);
  return {
    ...source,
    amenities: Object.keys(amenities).length ? amenities : null,
    featuresText: features || null,
    address: withoutBuildingNumber(source.address) || null,
  };
}

function presentAmenities(amenities) {
  if (!amenities) return [];
  const lines = [];
  if (amenities.parking === true) lines.push(amenities.parkingKind === 'tabu' ? 'חניה בטאבו' : 'חניה');
  if (amenities.elevator === true) lines.push('מעלית');
  if (amenities.balcony === true) lines.push('מרפסת');
  if (amenities.mamad === true) lines.push('ממ"ד');
  return lines;
}

export function resolveListingType(fields) {
  const explicit = fields?.listingType === 'rent' || fields?.listingType === 'sale'
    ? fields.listingType
    : parseListingType(fields?.listingType);
  if (explicit) return explicit;
  if (fields?.price != null && Number(fields.price) < 200000) return 'rent';
  return 'sale';
}

function contactLines(broker) {
  const name = broker?.businessName || broker?.fullName || '';
  const phone = localDigits(broker?.phoneNumber);
  return [name ? `לפרטים ${name}` : '', phone].filter(Boolean);
}

function streetLine(fields) {
  const street = withoutBuildingNumber(fields.address).replace(/^רחוב\s+/, '').trim();
  const city = String(fields.city || '').trim();
  if (!street) return '';
  return `רחוב ${street}${city && !street.includes(city) ? ` ${city}` : ''}`.replace(/\s+/g, ' ');
}

function floorLine(floor) {
  const value = String(floor || '').trim();
  if (!value) return '';
  return /^קומה\b/.test(value) ? value : `קומה ${value}`;
}

function priceLine(price, kind) {
  if (price == null || price === '') return '';
  const amount = Number(price);
  const shown = amount >= 100000 ? shekel(amount).replace(' ש"ח', '') : String(amount);
  const tail = kind === 'rent' ? ' לרציניים בלבד' : '';
  return `מחיר ${shown} ש"ח${tail}`;
}

export function fallbackMarketing(fields, waLink, broker) {
  const spoken = spokenProperty(fields);
  const kind = resolveListingType(spoken);
  const place = spoken.city || spoken.neighborhood || '';
  const rooms = spoken.rooms != null ? `${spoken.rooms} חדרים` : '';
  const project = spoken.neighborhood && spoken.neighborhood !== spoken.city ? spoken.neighborhood : '';
  const vacancy = String(spoken.vacancyDate || '').trim();
  const contact = contactLines(broker);
  const lines = [
    `${kind === 'rent' ? 'להשכרה' : 'למכירה'}${rooms ? ` ${rooms}` : ''}${place ? ` ב${place}` : ''}`,
    project,
    streetLine(spoken),
    floorLine(spoken.floor),
    spoken.sizeSqm != null ? `${spoken.sizeSqm} מ"ר` : '',
    ...presentAmenities(spoken.amenities),
    spoken.featuresText || '',
    vacancy ? (/פינוי/.test(vacancy) ? vacancy : `פינוי ${vacancy}`) : '',
    priceLine(spoken.price, kind),
    kind === 'sale' ? 'למביני עניין' : '',
    ...contact,
  ];
  if (!contact.length && waLink) lines.push(waLink);
  return lines.filter((line) => line != null && String(line).trim() !== '').join('\n');
}

const YES = /^(כן|יש|נכון|קיים)$/;
const NO = /^(לא|אין|בלי)$/;

export function polishListing(text) {
  const source = String(text || '').replace(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, '');
  const out = [];
  for (const raw of source.split(/\n/)) {
    const line = raw.trim();
    if (!line || /^אין\b/.test(line)) continue;
    if (/^(https?:\/\/)?wa\.me\//i.test(line)) continue;
    const bare = line.match(/^([^:]{2,30}):\s*$/);
    if (bare) {
      if (/לפרטים/.test(bare[1])) out.push('לפרטים');
      continue;
    }
    const labeled = line.match(/^([^:]{2,30}):\s*(.+)$/);
    if (!labeled) {
      const plain = line.replace(/\b972(\d{8,9})\b/g, '0$1');
      const safe = /חדר|מ["״]ר|מחיר|קומה|ש"ח|ש״ח|₪|פינוי/.test(plain) ? plain : withoutBuildingNumber(plain);
      if (safe) out.push(safe);
      continue;
    }
    const label = labeled[1].trim();
    const value = labeled[2].trim().replace(/\b972(\d{8,9})\b/g, '0$1');
    if (NO.test(value) || /^אין\b/.test(value)) continue;
    if (/כתובת/.test(label)) {
      const street = withoutBuildingNumber(value);
      if (street) out.push(/^רחוב\b/.test(street) ? street : `רחוב ${street}`);
    } else if (/קומה/.test(label)) {
      out.push(floorLine(value));
    } else if (/גודל|שטח|מ["״]ר/.test(label)) {
      out.push(value);
    } else if (/חניה|חצר|מעלית|מרפסת|ממ/.test(label)) {
      out.push(YES.test(value) ? label : `${label} ${value}`.replace(/\s+/g, ' '));
    } else if (/פינוי|תאריך/.test(label)) {
      out.push(/פינוי/.test(value) ? value : `פינוי ${value}`);
    } else if (/מחיר/.test(label)) {
      out.push(`מחיר ${value}`);
    } else if (/טלפון|נייד/.test(label)) {
      out.push(value);
    } else if (/לפרטים/.test(label)) {
      out.push(`לפרטים ${value}`);
    } else {
      out.push(`${label} ${value}`);
    }
  }
  return out.join('\n');
}

export function ensureMarketingLink(text, waLink) {
  const body = String(text || '').trim();
  if (!waLink) return body;
  if (body.includes(waLink) || body.includes('wa.me/')) return body;
  return `${body}\n\n${waLink}`;
}
