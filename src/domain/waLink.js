import { config } from '../config.js';
import { normalizePhone } from './phone.js';

export function buildWaLink(displayNumber, code, message) {
  const number = normalizePhone(displayNumber);
  if (!number || !code) return null;
  const text = message || `שלום, אני מעוניין בפרטים על דירה ${code}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function clickToWhatsAppLink(code) {
  return buildWaLink(config.whatsappDisplayNumber, code);
}

export function shortClickToWhatsAppLink(code) {
  return buildWaLink(config.whatsappDisplayNumber, code, code);
}

export function postWaMe(code) {
  const number = normalizePhone(config.whatsappDisplayNumber);
  if (!number || !code) return null;
  return `wa.me/${number}?text=פרטים_על_${code}`;
}

export function withoutBuildingNumber(address) {
  const text = String(address || '').trim();
  if (!text) return '';
  const month = /^ב(?:מאי|נובמבר|אפריל|אוקטובר|ספטמבר|אוגוסט|ינואר|פברואר|מרץ|יוני|יולי|דצמבר|שבט|אדר|ניסן|אייר|סיון|תמוז|אב|אלול|תשרי|חשון|כסלו|טבת)$/;
  const house = /^\d{1,4}[א-ת]?(?:[/\\-]\d{1,4})?$/;
  const kept = [];
  const parts = text.split(/\s+/);
  for (let i = 0; i < parts.length; i += 1) {
    const comma = parts[i].endsWith(',');
    const token = parts[i].replace(/,$/, '');
    const next = (parts[i + 1] || '').replace(/,$/, '');
    if (/^(?:דירה|כניסה|בניין|בנין|מספר|מס['׳]?)$/.test(token) && house.test(next)) {
      i += 1;
      continue;
    }
    if (house.test(token) && kept.length > 0 && !month.test(next)) continue;
    kept.push(comma ? `${token},` : token);
  }
  return kept.join(' ').replace(/\s+,/g, ',').replace(/,\s*$/, '').replace(/\s{2,}/g, ' ').trim();
}

export function streetLabel(address) {
  return withoutBuildingNumber(address).replace(/^רחוב\s+/, '').trim();
}

export function dealLabel(property) {
  if (property?.listingType === 'sale') return 'למכירה';
  if (property?.listingType === 'rent') return 'להשכרה';
  return '';
}

export function placePhrase(property) {
  const street = streetLabel(property?.address);
  const city = String(property?.city || '').trim();
  return [street ? `ברחוב ${street}` : '', city ? `ב${city}` : ''].filter(Boolean).join(' ');
}

export function naturalInquiryText(property) {
  const deal = dealLabel(property);
  const place = placePhrase(property);
  const about = deal ? `הדירה ${deal}` : 'הדירה';
  return `היי, אשמח לפרטים על ${about}${place ? ` ${place}` : ''}`;
}

export function naturalWaLink(property) {
  const number = normalizePhone(config.whatsappDisplayNumber);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(naturalInquiryText(property))}`;
}

export function commentInquiryText(property) {
  const place = placePhrase(property);
  return `היי, הגבתי לפוסט על הדירה${place ? ` ${place}` : ''}`;
}

export function commentWaLink(property) {
  const number = normalizePhone(config.whatsappDisplayNumber);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(commentInquiryText(property))}`;
}

export function genericCommentReply(authorName) {
  const name = String(authorName || '').trim() || 'שלום';
  const number = normalizePhone(config.whatsappDisplayNumber);
  const link = number
    ? `https://wa.me/${number}?text=${encodeURIComponent('היי, הגבתי לפוסט ואשמח לפרטים')}`
    : '';
  return `היי ${name}, כל הפרטים, המחיר והתמונות זמינים ישירות בוואטסאפ כאן:${link ? `\n${link}` : ''}`;
}

export function genericPrivateComment(authorName) {
  const name = String(authorName || '').trim() || 'שלום';
  const number = normalizePhone(config.whatsappDisplayNumber);
  const link = number
    ? `https://wa.me/${number}?text=${encodeURIComponent('היי, הגבתי לפוסט ואשמח לפרטים')}`
    : '';
  return [`היי ${name}, כל הפרטים והתמונות נמצאים בוואטסאפ.`, link].filter(Boolean).join('\n');
}

export function publicCommentReply(property, authorName) {
  const name = String(authorName || '').trim() || 'שלום';
  const deal = dealLabel(property);
  const place = placePhrase(property);
  const about = [deal ? `הדירה ${deal}` : 'הדירה', place].filter(Boolean).join(' ');
  const link = commentWaLink(property);
  return `היי ${name}, ראיתי שהגבת לפוסט של ${about} 🏡\nכל הפרטים, המחיר והתמונות זמינים ישירות בוואטסאפ כאן:${link ? `\n${link}` : ''}`;
}

export function privateCommentMessage(property, authorName) {
  const name = String(authorName || '').trim() || 'שלום';
  const deal = dealLabel(property);
  const place = placePhrase(property);
  const about = [deal ? `הדירה ${deal}` : 'הדירה', place].filter(Boolean).join(' ');
  const rooms = property?.rooms != null ? `${property.rooms} חדרים` : '';
  const price = property?.price != null ? `מחיר: ${new Intl.NumberFormat('he-IL').format(property.price)} ₪` : '';
  const link = commentWaLink(property);
  return [
    `היי ${name}, הנה ${about}.`,
    [rooms, price].filter(Boolean).join(' · '),
    link ? `לפרטים ותמונות בוואטסאפ:\n${link}` : '',
  ].filter(Boolean).join('\n');
}

export function forwardWaMe(code) {
  const number = normalizePhone(config.whatsappDisplayNumber);
  if (!number || !code) return null;
  return `wa.me/${number}?text=${encodeURIComponent(code)}`;
}
