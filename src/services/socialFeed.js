import { normalizePhone } from '../domain/phone.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';

const FEED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

function textOf(value) {
  return String(value || '').trim();
}

function when(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function commentSnapshot(body, extras = {}) {
  const comment = body?.comment || {};
  const post = body?.post || comment.post || {};
  const platform = textOf(comment.platform || body?.platform || post.platform || 'facebook').toLowerCase();
  const platformPostId = textOf(post.platformPostId || comment.platformPostId || post.id);
  const zernioPostId = textOf(post.id || post._id || comment.postId || comment.post?.id) || null;
  const brokerId = textOf(body?.profiles?.[0]?.externalId || extras.brokerId) || null;
  return {
    brokerId,
    propertyId: extras.propertyId || null,
    platform,
    platformPostId,
    zernioPostId,
    content: textOf(post.content || post.text || extras.content),
    imageUrl: post.imageUrl || post.mediaUrl || extras.imageUrl || null,
    permalink: post.permalink || post.platformPostUrl || extras.permalink || null,
    commentId: textOf(comment.id),
    authorName: textOf(comment.author?.name || comment.author?.username) || 'משתמש',
    authorId: textOf(comment.author?.id) || null,
    text: String(comment.text || comment.message || ''),
    isOwnAccount: comment.author?.isOwnAccount === true,
    botReplyText: extras.botReplyText || null,
    createdAt: when(comment.createdAt),
  };
}

function phoneIn(value) {
  const match = String(value || '').match(/0\d[\d\-\s]{7,12}|972\d{8,10}/);
  if (!match) return '';
  const phone = normalizePhone(match[0]);
  return phone && phone.startsWith('972') && phone.length >= 11 ? phone : '';
}

export function leadContact(post, comment) {
  const typed = phoneIn(`${comment?.text || ''} ${comment?.botReplyText || ''}`);
  if (typed) return typed;
  const name = textOf(comment?.authorName);
  const leads = post?.property?.conversations || [];
  const match = leads.find((lead) => lead.leadPhone && textOf(lead.contactName) && textOf(lead.contactName) === name);
  return match ? (normalizePhone(match.leadPhone) || '') : '';
}

async function propertyContext(propertyId) {
  if (!propertyId) return null;
  return prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      brokerId: true,
      marketingText: true,
      media: {
        where: { mediaType: 'image' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { cloudUrl: true },
      },
    },
  });
}

export function storedPostId(snap) {
  const platform = textOf(snap?.platform).toLowerCase();
  const platformPostId = textOf(snap?.platformPostId);
  const zernioPostId = textOf(snap?.zernioPostId);
  if (platformPostId && platformPostId !== zernioPostId) return platformPostId;
  const gatewayId = zernioPostId || platformPostId;
  return gatewayId ? `${platform}:${gatewayId}` : '';
}

function placeholderPostId(snap) {
  const zernioPostId = textOf(snap?.zernioPostId);
  const platform = textOf(snap?.platform).toLowerCase();
  if (!zernioPostId || !platform) return '';
  return `${platform}:${zernioPostId}`;
}

function postData(snap, property) {
  return {
    brokerId: snap.brokerId || property?.brokerId,
    propertyId: snap.propertyId || property?.id || null,
    platform: snap.platform,
    zernioPostId: snap.zernioPostId,
    content: snap.content || property?.marketingText || '',
    imageUrl: snap.imageUrl || property?.media?.[0]?.cloudUrl || null,
    permalink: snap.permalink,
  };
}

async function savePost(snap) {
  const platformPostId = storedPostId(snap);
  const data = postData(snap);
  if (!FEED_PLATFORMS.has(snap.platform) || !platformPostId || !data.brokerId) return null;
  const filled = {
    content: data.content || undefined,
    imageUrl: data.imageUrl || undefined,
    permalink: data.permalink || undefined,
    zernioPostId: data.zernioPostId || undefined,
    propertyId: data.propertyId || undefined,
  };
  const candidates = [placeholderPostId(snap), textOf(snap.zernioPostId)].filter((id) => id && id !== platformPostId);
  for (const candidate of candidates) {
    const existing = await prisma.socialPost.findUnique({ where: { platformPostId: candidate } });
    if (existing && existing.platform === snap.platform) {
      return prisma.socialPost.update({
        where: { id: existing.id },
        data: { ...filled, platformPostId, brokerId: data.brokerId },
      });
    }
  }
  return prisma.socialPost.upsert({
    where: { platformPostId },
    update: filled,
    create: {
      brokerId: data.brokerId,
      propertyId: data.propertyId,
      platform: snap.platform,
      platformPostId,
      zernioPostId: data.zernioPostId,
      content: data.content,
      imageUrl: data.imageUrl,
      permalink: data.permalink,
    },
  });
}

