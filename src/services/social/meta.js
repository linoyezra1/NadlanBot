import { config } from '../../config.js';

function explain(json) {
  const message = json?.error?.message || 'שגיאה לא ידועה מ-Meta';
  const code = json?.error?.code;
  if (code === 200 || /permission|oauth/i.test(message)) {
    return 'אין הרשאה לפרסם. צריך Page Access Token עם pages_manage_posts ו-instagram_content_publish. בקבוצה, האפליקציה צריכה להיות מותקנת והעמוד מנהל מאושר.';
  }
  return message;
}

async function graphForm(pathname, token, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) body.set(key, String(value));
  }
  body.set('access_token', token);
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}${pathname}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) throw new Error(explain(json));
  return json;
}

export async function publishFacebookPage({ pageId, token, urls, caption, action }) {
  if (action === 'page_video') {
    const video = await graphForm(`/${pageId}/videos`, token, { file_url: urls[0], description: caption });
    return { postId: video.id, postUrl: video.id ? `https://facebook.com/${video.id}` : null };
  }
  const uploaded = [];
  for (const url of urls) {
    const photo = await graphForm(`/${pageId}/photos`, token, { url, published: 'false' });
    uploaded.push(photo.id);
  }
  const params = { message: caption };
  uploaded.forEach((id, index) => {
    params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
  });
  const feed = await graphForm(`/${pageId}/feed`, token, params);
  return { postId: feed.id, postUrl: feed.id ? `https://facebook.com/${feed.id}` : null };
}

export async function publishFacebookGroup({ groupId, token, caption }) {
  const feed = await graphForm(`/${groupId}/feed`, token, { message: caption });
  return { postId: feed.id, postUrl: feed.id ? `https://facebook.com/${feed.id}` : null };
}

async function instagramContainer(igUserId, token, params) {
  const created = await graphForm(`/${igUserId}/media`, token, params);
  return created.id;
}

export async function publishInstagram({ igUserId, token, urls, caption, action }) {
  let creationId;
  if (action === 'carousel') {
    const children = [];
    for (const url of urls) {
      children.push(await instagramContainer(igUserId, token, { image_url: url, is_carousel_item: 'true' }));
    }
    creationId = await instagramContainer(igUserId, token, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
    });
  } else if (action === 'reel') {
    creationId = await instagramContainer(igUserId, token, {
      media_type: 'REELS',
      video_url: urls[0],
      caption,
    });
  } else {
    creationId = await instagramContainer(igUserId, token, { image_url: urls[0], caption });
  }
  const published = await graphForm(`/${igUserId}/media_publish`, token, { creation_id: creationId });
  return { postId: published.id, postUrl: null };
}
