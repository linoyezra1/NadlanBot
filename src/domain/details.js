import { withoutBuildingNumber } from './waLink.js';

export function isDetailsAsk(text) {
  const clean = String(text || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || clean.length > 80) return false;
  if (!/(?:^|\s)פרטים(?:\s|$)/.test(clean)) return false;
  return !/מחיר|חדר|קומה|כתובת|איפה|מיקום|מ["״]?ר|חניה|מעלית|מרפסת|ממ["״]?ד|תמונ|סרטון|פינוי|שכונ/.test(clean);
}

function money(price) {
  return `${new Intl.NumberFormat('he-IL').format(price)} ₪`;
}

function hebrewList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} ו${items.at(-1)}`;
}

export function formatDryFacts(property) {
  if (!property) return '';
  const deal = property.listingType === 'rent' ? 'להשכרה' : property.listingType === 'sale' ? 'למכירה' : '';
  const street = withoutBuildingNumber(property.address).replace(/^רחוב\s+/, '').trim();
  const where = [street ? `ברחוב ${street}` : '', property.city ? `ב${property.city}` : ''].filter(Boolean).join(' ');
  const amenities = property.amenities || {};
  const extras = [];
  if (amenities.parking === true) extras.push(amenities.parkingKind === 'building' ? 'חניון בניין' : 'חניה');
  if (amenities.elevator === true) extras.push('מעלית');
  if (amenities.balcony === true) extras.push('מרפסת');
  if (amenities.mamad === true) extras.push('ממ"ד');
  const features = String(property.featuresText || '').replace(/אין\s+\S+/g, '').replace(/\s+/g, ' ').trim();
  const floor = String(property.floor || '').trim();
  const bits = [
    ['הדירה', deal].filter(Boolean).join(' '),
    property.rooms != null ? `${property.rooms} חדרים` : '',
    floor ? (/^קומה\b/.test(floor) ? floor : `בקומה ${floor}`) : '',
    property.sizeSqm != null ? `${property.sizeSqm} מ"ר` : '',
    property.price != null && property.price !== '' ? `במחיר ${money(property.price)}` : '',
    where,
    property.neighborhood ? `בשכונת ${property.neighborhood}` : '',
    extras.length ? `עם ${hebrewList(extras)}` : '',
    features,
    property.vacancyDate ? `פינוי ${property.vacancyDate}` : '',
  ].map((bit) => String(bit).trim()).filter(Boolean);
  if (!bits.length) return '';
  return `${bits.join(', ')}.`;
}

function addressSentence(property) {
  const street = withoutBuildingNumber(property.address).replace(/^רחוב\s+/, '').trim();
  const place = [street ? `רחוב ${street}` : '', property.neighborhood, property.city].filter(Boolean).join(', ');
  return place ? `הכתובת היא ${place}.` : '';
}

export function focusedFact(property, question) {
  if (!property || isDetailsAsk(question)) return '';
  const q = String(question || '');
  const bits = [];
  if (/כתובת|איפה|מיקום/.test(q)) bits.push(addressSentence(property));
  else if (/שכונ/.test(q)) bits.push(property.neighborhood ? `השכונה היא ${property.neighborhood}.` : '');
  else if (/(?:^|[\s])עיר(?:[\s?]|$)/.test(q)) bits.push(property.city ? `העיר היא ${property.city}.` : '');
  if (/מחיר|כמה עולה|עולה|תקציב/.test(q) && property.price != null && property.price !== '') bits.push(`המחיר הוא ${money(property.price)}.`);
  if (/חדר/.test(q) && property.rooms != null) bits.push(`בדירה ${property.rooms} חדרים.`);
  if (/קומה/.test(q) && property.floor) {
    const floor = String(property.floor).trim();
    bits.push(/^קומה\b/.test(floor) ? `${floor}.` : `הקומה היא ${floor}.`);
  }
  if (/מ["״]?ר|גודל|שטח/.test(q) && property.sizeSqm != null) bits.push(`השטח הוא ${property.sizeSqm} מ"ר.`);
  if (/חניה/.test(q) && property.amenities?.parking === true) {
    bits.push(property.amenities.parkingKind === 'building' ? 'יש חניון בניין.' : 'יש חניה.');
  }
  if (/מעלית/.test(q) && property.amenities?.elevator === true) bits.push('יש מעלית.');
  if (/מרפסת/.test(q) && property.amenities?.balcony === true) bits.push('יש מרפסת.');
  if (/ממ["״]?ד|ממד/.test(q) && property.amenities?.mamad === true) bits.push('יש ממ"ד.');
  if (/פינוי|פנוי/.test(q) && property.vacancyDate) bits.push(`הפינוי ${property.vacancyDate}.`);
  return bits.filter(Boolean).join(' ');
}

export function commentAnswer(property, question, link) {
  const sentence = isDetailsAsk(question) ? formatDryFacts(property) : focusedFact(property, question);
  if (!sentence) return '';
  if (!link) return sentence;
  return `${sentence}\nלעוד פרטים ולתיאום סיור בוואטסאפ:\n${link}`;
}
