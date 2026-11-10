import { planPosts } from '../../domain/plan.js';
import { TIKTOK_CRM_NOTICE, TIKTOK_WA_LINE } from '../../domain/tiktokVideo.js';
import { forwardCard, groupShareMessage } from '../../domain/share.js';
import { clickToWhatsAppLink, naturalWaLink, shortClickToWhatsAppLink } from '../../domain/waLink.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { brokerConnectUrl, publishPropertyPost } from '../socialPublisher.js';
import { resolveAccounts } from './credentials.js';
import { publishFacebookGroup, publishFacebookPage, publishInstagram } from './meta.js';
import { publishTikTokVideo, tiktokCaption } from './tiktok.js';
import { generateMarketing } from '../openai.js';

function label(result) {
  if (result.platform === 'facebook_group') return `קבוצה ${result.targetName || ''}`.trim();
  if (result.platform === 'facebook') return 'פייסבוק';
  if (result.platform === 'instagram') return 'אינסטגרם';
  if (result.platform === 'tiktok') return 'טיקטוק';
  return result.platform;
}

function resultLine(result) {
  if (result.code === 'NO_VIDEO') return TIKTOK_WA_LINE;
  const ok = result.status === 'published' || result.status === 'processing';
  const detail = result.error || result.postUrl || (result.status === 'processing' ? 'הסרטון התקבל וממתין לעיבוד' : '');
  return `${label(result)}: ${ok ? 'עלה' : 'לא פורסם'}${detail ? ` — ${detail}` : ''}`;
}

export function summarizeResults(results, waLink) {
  const lines = ['סיימתי לטפל בפרסום.'];
  lines.push(waLink ? `קישור הלידים:\n${waLink}` : 'חסר TWILIO_WHATSAPP_NUMBER, ולכן אין עדיין קישור wa.me.');
  for (const result of results) lines.push(resultLine(result));
  if (results.some((result) => result.platform === 'tiktok' && result.status === 'processing')) {
    lines.push('בטיקטוק הסרטון עולה לפי הרשאת האפליקציה. לפני אישור האפליקציה ברירת המחדל היא פרסום פרטי.');
  }
  return lines.join('\n');
}

async function execute(item, accounts, caption, propertyCode) {
  if (item.platform === 'facebook') {
    const account = accounts.get('facebook');
    return publishFacebookPage({
      pageId: account.accountId,
      token: account.accessToken,
      urls: item.urls,
      caption,
      action: item.action,
    });
  }
  if (item.platform === 'facebook_group') {
    const account = accounts.get('facebook');
    return publishFacebookGroup({
      groupId: item.targetId,
      token: account.accessToken,
      caption,
    });
  }
  if (item.platform === 'instagram') {
    const account = accounts.get('instagram');
    return publishInstagram({
      igUserId: account.accountId,
      token: account.accessToken,
      urls: item.urls,
      caption,
      action: item.action,
    });
  }
  if (item.platform === 'tiktok') {
    const account = accounts.get('tiktok');
    return publishTikTokVideo({
      token: account.accessToken,
      videoUrl: item.urls[0],
      caption: tiktokCaption(caption, shortClickToWhatsAppLink(propertyCode)),
    });
  }
  throw new Error('ערוץ לא נתמך');
}

function gatewayMessages(results, property) {
  const facebook = results.find((item) => item.platform === 'facebook' && item.postUrl);
  const share = facebook ? groupShareMessage(facebook.postUrl) : null;
  const published = results.some((item) => item.status === 'published' || item.status === 'processing');
  if (!share && !published) return null;
  const messages = [];
  if (share) messages.push(share);
  else messages.push('הפרסום עלה לחשבונות שחוברו.');
  messages.push(forwardCard(property));
  const also = [];
  if (results.some((item) => item.platform === 'instagram' && item.status === 'published')) also.push('אינסטגרם');
  if (results.some((item) => item.platform === 'tiktok' && (item.status === 'published' || item.status === 'processing'))) also.push('טיקטוק');
  if (also.length) messages.push(`גם ${also.join(' ו')} עלו מהחשבון שלך.`);
  const failed = results.filter((item) => item.status === 'failed' || item.status === 'skipped');
  if (failed.length) messages.push(failed.map(resultLine).join('\n'));
  return messages;
}

async function recordPublications(propertyId, results, waLink, caption) {
  for (const result of results) {
    await prisma.publication.create({
      data: {
        propertyId,
        platform: result.platform,
        targetId: result.targetId || null,
        targetName: result.targetName || null,
        postId: result.postId || null,
        postUrl: result.postUrl || null,
        waLink,
        caption,
        status: result.status,
        error: result.error || null,
      },
    });
  }
}

async function distributeThroughGateway({ broker, property, channels, groups, caption }) {
  const waLink = naturalWaLink(property) || clickToWhatsAppLink(property.code);
  let results = [];
  try {
    const published = await publishPropertyPost({
      brokerId: broker.id,
      propertyId: property.id,
      channels,
      caption,
    });
    results = published.results;
  } catch (error) {
    let detail = error.message;
    if (error.code === 'NOT_CONNECTED' || error.code === 'NO_ACCOUNTS') {
      detail = `${detail}\nלחץ כאן כדי לחבר את פייסבוק, אינסטגרם וטיקטוק: ${brokerConnectUrl(broker.id)}`;
    }
    results = [{ platform: 'social', status: 'failed', error: detail }];
  }
  await recordPublications(property.id, results, waLink, caption);
  return {
    waLink,
    results,
    summary: summarizeResults(results, waLink),
    messages: gatewayMessages(results, property),
  };
}

export function crmPublishNotice(outcome) {
  const results = outcome?.results || [];
  const missingVideo = results.some((item) => item.code === 'NO_VIDEO');
  if (!missingVideo) return outcome?.summary || '';
  const others = results.filter((item) => item.platform !== 'tiktok');
  if (!others.length) return TIKTOK_CRM_NOTICE;
  return `${summarizeResults(others, outcome.waLink)}\n${TIKTOK_CRM_NOTICE}`;
}

export async function publishPropertyChannel(broker, property, platform) {
  const waLink = naturalWaLink(property) || clickToWhatsAppLink(property.code);
  const caption = property.marketingText
    || await generateMarketing({ ...property, code: property.code }, waLink, broker);
  return distribute({
    broker,
    property,
    channels: [platform],
    groups: [],
    caption,
  });
}

export async function distribute({ broker, property, channels, groups, caption }) {
  if (config.socialGatewayApiKey) {
    return distributeThroughGateway({ broker, property, channels, groups, caption });
  }
  return distributeDirect({ broker, property, channels, groups, caption });
}

async function distributeDirect({ broker, property, channels, groups, caption }) {
  const waLink = naturalWaLink(property) || clickToWhatsAppLink(property.code);
  const accounts = await resolveAccounts(broker.id);
  const posts = planPosts({
    channels,
    groups,
    media: property.media || [],
    connected: {
      facebook: accounts.has('facebook'),
      instagram: accounts.has('instagram'),
      tiktok: accounts.has('tiktok'),
    },
  });
  const results = [];
  for (const item of posts) {
    if (item.status !== 'ready') {
      results.push(item);
      continue;
    }
    try {
      const published = await execute(item, accounts, caption, property.code);
      results.push({ ...item, ...published, status: published.status || 'published' });
    } catch (error) {
      results.push({ ...item, status: 'failed', error: error.message });
    }
  }

  await recordPublications(property.id, results, waLink, caption);
  await prisma.property.update({
    where: { id: property.id },
    data: { marketingText: caption },
  });
  return { waLink, results, summary: summarizeResults(results, waLink) };
}
