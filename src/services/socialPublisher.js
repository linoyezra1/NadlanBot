import { isPublicHttpUrl } from '../domain/channels.js';
import { tiktokVideoSkip, tiktokVideoUrl } from '../domain/tiktokVideo.js';
import { clickToWhatsAppLink, naturalWaLink, postWaMe, streetLabel } from '../domain/waLink.js';
import { config } from '../config.js';
import { prisma } from '../db.js';

const NETWORKS = ['facebook', 'instagram', 'tiktok'];
const connectSessions = new Map();

export function readConnectSession(token) {
  const session = connectSessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    connectSessions.delete(token);
    return null;
  }
  return session;
}

export function gatewayConfigured() {
  return Boolean(config.socialGatewayApiKey && config.socialGatewayBaseUrl);
}

function mediaType(item) {
  if (item.mediaType === 'video') return 'video';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(item.cloudUrl || '')) return 'video';
  return 'image';
}

export function selectPublicMedia(media) {
  return (media || [])
    .filter((item) => isPublicHttpUrl(item.cloudUrl))
    .map((item) => ({ url: item.cloudUrl, type: mediaType(item) }));
}

export function splitFeedMedia(media) {
  const items = selectPublicMedia(media);
  const images = items.filter((item) => item.type === 'image').slice(0, 10);
  const url = tiktokVideoUrl(media);
  return { images, video: url ? [{ url, type: 'video' }] : [] };
}

export function facebookPostExtras(property, images = []) {
  const link = naturalWaLink(property);
  const data = {};
  if (link) data.firstComment = `לפרטים ותמונות בוואטסאפ:\n${link}`;
  if (link && images.length >= 2) {
    const deal = property?.listingType === 'sale' ? 'למכירה' : property?.listingType === 'rent' ? 'להשכרה' : 'דירה';
    const street = streetLabel(property?.address);
    const name = [deal, street || property?.city || ''].filter(Boolean).join(' · ').slice(0, 80);
    const price = property?.price != null ? `${new Intl.NumberFormat('he-IL').format(property.price)} ₪` : '';
    const description = [property?.city, price].filter(Boolean).join(' · ').slice(0, 80);
    data.facebookSettings = {
      carouselLink: link,
      carouselCards: images.slice(0, 10).map(() => ({
        link,
        name: name || 'לפרטים',
        ...(description ? { description } : {}),
      })),
    };
  }
  return data;
}

function withFacebookExtras(platforms, property, images) {
  const extras = facebookPostExtras(property, images);
  if (!Object.keys(extras).length) return platforms;
  return platforms.map((item) => (item.platform === 'facebook'
    ? { ...item, platformSpecificData: extras }
    : item));
}

export const SYSTEM_PROMPT_POST_GENERATION = `
אתה עוזר שיווקי בכיר למתווכי נדל"ן באזור המרכז/בת ים.
תפקידך לייצר פוסט לפייסבוק ואינסטגרם מתוך פרטי הנכס.

חוקי הסגנון:
1. שורות קצרות וקולעות עם רווח בין שורה לשורה. בלי פסקאות ארוכות ובלי מילים מנופחות.
2. כותרת ברורה: "להשכרה {חדרים} חדרים ב{פרויקט/עיר}" או "למכירה ב{עיר}".
3. ציין במדויק: כתובת, קומה, מפרט (מרפסת, חניה, מחסן, ממ"ד), שדרוגים מיוחדים ומוצרי חשמל אם קיימים.
4. בסוף: ציין מחיר ואת הביטוי "לרציניים בלבד" (להשכרה) או "למביני עניין / מתחת למחיר השוק" (למכירה).
5. סיים עם פרטי התקשרות של המתווך וקישור הוואטסאפ שנמסר. אל תכתוב קוד נכס.
אל תמציא עובדות שלא נמסרו. אל תזכיר את בעל הנכס.
`.trim();

export function composeCaption(caption, property) {
  const subject = property && typeof property === 'object' ? property : { code: property };
  const link = naturalWaLink(subject) || postWaMe(subject.code) || clickToWhatsAppLink(subject.code);
  const body = String(caption || '').trim();
  if (!link) return body;
  if (body.includes(link)) return body;
  return body ? `${body}\n\n${link}` : link;
}

