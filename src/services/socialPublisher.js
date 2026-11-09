import crypto from 'node:crypto';
import { isPublicHttpUrl } from '../domain/channels.js';
import { clickToWhatsAppLink } from '../domain/waLink.js';
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

export function composeCaption(caption, code) {
  const link = clickToWhatsAppLink(code);
  const body = String(caption || '').trim();
  if (!link) return body;
  if (body.includes(link)) return body;
  return body ? `${body}\n\n${link}` : link;
}

async function gateway(pathname, { method = 'GET', body } = {}) {
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

export async function createConnectUrl(brokerId) {
  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) {
    const error = new Error('המתווך לא נמצא');
    error.code = 'NOT_FOUND';
    throw error;
  }
  const redirectUrl = `${config.publicBaseUrl}/social/callback`;
  try {
    const json = await gateway('/profiles/connect', {
      method: 'POST',
      body: { externalUserId: brokerId, redirectUrl },
    });
    const connectUrl = json.connectUrl || json.url || json.authUrl;
    await saveProfileId(broker.id, profileIdFrom(json));
    if (connectUrl) return connectUrl;
  } catch (error) {
    if (error.status !== 404 && error.status !== 405) throw error;
  }

  const profileId = await ensureSocialProfile(broker);
  const links = [];
  for (const platform of NETWORKS) {
    const query = new URLSearchParams({ profileId, redirect_url: redirectUrl });
    const json = await gateway(`/connect/${platform}?${query}`);
    if (!json.authUrl) throw new Error(`אין קישור חיבור ל-${platform}`);
    links.push({ platform, url: json.authUrl });
  }
  const token = crypto.randomBytes(18).toString('hex');
  connectSessions.set(token, { links, expires: Date.now() + 60 * 60 * 1000 });
  return `${config.publicBaseUrl}/social/connect/${token}`;
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
  const mediaItems = selectPublicMedia(property.media);
  const hasVideo = mediaItems.some((item) => item.type === 'video');
  const accounts = (listed.accounts || []).filter((account) => account.isActive !== false && wanted.has(account.platform));
  const platforms = [];
  const skipped = [];
  for (const account of accounts) {
    if (account.platform === 'tiktok' && !hasVideo) {
      skipped.push({ platform: 'tiktok', status: 'skipped', error: 'טיקטוק דורש סרטון בכתובת https ציבורית' });
      continue;
    }
    const id = accountId(account);
    if (id) platforms.push({ platform: account.platform, accountId: id });
  }
  if (!platforms.length) {
    const error = new Error(skipped[0]?.error || 'אין חשבון מחובר לערוצים שנבחרו');
    error.code = 'NO_ACCOUNTS';
    throw error;
  }

  const content = composeCaption(caption || property.marketingText, property.code);
  const json = await gateway('/posts', {
    method: 'POST',
    body: {
      content,
      mediaItems,
      platforms,
      publishNow: true,
    },
  });
  const post = json.post || {};
  const returned = Array.isArray(post.platforms) ? post.platforms : platforms.map((item) => ({ ...item, status: 'published' }));
  const urls = {
    facebook: property.facebookPostUrl,
    instagram: property.instagramPostUrl,
    tiktok: property.tiktokPostUrl,
  };
  const ids = {};
  const results = skipped.slice();
  for (const item of returned) {
    const url = item.platformPostUrl || null;
    const id = item.platformPostId || item.postId || post._id || null;
    if (item.platform) ids[item.platform] = id;
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
      publishedPostIds: ids,
      facebookPostUrl: urls.facebook,
      instagramPostUrl: urls.instagram,
      tiktokPostUrl: urls.tiktok,
      status: isPublished ? 'active' : property.status,
    },
  });
  return {
    postId: post._id || null,
    waLink: clickToWhatsAppLink(property.code),
    results,
  };
}
