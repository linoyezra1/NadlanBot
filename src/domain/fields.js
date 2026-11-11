import { normalizePhone } from './phone.js';

export const AMENITY_KEYS = ['parking', 'elevator', 'balcony', 'mamad'];

export const AMENITY_LABELS = {
  parking: 'חניה',
  elevator: 'מעלית',
  balcony: 'מרפסת',
  mamad: 'ממ"ד',
};

export const FIELD_ORDER = [
  'listingType',
  'address',
  'city',
  'neighborhood',
  'rooms',
  'floor',
  'sizeSqm',
  'price',
  'amenities',
  'vacancyDate',
  'featuresText',
  'ownerName',
  'ownerPhone',
  'privateNotes',
];

const NOT_ASKED = new Set(['privateNotes']);

const OPTIONAL = new Set([
  'neighborhood',
  'floor',
  'sizeSqm',
  'vacancyDate',
  'featuresText',
  'ownerName',
  'ownerPhone',
  'privateNotes',
]);

const SCALAR_KEYS = FIELD_ORDER.filter((key) => key !== 'amenities');

export function blankFields() {
  return {
    listingType: null,
    address: null,
    city: null,
    neighborhood: null,
    rooms: null,
    floor: null,
    sizeSqm: null,
    price: null,
    amenities: null,
    vacancyDate: null,
    featuresText: null,
    ownerName: null,
    ownerPhone: null,
    privateNotes: null,
  };
}

export function parseListingType(text) {
  const value = String(text || '');
  const rent = value.search(/השכרה/);
  const sale = value.search(/מכירה/);
  if (rent >= 0 && (sale < 0 || rent < sale)) return 'rent';
  if (sale >= 0) return 'sale';
  return null;
}

export function isSkip(text) {
  return /^(דלג|אין מידע|לא יודע|לא ידוע|-|—|מדלג)$/i.test(String(text || '').trim());
}

export function missingAmenityKeys(amenities) {
  const current = amenities || {};
  return AMENITY_KEYS.filter((key) => typeof current[key] !== 'boolean');
}

export function parseAmenities(text) {
  const source = String(text || '');
  const rules = [
    ['parking', /חני[הי]ה?|חניון/],
    ['elevator', /מעלית/],
    ['balcony', /מרפסת/],
    ['mamad', /ממ["״׳'`]?ד|ממד/],
  ];
  const found = {};
  if (/^(אין|אין כלום|אף אחד|כלום)$/.test(source.trim())) {
    for (const key of AMENITY_KEYS) found[key] = false;
    return found;
  }
  for (const [key, pattern] of rules) {
    const match = pattern.exec(source);
    if (!match) continue;
    const prefix = source.slice(Math.max(0, match.index - 10), match.index);
    found[key] = !/(אין|בלי|ללא|לא)\s*$/.test(prefix);
  }
  if (typeof found.parking === 'boolean') {
    if (found.parking && /חניון|חניה\s+ל(?:בניין|בנין)|חנייה\s+ל(?:בניין|בנין)/.test(source)) found.parkingKind = 'building';
    else if (found.parking) found.parkingKind = 'tabu';
    else found.parkingKind = null;
  }
  return Object.keys(found).length ? found : null;
}

export function parsePrice(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  if (typeof text === 'number' && Number.isFinite(text)) {
    return text >= 1000 ? Math.round(text) : null;
  }
  const million = raw.match(/(\d+(?:[.,]\d+)?)\s*מיליון/);
  if (million) return Math.round(Number(million[1].replace(',', '.')) * 1_000_000);
  const thousand = raw.match(/(\d+(?:[.,]\d+)?)\s*אלף/);
  if (thousand) return Math.round(Number(thousand[1].replace(',', '.')) * 1000);
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value < 1000) return null;
  return value;
}

export function parseRooms(text) {
  if (typeof text === 'number' && text > 0 && text <= 30) return text;
  const match = String(text ?? '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 30) return null;
  return value;
}

export function parseSize(text) {
  if (typeof text === 'number' && text >= 8 && text <= 2000) return text;
  const match = String(text ?? '').match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 8 || value > 2000) return null;
  return value;
}

export function parseFloor(text) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  if (/קרקע/.test(value)) return 'קרקע';
  const match = value.match(/-?\d+/);
  if (match) return match[0];
  return value.slice(0, 20);
}