async function gateway(pathname, { method = 'GET', body, headers } = {}) {
  if (!gatewayConfigured()) {
    const error = new Error('SOCIAL_GATEWAY_API_KEY is empty');
    error.code = 'GATEWAY_OFF';
    throw error;
  }
  const response = await fetch(`${config.socialGatewayBaseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.socialGatewayApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) {
    const error = new Error(json.message || json.error || `Social gateway HTTP ${response.status}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

function profileIdFrom(json) {
  return json?.profile?._id || json?.profile?.id || json?.socialProfileId || json?.profileId || json?._id || null;
}

async function saveProfileId(brokerId, profileId) {
  if (!profileId) return;
  await prisma.broker.update({
    where: { id: brokerId },
    data: { socialProfileId: profileId },
  });
}

export async function ensureSocialProfile(broker) {
  if (broker.socialProfileId) return broker.socialProfileId;
  let json;
  try {
    json = await gateway('/profiles', {
      method: 'POST',
      body: {
        name: broker.businessName || broker.fullName,
        externalId: broker.id,
      },
    });
  } catch (error) {
    const existing = error.body?.details?.existingProfileId
      || error.body?.error?.details?.existingProfileId;
    if (error.status === 409 && existing) {
      json = { profile: { _id: existing } };
    } else if (error.status === 409) {
      const listed = await gateway(`/profiles?externalId=${encodeURIComponent(broker.id)}`);
      const found = (listed.profiles || [])[0];
      if (!found) throw error;
      json = { profile: found };
    } else {
      throw error;
    }
  }
  const profileId = profileIdFrom(json);
  if (!profileId) throw new Error('Zernio לא החזיר מזהה פרופיל');
  await saveProfileId(broker.id, profileId);
  return profileId;
}

export function brokerConnectUrl(brokerId) {
  return `${config.publicBaseUrl}/b/${brokerId}/connect`;
}

export async function createConnectUrl(brokerId) {
  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) {
    const error = new Error('המתווך לא נמצא');
    error.code = 'NOT_FOUND';
    throw error;
  }
  return brokerConnectUrl(broker.id);
}

export async function platformAuthUrl(brokerId, platform) {
  if (!NETWORKS.includes(platform)) {
    const error = new Error('הרשת לא נתמכת');
    error.status = 404;
    throw error;
  }
  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) {
    const error = new Error('המתווך לא נמצא');
    error.code = 'NOT_FOUND';
    error.status = 404;
    throw error;
  }
  const profileId = await ensureSocialProfile(broker);
  const redirectUrl = `${config.publicBaseUrl}/social/callback/${platform}/${encodeURIComponent(broker.id)}`;
  const query = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const json = await gateway(`/connect/${platform}?${query}`);
  if (!json.authUrl) throw new Error(`אין קישור חיבור ל-${platform}`);
  return json.authUrl;
}

function accountId(account) {
  return account._id || account.accountId || account.id;
}

