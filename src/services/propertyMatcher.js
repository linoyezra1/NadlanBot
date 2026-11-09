import { parseListingType } from '../domain/fields.js';
import { extractPropertyCode } from '../domain/intents.js';
import { streetLabel } from '../domain/waLink.js';
import { prisma } from '../db.js';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/[.,!?]+$/g, '').trim();
}

const WORD = '[\\p{Script=Hebrew}0-9"\'״׳\\-\\s]';

export function extractPropertyHints(messageText) {
  const source = String(messageText || '').replace(/\s+/g, ' ').trim();
  const code = extractPropertyCode(source);
  const listingType = parseListingType(source);
  const roomsMatch = source.match(/(\d+(?:[.,]\d+)?)\s*חדר/u);
  const rooms = roomsMatch ? Number(roomsMatch[1].replace(',', '.')) : null;
  const placeSource = source.replace(/\d+(?:[.,]\d+)?\s*חדר(?:ים)?/gu, ' ');
  let street = null;
  let city = null;
  const streetCity = placeSource.match(new RegExp(`ברחוב\\s+(${WORD}{2,40}?)\\s+ב(${WORD}{2,30})`, 'u'));
  if (streetCity) {
    street = streetLabel(clean(streetCity[1]));
    city = clean(streetCity[2]);
  } else {
    const streetOnly = placeSource.match(new RegExp(`ברחוב\\s+(${WORD}{2,40})`, 'u'));
    if (streetOnly) street = streetLabel(clean(streetOnly[1]));
    const namedCity = placeSource.match(new RegExp(`בעיר\\s+(${WORD}{2,30})`, 'u'));
    if (namedCity) city = clean(namedCity[1]);
    if (!city) {
      const trailing = placeSource.match(new RegExp(`\\sב(${WORD}{2,30})$`, 'u'));
      if (trailing) city = clean(trailing[1]);
    }
  }
  return {
    code,
    listingType,
    rooms: Number.isFinite(rooms) ? rooms : null,
    street: street || null,
    city: city || null,
  };
}

function money(price) {
  return `${new Intl.NumberFormat('he-IL').format(price)} ₪`;
}

export function formatPropertyChoices(properties, hints = {}) {
  const street = hints.street || streetLabel(properties[0]?.address) || '';
  const city = hints.city || properties[0]?.city || '';
  const place = [street ? `ברחוב ${street}` : '', city ? `ב${city}` : ''].filter(Boolean).join(' ');
  const lines = properties.map((property) => {
    const rooms = property.rooms != null ? `${property.rooms} חדרים` : '';
    const floor = property.floor ? `קומה ${property.floor}` : '';
    const price = property.price != null ? `(${money(property.price)})` : '';
    return [rooms, floor, price].filter(Boolean).join(' ');
  });
  const where = place ? ` ${place}` : '';
  return `יש לנו ${properties.length} דירות${where}:\n${lines.join('\n')}\nעל איזו מהן תרצה לשמוע פרטים?`;
}

export function chooseProperty(messageText, properties) {
  const text = String(messageText || '').trim();
  const index = text.match(/^(?:דירה\s*)?(\d{1,2})$/);
  if (index) {
    const found = properties[Number(index[1]) - 1];
    if (found) return found;
  }
  if (/ראשונ/.test(text)) return properties[0] || null;
  if (/שניי/.test(text)) return properties[1] || null;
  const hints = extractPropertyHints(text);
  let rows = properties.slice();
  if (hints.rooms != null) {
    const byRooms = rows.filter((row) => row.rooms != null && Number(row.rooms) === hints.rooms);
    if (byRooms.length === 1) return byRooms[0];
    if (byRooms.length) rows = byRooms;
  }
  const floor = text.match(/קומה\s*([0-9א-ת]+)/);
  if (floor) {
    const byFloor = rows.filter((row) => String(row.floor || '') === floor[1]);
    if (byFloor.length === 1) return byFloor[0];
  }
  return rows.length === 1 ? rows[0] : null;
}

const propertyInclude = {
  media: { orderBy: { createdAt: 'asc' } },
  broker: true,
};

export async function matchPropertyFromText(messageText) {
  const hints = extractPropertyHints(messageText);
  if (hints.code) {
    const property = await prisma.property.findFirst({
      where: { code: hints.code, status: 'active' },
      include: propertyInclude,
    });
    return { kind: property ? 'one' : 'missing-code', hints, properties: property ? [property] : [] };
  }
  if (!hints.city && !hints.street && hints.rooms == null) {
    return { kind: 'none', hints, properties: [] };
  }
  const where = { status: 'active' };
  if (hints.listingType) where.listingType = hints.listingType;
  if (hints.city) where.city = { contains: hints.city, mode: 'insensitive' };
  let rows = await prisma.property.findMany({
    where,
    include: propertyInclude,
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  if (hints.street) {
    const street = hints.street;
    rows = rows.filter((row) => `${row.address || ''} ${row.neighborhood || ''}`.includes(street));
  }
  if (hints.rooms != null) {
    const byRooms = rows.filter((row) => row.rooms != null && Number(row.rooms) === hints.rooms);
    if (byRooms.length) rows = byRooms;
  }
  if (rows.length === 1) return { kind: 'one', hints, properties: rows };
  if (rows.length > 1) return { kind: 'many', hints, properties: rows.slice(0, 5) };
  return { kind: 'none', hints, properties: [] };
}
