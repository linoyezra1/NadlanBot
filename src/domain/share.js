import { formatPrice } from './card.js';
import { forwardWaMe } from './waLink.js';

export function facebookSharerUrl(postUrl) {
  const url = String(postUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export function compactPrice(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1_000_000) {
    const millions = Math.round((value / 1_000_000) * 100) / 100;
    const text = Number.isInteger(millions) ? String(millions) : String(millions);
    return `${text} מיליון ₪`;
  }
  return formatPrice(value);
}

export function forwardCard(property, link = forwardWaMe(property?.code)) {
  const rooms = property?.rooms;
  const title = rooms != null && rooms !== '' ? `דירת ${rooms} חדרים חדשה!` : 'דירה חדשה!';
  const price = compactPrice(property?.price);
  const head = price ? `${title} ${price}.` : `${title}`;
  return link
    ? `${head} לפרטים ותמונות ישירות מהבוט: ${link}`
    : `${head} לפרטים ותמונות ישירות מהבוט.`;
}

export function groupShareMessage(postUrl) {
  const sharer = facebookSharerUrl(postUrl);
  if (!sharer) return null;
  return [
    'הפוסט עלה בהצלחה לעמוד שלך! 🎉',
    'רוצה להפיץ לקבוצות? לחצי כאן לשיתוף מהיר:',
    sharer,
  ].join('\n');
}