export async function backfillSocialPosts(brokerId) {
  try {
    await copyPublishedPosts(brokerId);
  } catch (error) {
    logger.error('social feed backfill failed', error.message);
  }
}

async function copyPublishedPosts(brokerId) {
  const [publications, existing] = await Promise.all([
    prisma.publication.findMany({
      where: {
        property: { brokerId },
        status: { in: ['published', 'processing'] },
        platform: { in: [...FEED_PLATFORMS] },
        postId: { not: null },
      },
      select: {
        propertyId: true,
        platform: true,
        postId: true,
        postUrl: true,
        caption: true,
        property: {
          select: {
            media: {
              where: { mediaType: 'image' },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { cloudUrl: true },
            },
          },
        },
      },
    }),
    prisma.socialPost.findMany({
      where: { brokerId },
      select: { platformPostId: true },
    }),
  ]);
  const seen = new Set(existing.map((post) => post.platformPostId));
  const rows = [];
  for (const item of publications) {
    const platformPostId = storedPostId({
      platform: item.platform,
      platformPostId: item.postId,
      zernioPostId: '',
    });
    if (!platformPostId || seen.has(platformPostId)) continue;
    seen.add(platformPostId);
    rows.push({
      brokerId,
      propertyId: item.propertyId,
      platform: String(item.platform || '').toLowerCase(),
      platformPostId,
      content: item.caption || '',
      imageUrl: item.property?.media?.[0]?.cloudUrl || null,
      permalink: item.postUrl || null,
    });
  }
  if (rows.length) await prisma.socialPost.createMany({ data: rows, skipDuplicates: true });
}

export async function backfillAllSocialPosts() {
  const brokers = await prisma.broker.findMany({ select: { id: true } });
  for (const broker of brokers) await backfillSocialPosts(broker.id);
}

export async function rememberPublished({
  brokerId, propertyId, platform, postId, zernioPostId, postUrl, caption, imageUrl,
}) {
  const property = await propertyContext(propertyId);
  return savePost(commentSnapshot({
    post: {
      platform,
      platformPostId: postId,
      id: zernioPostId || '',
      content: caption || property?.marketingText || '',
      imageUrl: imageUrl || property?.media?.[0]?.cloudUrl || null,
      permalink: postUrl,
    },
    profiles: [{ externalId: brokerId || property?.brokerId || '' }],
  }, { propertyId: property?.id || propertyId }));
}

export async function rememberComment(body, extras = {}) {
  const property = extras.propertyId ? await propertyContext(extras.propertyId) : null;
  const snap = commentSnapshot(body, {
    ...extras,
    brokerId: extras.brokerId || property?.brokerId,
    propertyId: extras.propertyId || property?.id,
    imageUrl: extras.imageUrl || property?.media?.[0]?.cloudUrl,
    content: extras.content || property?.marketingText,
  });
  if (!snap.brokerId && snap.platformPostId) {
    const publication = await prisma.publication.findFirst({
      where: { postId: { in: [snap.platformPostId, snap.zernioPostId].filter(Boolean) } },
      include: { property: { select: { id: true, brokerId: true } } },
    });
    if (publication?.property) {
      snap.brokerId = publication.property.brokerId;
      snap.propertyId = snap.propertyId || publication.property.id;
    }
  }
  const saved = await savePost(snap);
  if (!saved || snap.isOwnAccount || !snap.commentId) return saved;
  await prisma.socialComment.upsert({
    where: { platformCommentId: snap.commentId },
    update: {
      text: snap.text,
      ...(snap.botReplyText ? { botReplyText: snap.botReplyText } : {}),
    },
    create: {
      socialPostId: saved.id,
      platformCommentId: snap.commentId,
      authorId: snap.authorId,
      authorName: snap.authorName,
      text: snap.text,
      isOwnAccount: false,
      botReplyText: snap.botReplyText,
      createdAt: snap.createdAt,
    },
  });
  return saved;
}

export async function listSocialPosts(brokerId, propertyCode) {
  const where = { brokerId };
  const code = textOf(propertyCode);
  if (code) where.property = { code };
  const posts = await prisma.socialPost.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: 20,
    include: {
      comments: {
        where: { isOwnAccount: false },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      property: {
        select: {
          code: true,
          address: true,
          city: true,
          conversations: {
            where: { role: 'lead' },
            orderBy: { updatedAt: 'desc' },
            take: 20,
            select: { contactName: true, leadPhone: true },
          },
        },
      },
      broker: { select: { fullName: true, businessName: true } },
    },
  });
  return posts.map((post) => ({ ...post, comments: [...post.comments].reverse() }));
}