function cleanLine(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '').replace(/[.\s]+$/g, '').trim();
}

function clipWords(value, count) {
  return cleanLine(value).split(/\s+/).filter(Boolean).slice(0, count).join(' ');
}

export function coerceField(key, value) {
  if (value == null || value === '') return null;
  if (key === 'listingType') {
    if (value === 'sale' || value === 'rent') return value;
    return parseListingType(value);
  }
  if (key === 'rooms') return parseRooms(value);
  if (key === 'sizeSqm') return parseSize(value);
  if (key === 'price') return parsePrice(value);
  if (key === 'floor') return parseFloor(value);
  if (key === 'ownerPhone') {
    const phone = normalizePhone(value);
    return phone && phone.length >= 11 ? phone : null;
  }
  const text = cleanLine(value);
  if (!text) return null;
  if (key === 'address' && text.length < 3) return null;
  if (key === 'city') return clipWords(text, 3) || null;
  if (key === 'neighborhood') return clipWords(text, 4) || null;
  if (key === 'ownerName') return clipWords(text, 4) || null;
  return text.slice(0, key === 'featuresText' || key === 'privateNotes' ? 2000 : 160);
}

export function mergeExtract(fields, partial) {
  const next = { ...blankFields(), ...fields, amenities: fields?.amenities ? { ...fields.amenities } : null };
  if (!partial) return next;
  for (const key of SCALAR_KEYS) {
    if (partial[key] == null || partial[key] === '') continue;
    const normalized = coerceField(key, partial[key]);
    if (normalized != null) next[key] = normalized;
  }
  const patch = {};
  for (const key of AMENITY_KEYS) {
    if (typeof partial[key] === 'boolean') patch[key] = partial[key];
  }
  if (partial.amenities && typeof partial.amenities === 'object') {
    for (const key of AMENITY_KEYS) {
      if (typeof partial.amenities[key] === 'boolean') patch[key] = partial.amenities[key];
    }
    if (partial.amenities.parkingKind === 'tabu' || partial.amenities.parkingKind === 'building') {
      patch.parkingKind = partial.amenities.parkingKind;
    }
  }
  if (partial.parkingKind === 'tabu' || partial.parkingKind === 'building') patch.parkingKind = partial.parkingKind;
  if (patch.parking === true && patch.parkingKind !== 'building') patch.parkingKind = patch.parkingKind || 'tabu';
  if (patch.parking === false) patch.parkingKind = null;
  if (Object.keys(patch).length) next.amenities = { ...(next.amenities || {}), ...patch };
  return next;
}

export function extractedCount(partial) {
  if (!partial) return 0;
  let count = 0;
  for (const key of SCALAR_KEYS) {
    if (partial[key] != null && partial[key] !== '') count += 1;
  }
  if (AMENITY_KEYS.some((key) => typeof partial[key] === 'boolean')) count += 1;
  if (partial.amenities && AMENITY_KEYS.some((key) => typeof partial.amenities[key] === 'boolean')) count += 1;
  return count;
}

export function nextField(fields, skipped = []) {
  for (const key of FIELD_ORDER) {
    if (skipped.includes(key) || NOT_ASKED.has(key)) continue;
    if (key === 'amenities') {
      if (missingAmenityKeys(fields.amenities).length) return key;
      continue;
    }
    if (fields[key] == null || fields[key] === '') return key;
  }
  return null;
}

