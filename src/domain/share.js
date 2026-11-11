export function facebookSharerUrl(postUrl) {
  const url = String(postUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export function originalPostMessage(results) {
  const names = {
    facebook: 'פייסבוק',
    instagram: 'אינסטגרם',
    tiktok: 'טיקטוק',
    facebook_group: 'קבוצת פייסבוק',
  };
  const lines = [];
  for (const result of results || []) {
    const url = String(result?.postUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (result.status !== 'published' && result.status !== 'processing') continue;
    lines.push(`${names[result.platform] || result.platform}: ${url}`);
  }
  if (!lines.length) return null;
  return ['הקישור לפוסט המקורי:', ...lines].join('\n');
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
