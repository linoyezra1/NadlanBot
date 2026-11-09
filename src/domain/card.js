export function formatPrice(price) {
  if (price == null || price === '') return 'לא צוין';
  return `${new Intl.NumberFormat('he-IL').format(price)} ₪`;
}

export function formatAmenities(amenities) {
  return formatAmenityLine(amenities);
}

function formatAmenityLine(amenities) {
  if (!amenities) return null;
  const labels = [
    ['parking', 'חניה'],
    ['elevator', 'מעלית'],
    ['balcony', 'מרפסת'],
    ['mamad', 'ממ"ד'],
  ];
  const yes = [];
  const no = [];
  for (const [key, label] of labels) {
    if (amenities[key] === true) yes.push(label);
    if (amenities[key] === false) no.push(label);
  }
  if (!yes.length && !no.length) return null;
  return [
    yes.length ? `יש ${yes.join(', ')}` : null,
    no.length ? `אין ${no.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
}

export function toPublicCard(property) {
  const media = Array.isArray(property.media) ? property.media : [];
  return {
    code: property.code,
    listingType: property.listingType || null,
    address: property.address || null,
    city: property.city || null,
    neighborhood: property.neighborhood || null,
    rooms: property.rooms ?? null,
    floor: property.floor || null,
    sizeSqm: property.sizeSqm ?? null,
    price: property.price ?? null,
    amenities: property.amenities || null,
    vacancyDate: property.vacancyDate || null,
    featuresText: property.featuresText || null,
    status: property.status,
    media: media.map((item) => ({
      type: item.mediaType,
      url: item.cloudUrl,
      tags: Array.isArray(item.tags) ? item.tags : [],
      caption: item.caption || null,
    })),
  };
}

export function fieldsFromProperty(property) {
  return {
    address: property.address || null,
    city: property.city || null,
    neighborhood: property.neighborhood || null,
    rooms: property.rooms ?? null,
    floor: property.floor || null,
    sizeSqm: property.sizeSqm ?? null,
    price: property.price ?? null,
    amenities: property.amenities || null,
    vacancyDate: property.vacancyDate || null,
    featuresText: property.featuresText || null,
    ownerName: null,
    ownerPhone: null,
    privateNotes: null,
  };
}

function placeLine(fields) {
  return [fields.neighborhood, fields.city].filter(Boolean).join(', ');
}

export function formatDraftCard(fields, code = 'טיוטה') {
  const amenityLine = formatAmenityLine(fields.amenities);
  const facts = [
    fields.rooms != null ? `${fields.rooms} חדרים` : null,
    fields.floor ? `קומה ${fields.floor}` : null,
    fields.sizeSqm != null ? `${fields.sizeSqm} מ"ר` : null,
  ].filter(Boolean);
  const lines = [
    `תעודת זהות לנכס ${code}`,
    '',
    fields.address ? `📍 ${fields.address}${placeLine(fields) ? ` · ${placeLine(fields)}` : ''}` : `📍 ${placeLine(fields) || 'כתובת חסרה'}`,
    facts.length ? `🚪 ${facts.join(' | ')}` : null,
    fields.price != null ? `💰 ${formatPrice(fields.price)}` : null,
    amenityLine ? `✅ ${amenityLine}` : null,
    fields.vacancyDate ? `🗓️ פינוי: ${fields.vacancyDate}` : null,
    fields.featuresText ? `✨ ${fields.featuresText}` : null,
    '',
    '🔒 פרטי בעלים (חסוי, לא מוצג ללקוחות ולא נשלח לבוט):',
    `שם: ${fields.ownerName || 'לא צוין'}`,
    `טלפון: ${fields.ownerPhone || 'לא צוין'}`,
    `הערות: ${fields.privateNotes || 'אין'}`,
  ];
  return lines.filter((line) => line != null).join('\n');
}

export function formatPublicSummary(property) {
  const where = [property.neighborhood, property.city].filter(Boolean).join(', ');
  const deal = property.listingType === 'rent' ? 'להשכרה' : property.listingType === 'sale' ? 'למכירה' : null;
  return [
    deal,
    property.rooms != null ? `${property.rooms} חדרים` : null,
    where || null,
    property.price != null ? formatPrice(property.price) : null,
    property.featuresText || null,
  ].filter(Boolean).join(' · ');
}