export async function publishPropertyPost({ brokerId, propertyId, channels, caption }) {
  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { media: true },
  });
  if (!broker || !property) {
    const error = new Error('הנכס או המתווך לא נמצאו');
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (!broker.socialProfileId) {
    const error = new Error('המתווך עדיין לא חיבר חשבונות סושיאל');
    error.code = 'NOT_CONNECTED';
    throw error;
  }

  const listed = await gateway(`/accounts?profileId=${encodeURIComponent(broker.socialProfileId)}`);
  const wanted = new Set((channels || NETWORKS).filter((name) => NETWORKS.includes(name)));
  const { images, video } = splitFeedMedia(property.media);
  const hasVideo = video.length > 0;
  const accounts = (listed.accounts || []).filter((account) => account.isActive !== false && wanted.has(account.platform));
  const platforms = [];
  const skipped = [];
  for (const account of accounts) {
    if (account.platform === 'tiktok' && !hasVideo) {
      skipped.push(tiktokVideoSkip());
      continue;
    }
    const id = accountId(account);
    if (id) platforms.push({ platform: account.platform, accountId: id });
  }
  if (!platforms.length) {
    const skippedPlatforms = new Set(skipped.map((item) => item.platform));
    const missingAccount = [...wanted].filter((name) => !skippedPlatforms.has(name));
    if (skipped.length && !missingAccount.length) {
      return {
        postId: null,
        waLink: naturalWaLink(property) || clickToWhatsAppLink(property.code),
        results: skipped,
      };
    }
    const error = new Error(skipped[0]?.error || 'אין חשבון מחובר לערוצים שנבחרו');
    error.code = 'NO_ACCOUNTS';
    throw error;
  }

  const content = composeCaption(caption || property.marketingText, property);
  const facebook = platforms.filter((item) => item.platform === 'facebook');
  const instagram = platforms.filter((item) => item.platform === 'instagram');
  const tiktok = platforms.filter((item) => item.platform === 'tiktok');
  const requests = [];
  if (images.length) {
    const withPhotos = withFacebookExtras([...facebook, ...instagram], property, images);
    if (withPhotos.length) requests.push({ mediaItems: images, platforms: withPhotos });
    if (tiktok.length && hasVideo) requests.push({ mediaItems: video, platforms: tiktok });
    else if (tiktok.length) skipped.push(tiktokVideoSkip());
  } else if (hasVideo) {
    requests.push({ mediaItems: video, platforms: withFacebookExtras(platforms, property, []) });
  } else if (facebook.length) {
    requests.push({ mediaItems: [], platforms: withFacebookExtras(facebook, property, []) });
    for (const item of instagram) {
      skipped.push({ platform: item.platform, status: 'skipped', error: 'אין תמונה או סרטון ציבורי לפרסום' });
    }
    if (tiktok.length) skipped.push(tiktokVideoSkip());
  } else {
    const error = new Error('אין תמונה או סרטון ציבורי לפרסום');
    error.code = 'NO_MEDIA';
    throw error;
  }
  const returned = [];
  let postId = null;
  for (const request of requests) {
    const body = {
      content,
      platforms: request.platforms,
      publishNow: true,
    };
    if (request.mediaItems.length) body.mediaItems = request.mediaItems;
    const json = await gateway('/posts', { method: 'POST', body });
    const post = json.post || {};
    postId = postId || post._id || null;
    const rows = Array.isArray(post.platforms) ? post.platforms : request.platforms.map((item) => ({ ...item, status: 'published' }));
    returned.push(...rows.map((row) => ({ ...row, zernioPostId: post._id || null })));
  }
  const urls = {
    facebook: property.facebookPostUrl,
    instagram: property.instagramPostUrl,
    tiktok: property.tiktokPostUrl,
  };
  const ids = {};
  const results = skipped.slice();
  for (const item of returned) {
    const url = item.platformPostUrl || null;
    const id = item.platformPostId || item.postId || item.zernioPostId || postId || null;
    if (item.platform && item.platformPostId) ids[item.platform] = item.platformPostId;
    if (item.platform && item.zernioPostId) ids[`${item.platform}Zernio`] = item.zernioPostId;
    if (item.platform && !ids[item.platform] && id) ids[item.platform] = id;
    if (url && urls[item.platform] !== undefined) urls[item.platform] = url;
    const published = Boolean(url) || item.status === 'published';
    results.push({
      platform: item.platform,
      status: published ? 'published' : (item.status || 'failed'),
      postId: id,
      postUrl: url,
      error: item.error || item.message || null,
    });
  }
  const isPublished = results.some((item) => item.status === 'published');
  await prisma.property.update({
    where: { id: property.id },
    data: {
      marketingText: content,
      isPublished,
      publishedPostIds: {
        ...(property.publishedPostIds && typeof property.publishedPostIds === 'object' && !Array.isArray(property.publishedPostIds)
          ? property.publishedPostIds
          : {}),
        ...ids,
      },
      facebookPostUrl: urls.facebook,
      instagramPostUrl: urls.instagram,
      tiktokPostUrl: urls.tiktok,
      status: isPublished ? 'active' : property.status,
    },
  });
  return {
    postId,
    waLink: naturalWaLink(property) || clickToWhatsAppLink(property.code),
    results,
  };
}

