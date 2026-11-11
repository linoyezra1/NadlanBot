const PLATFORMS = {
  social: 'רשתות',
  facebook: 'פייסבוק',
  instagram: 'אינסטגרם',
  tiktok: 'טיקטוק',
  facebook_group: 'קבוצת פייסבוק',
};

const STATUSES = {
  published: 'פורסם',
  failed: 'נכשל',
  processing: 'בעיבוד',
  skipped: 'דולג',
  scheduled: 'מתוזמן',
};

const DUPLICATE = /already scheduled, publishing, or was posted/i;

export function hebrewPlatform(platform) {
  const key = String(platform || '').trim().toLowerCase();
  return PLATFORMS[key] || String(platform || '');
}

export function hebrewStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  return STATUSES[key] || String(status || '');
}

export function hebrewPublicationError(error) {
  const text = String(error || '').trim();
  if (!text) return '';
  if (DUPLICATE.test(text)) {
    return 'התוכן הזה כבר עלה, בפרסום, או פורסם לחשבון הזה ב-24 השעות האחרונות.';
  }
  return text;
}

export function publicationLine(item) {
  const error = hebrewPublicationError(item?.error);
  return `${hebrewPlatform(item?.platform)} · ${hebrewStatus(item?.status)}${error ? ` · ${error}` : ''}`;
}
