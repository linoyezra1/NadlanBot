export const DISCLOSURE_MODES = ['say', 'private', 'hide'];

export const DISCLOSURE_FIELDS = [
  ['price', 'מחיר'],
  ['rooms', 'חדרים'],
  ['floor', 'קומה'],
  ['sizeSqm', 'מ"ר'],
  ['address', 'כתובת'],
  ['neighborhood', 'שכונה'],
  ['city', 'עיר'],
  ['parking', 'חניה'],
  ['elevator', 'מעלית'],
  ['balcony', 'מרפסת'],
  ['mamad', 'ממ"ד'],
  ['vacancyDate', 'פינוי'],
  ['featuresText', 'יתרונות'],
];

export const HIDDEN_ANSWER = 'אין לי את המידע הזה לגבי הדירה';

const AMENITY_FIELDS = new Set(['parking', 'elevator', 'balcony', 'mamad']);
const SCALAR_FIELDS = DISCLOSURE_FIELDS.map(([key]) => key).filter((key) => !AMENITY_FIELDS.has(key));

export function disclosureMode(disclosure, key) {
  const value = disclosure?.[key];
  return DISCLOSURE_MODES.includes(value) ? value : 'say';
}

export function readDisclosure(source) {
  const next = {};
  for (const [key] of DISCLOSURE_FIELDS) {
    const value = source?.[`show_${key}`];
    if (DISCLOSURE_MODES.includes(value)) next[key] = value;
  }
  return next;
}

export function allows(mode, audience) {
  if (mode === 'hide') return false;
  if (mode === 'private') return audience === 'private';
  return true;
}

export function parkingPhrase(amenities) {
  if (!amenities || typeof amenities.parking !== 'boolean') return null;
  if (amenities.parking !== true) return 'אין חניה';
  if (amenities.parkingKind === 'building') return 'חניון בניין, החנייה לא בטאבו';
  return 'חנייה בטאבו';
}

export function applyParkingChoice(amenities, value) {
  const next = { ...(amenities || {}) };
  if (value === 'building') {
    next.parking = true;
    next.parkingKind = 'building';
  } else if (value === 'tabu' || value === 'yes') {
    next.parking = true;
    next.parkingKind = 'tabu';
  } else if (value === 'no') {
    next.parking = false;
    next.parkingKind = null;
  }
  return next;
}

export function clientProperty(property, audience) {
  if (!property) return property;
  const disclosure = property.disclosure || {};
  const next = { ...property, amenities: { ...(property.amenities || {}) } };
  for (const key of SCALAR_FIELDS) {
    if (!allows(disclosureMode(disclosure, key), audience)) next[key] = null;
  }
  for (const key of AMENITY_FIELDS) {
    if (!allows(disclosureMode(disclosure, key), audience)) {
      delete next.amenities[key];
      if (key === 'parking') delete next.amenities.parkingKind;
    }
  }
  return next;
}