export async function findPropertyForPost(ids) {
  const keys = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!keys.length) return null;
  const publication = await prisma.publication.findFirst({
    where: {
      OR: [
        { postId: { in: keys } },
        ...keys.map((key) => ({ postUrl: { contains: key } })),
      ],
    },
    include: { property: true },
    orderBy: { createdAt: 'desc' },
  });
  if (publication?.property) return publication.property;
  const byUrl = await prisma.property.findFirst({
    where: {
      OR: keys.flatMap((key) => [
        { facebookPostUrl: { contains: key } },
        { instagramPostUrl: { contains: key } },
        { tiktokPostUrl: { contains: key } },
      ]),
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (byUrl) return byUrl;
  const rows = await prisma.property.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  return rows.find((row) => {
    const values = Object.values(row.publishedPostIds || {}).map(String);
    const urls = [row.facebookPostUrl, row.instagramPostUrl, row.tiktokPostUrl].map(String);
    return keys.some((key) => values.includes(key) || urls.some((url) => url.includes(key)));
  }) || null;
}

const COMMENT_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

export function commentReplyPlan(body) {
  const comment = body?.comment || {};
  const platform = String(comment.platform || body?.platform || '').toLowerCase();
  if (!COMMENT_PLATFORMS.has(platform)) return null;
  if (comment.author?.isOwnAccount === true) return null;
  const commentId = String(comment.id || '');
  const accountId = String(body.account?.accountId || body.account?.id || body.accountId || comment.accountId || '');
  if (!commentId || !accountId) return null;
  const platformPostId = String(comment.platformPostId || comment.post?.platformPostId || '');
  const zernioPostId = String(comment.postId || comment.post?.id || '');
  return {
    platform,
    commentId,
    text: String(comment.text || comment.message || '').trim(),
    accountId,
    authorName: comment.author?.name || comment.author?.username || '',
    lookupIds: [platformPostId, zernioPostId].filter(Boolean),
    publicPostId: zernioPostId || platformPostId,
    privatePostId: platform === 'tiktok' ? '' : (platformPostId || zernioPostId),
  };
}

export const COMMENT_WEBHOOK_EVENTS = ['comment.received', 'account.connected', 'account.disconnected'];

export function commentWebhookEvents(current = []) {
  const allowed = new Set(COMMENT_WEBHOOK_EVENTS);
  const kept = (current || []).filter((event) => allowed.has(event));
  return [...new Set([...COMMENT_WEBHOOK_EVENTS, ...kept])];
}

export function commentWebhookUpdate(ours, secret = '') {
  const events = commentWebhookEvents(ours?.events);
  const same = JSON.stringify([...(ours?.events || [])].sort()) === JSON.stringify([...events].sort());
  if (ours?.isActive !== false && same && !secret) return null;
  return {
    webhookId: ours?._id || ours?.id,
    events,
    isActive: true,
    ...(secret ? { secret } : {}),
  };
}

export async function ensureCommentWebhook() {
  if (!gatewayConfigured()) return;
  const url = `${config.publicBaseUrl}/social-webhook`;
  if (!url.startsWith('https://')) return;
  const listed = await gateway('/webhooks/settings');
  const hooks = listed.webhooks || [];
  const ours = hooks.find((hook) => String(hook.url || '').replace(/\/$/, '') === url.replace(/\/$/, ''));
  const secret = config.socialGatewayWebhookSecret;
  if (ours) {
    const update = commentWebhookUpdate(ours, secret);
    if (!update) return;
    await gateway('/webhooks/settings', { method: 'PUT', body: update });
    return;
  }
  await gateway('/webhooks/settings', {
    method: 'POST',
    body: {
      name: 'NadlanBot comments',
      url,
      events: commentWebhookEvents(),
      ...(secret ? { secret } : {}),
    },
  });
}

export function replyToComment({ postId, commentId, accountId, message }) {
  return gateway(`/inbox/comments/${encodeURIComponent(postId)}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `comment-${commentId}`.slice(0, 200) },
    body: { accountId, commentId, message },
  });
}

export function sendPrivateReply({ postId, commentId, accountId, message }) {
  return gateway(`/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/private-reply`, {
    method: 'POST',
    body: { accountId, message },
  });
}
