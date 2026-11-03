export function parseChannels(text) {
  const source = String(text || '').trim();
  if (/^(הכל|כולם|כל הערוצים)$/i.test(source)) return ['facebook', 'instagram', 'tiktok'];
  if (/בלי טיקטוק|פייסבוק ואינסטגרם|פייסבוק \+ אינסטגרם|פייסבוק\+אינסטגרם/.test(source)) {
    return ['facebook', 'instagram'];
  }
  const channels = [];
  if (/פייסבוק|facebook|\bfb\b/i.test(source)) channels.push('facebook');
  if (/אינסטגרם|instagram|\big\b/i.test(source)) channels.push('instagram');
  if (/טיקטוק|tiktok/i.test(source)) channels.push('tiktok');
  return channels;
}

export function parseGroupSelection(text, groups) {
  const source = String(text || '').trim();
  if (/^(בלי קבוצות|דלג|רק העמוד|בלי)$/.test(source)) return { ok: true, groups: [] };
  if (/כל/.test(source)) return { ok: true, groups };
  const numbers = [...source.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const pickedByNumber = numbers.map((number) => groups[number - 1]).filter(Boolean);
  if (pickedByNumber.length) return { ok: true, groups: pickedByNumber };
  const pickedByName = groups.filter((group) => source.includes(group.name));
  if (pickedByName.length) return { ok: true, groups: pickedByName };
  return { ok: false, groups: [] };
}

export function isPublicHttpUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (/localhost|127\.0\.0\.1|\.local$/i.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
