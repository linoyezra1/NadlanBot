import { config } from '../../config.js';

export async function publishTikTokVideo({ token, videoUrl, caption }) {
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: config.tiktokPrivacyLevel || 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error?.code) {
    const message = json.error?.message || json.error?.code || `TikTok HTTP ${response.status}`;
    throw new Error(/unaudited|privacy/i.test(message)
      ? 'טיקטוק דחה את הפרסום. לאפליקציה שטרם אושרה מותר רק פרסום פרטי (SELF_ONLY).'
      : message);
  }
  const publishId = json.data?.publish_id || null;
  return { postId: publishId, postUrl: null, status: 'processing' };
}

export function tiktokCaption(caption, shortLink) {
  const base = String(caption || '').replace(/\s+/g, ' ').trim();
  const withLink = shortLink ? `${base} ${shortLink}` : base;
  return withLink.slice(0, 150);
}
