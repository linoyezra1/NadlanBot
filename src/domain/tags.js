const TAG_RULES = [
  [/kitchen|מטבח/i, 'kitchen'],
  [/living|סלון/i, 'living_room'],
  [/bedroom|שינה/i, 'bedroom'],
  [/bath|שירותים|מקלחת|אמבט/i, 'bathroom'],
  [/balcony|מרפסת/i, 'balcony'],
  [/view|נוף/i, 'view'],
  [/exterior|חזית|בניין|חוץ/i, 'exterior'],
  [/ממ["״׳'`]?ד|ממד|safe room/i, 'mamad'],
];

export function detectTags(text) {
  const source = String(text || '');
  const tags = [];
  for (const [pattern, tag] of TAG_RULES) {
    if (pattern.test(source) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function asTags(tags) {
  return Array.isArray(tags) ? tags : [];
}

export function matchMedia(media, request) {
  const items = Array.isArray(media) ? media : [];
  const query = String(request || '');
  const wanted = new Set(detectTags(query));
  const wantsVideo = /וידאו|סרטון|video|רילס|reel/i.test(query);
  if (wantsVideo && wanted.size === 0) {
    const videos = items.filter((item) => item.mediaType === 'video' || item.type === 'video');
    return { items: videos, matched: videos.length > 0, video: true };
  }
  if (wanted.size) {
    const tagged = items.filter((item) => asTags(item.tags).some((tag) => wanted.has(tag)));
    if (tagged.length) return { items: tagged.slice(0, 6), matched: true, video: false };
  }
  const images = items.filter((item) => (item.mediaType || item.type) === 'image');
  return { items: images.slice(0, 6), matched: false, video: false };
}