export function questionFor(key, fields) {
  if (key === 'amenities') {
    const missing = missingAmenityKeys(fields?.amenities).map((item) => AMENITY_LABELS[item]);
    if (missing.length === AMENITY_KEYS.length) {
      return 'יש חניה בטאבו, חניון לבניין, או אין חניה? ואפשר להוסיף מעלית, מרפסת וממ"ד, למשל: יש חניה ומעלית, אין מרפסת, יש ממ"ד.';
    }
    if (missing.length === 1 && missing[0] === 'חניה') return 'יש חניה בטאבו, חניון לבניין, או אין חניה?';
    return `עדיין חסר לי: ${missing.join(', ')}. יש או אין?`;
  }
  const questions = {
    listingType: 'הדירה למכירה או להשכרה? כתוב "למכירה" או "להשכרה".',
    address: 'מה הכתובת המלאה? לדוגמה: רחוב הרצל 10.',
    city: 'באיזו עיר הנכס?',
    neighborhood: 'באיזו שכונה? אם אין, כתוב דלג.',
    rooms: 'כמה חדרים? אפשר גם 3.5.',
    floor: 'באיזו קומה? אם זו קומת קרקע, כתוב קרקע. אפשר לדלג.',
    sizeSqm: 'כמה מ"ר בנוי? אפשר לדלג.',
    price: fields?.listingType === 'rent'
      ? 'מה דמי השכירות לחודש? לדוגמה: 6,500.'
      : 'מה המחיר המבוקש? לדוגמה: 2,450,000 או 2.45 מיליון.',
    vacancyDate: 'מתי אפשר להיכנס, או מה תאריך הפינוי? אפשר לדלג.',
    featuresText: fields?.listingType === 'rent'
      ? 'מה כדאי להדגיש להשכרה? למשל: חדשה מהקבלן, מטבח משודרג, מחסן. אפשר לדלג.'
      : 'מה כדאי להדגיש למכירה? למשל: נוף לים, בניין בוטיק, מתחת למחיר השוק. אפשר לדלג.',
    ownerName: 'שם בעל הנכס נשמר חסוי ולא נחשף ללקוחות. איך קוראים לו? אפשר לדלג.',
    ownerPhone: 'טלפון של בעל הנכס (חסוי אף הוא). אפשר לדלג.',
    privateNotes: 'הערות אישיות אליך בלבד, למשל מתי לא נוח להתקשר. אפשר לדלג.',
  };
  return questions[key] || 'נמשיך לפרט הבא.';
}

export function assignAnswer(fields, key, text) {
  const source = String(text || '').trim();
  if (isSkip(source)) {
    if (!OPTIONAL.has(key)) return { error: 'את השדה הזה אי אפשר לדלג. הוא חלק מתעודת הנכס.' };
    return { fields, skip: true };
  }
  if (key === 'amenities') {
    const missing = missingAmenityKeys(fields.amenities);
    if (missing.length === 1 && /^(כן|יש|נכון)$/.test(source)) {
      const added = missing[0] === 'parking'
        ? { parking: true, parkingKind: 'tabu' }
        : { [missing[0]]: true };
      return { fields: { ...fields, amenities: { ...(fields.amenities || {}), ...added } } };
    }
    if (missing.length === 1 && /^(לא|אין)$/.test(source)) {
      return { fields: { ...fields, amenities: { ...(fields.amenities || {}), [missing[0]]: false } } };
    }
    const parsed = parseAmenities(source);
    if (!parsed) {
      return { error: 'לא קלטתי. לדוגמה: יש חניה ומעלית, אין מרפסת, יש ממ"ד.' };
    }
    return { fields: { ...fields, amenities: { ...(fields.amenities || {}), ...parsed } } };
  }
  const value = coerceField(key, source);
  if (value == null) {
    return { error: `לא הצלחתי לקרוא את זה. ${questionFor(key, fields)}` };
  }
  return { fields: { ...fields, [key]: value } };
}

function labeled(text, pattern) {
  const match = text.match(pattern);
  return match ? cleanLine(match[1]) : null;
}

export function naiveExtract(text) {
  const source = String(text || '');
  const partial = {};
  const listingType = parseListingType(source);
  if (listingType) partial.listingType = listingType;
  const address = labeled(source, /(?:^|\n)\s*(?:כתובת|רחוב)\s*[:\-]\s*([^\n]+)/);
  if (address) partial.address = /^רחוב\b/.test(address) ? address : (/רחוב\s*[:\-]/m.test(source) ? `רחוב ${address}` : address);
  const inlineAddress = source.match(/(?:^|\n|,|\s)רחוב\s+([^\n,]{3,60})/);
  if (!partial.address && inlineAddress) partial.address = `רחוב ${cleanLine(inlineAddress[1])}`;

  partial.city = labeled(source, /(?:^|\n)\s*עיר\s*[:\-]\s*([^\n]+)/) || labeled(source, /בעיר\s+([א-ת"'\s]{2,20})/);
  partial.neighborhood = labeled(source, /(?:^|\n)\s*שכונה\s*[:\-]\s*([^\n]+)/)
    || labeled(source, /שכונת\s+([א-ת"'\s]{2,25})/);

  const rooms = source.match(/(\d+(?:[.,]\d+)?)\s*חדר/);
  if (rooms) partial.rooms = rooms[1];
  const labeledRooms = labeled(source, /(?:^|\n)\s*חדרים\s*[:\-]\s*([^\n]+)/);
  if (labeledRooms) partial.rooms = labeledRooms;

  const floor = labeled(source, /(?:^|\n)\s*קומה\s*[:\-]\s*([^\n,]+)/) || source.match(/קומה\s+([^\s,]+)/)?.[1];
  if (floor) partial.floor = floor;

  const size = source.match(/(\d+(?:[.,]\d+)?)\s*מ["״']?\s*ר/);
  if (size) partial.sizeSqm = size[1];

  const price = labeled(source, /(?:^|\n)\s*מחיר(?:\s+מבוקש)?\s*[:\-]\s*([^\n]+)/)
    || source.match(/(\d+(?:[.,]\d+)?)\s*מיליון/)?.[0]
    || source.match(/(\d[\d.,]{3,})\s*(?:₪|ש"ח|שקל)/)?.[1];
  if (price) partial.price = price;

  const amenities = parseAmenities(source);
  if (amenities) Object.assign(partial, amenities);

  const vacancy = labeled(source, /(?:^|\n)\s*(?:פינוי|תאריך פינוי|כניסה)\s*[:\-]\s*([^\n,.]+)/);
  if (vacancy) partial.vacancyDate = vacancy;

  const features = labeled(source, /(?:^|\n)\s*(?:יתרונות|תיאור)\s*[:\-]\s*([^\n]+)/);
  if (features) partial.featuresText = features;
  else {
    const soft = source.match(/((?:משופצת|מחודשת|עורפית|מוארת)[^.\n]{0,80})/);
    if (soft) partial.featuresText = cleanLine(soft[1]);
  }

  partial.ownerName = labeled(source, /(?:^|\n)\s*(?:בעל(?:ת)? הנכס|הבעלים|מוכר)\s*[:\-]\s*([^\n,]+)/);
  const phone = labeled(source, /(?:^|\n)\s*(?:טלפון|נייד)\s*[:\-]\s*([0-9+\-\s]{9,18})/)
    || source.match(/(?:טלפון|נייד)\s*[:\-]?\s*([0-9+\-\s]{9,18})/)?.[1];
  if (phone) partial.ownerPhone = phone;
  partial.privateNotes = labeled(source, /(?:^|\n)\s*(?:הערות(?:\s+אישיות)?|הערה)\s*[:\-]\s*([^\n]+)/);

  for (const key of Object.keys(partial)) {
    if (partial[key] == null || partial[key] === '') delete partial[key];
  }
  return partial;
}

export const DETAILS_INTRO = [
  'אפשר לשלוח עכשיו הודעה אחת עם כל הפרטים:',
  'כתובת, עיר, שכונה, חדרים, קומה, מ"ר, מחיר, חניה / מעלית / מרפסת / ממ"ד, תאריך פינוי ויתרונות.',
  'אפשר לצרף גם שם, טלפון והערות של בעל הנכס. הפרטים האלה נשמרים חסוי ולא יוצאים החוצה.',
  'אם נוח יותר לענות שלב-שלב, כתוב: שלב אחר שלב.',
].join('\n');
