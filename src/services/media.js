import { detectTags } from '../domain/tags.js';
import { prisma } from '../db.js';
import { downloadWhatsAppMedia, isTwilioMediaUrl } from './whatsapp.js';
import { storeBuffer } from './storage.js';

function mediaTypeFor(kind) {
  if (kind === 'video') return 'video';
  if (kind === 'document') return 'document';
  return 'image';
}

export async function ingestEventMedia(event) {
  const media = event.media;
  if (!media || media.kind === 'audio') return null;
  const tags = detectTags(`${media.caption || ''} ${event.text || ''}`);
  const caption = media.caption || null;
  if (media.url && isTwilioMediaUrl(media.url)) {
    const downloaded = await downloadWhatsAppMedia(media.url);
    const stored = await storeBuffer({
      buffer: downloaded.buffer,
      mimeType: downloaded.mimeType,
      filename: media.filename,
    });
    return {
      mediaType: mediaTypeFor(media.kind),
      cloudUrl: stored.url,
      storageKey: stored.key,
      tags,
      caption,
    };
  }
  if (media.url) {
    return {
      mediaType: mediaTypeFor(media.kind),
      cloudUrl: media.url,
      storageKey: null,
      tags,
      caption,
    };
  }
  return null;
}

export async function attachMedia(conversation, event) {
  const stored = await ingestEventMedia(event);
  if (!stored) return null;
  const count = await prisma.propertyMedia.count({ where: { conversationId: conversation.id } });
  if (count >= 20) {
    const error = new Error('limit');
    error.code = 'MEDIA_LIMIT';
    throw error;
  }
  return prisma.propertyMedia.create({
    data: {
      conversationId: conversation.id,
      propertyId: conversation.propertyId || null,
      mediaType: stored.mediaType,
      cloudUrl: stored.cloudUrl,
      storageKey: stored.storageKey,
      tags: stored.tags,
      caption: stored.caption,
    },
  });
}

export function countConversationMedia(conversationId) {
  return prisma.propertyMedia.count({ where: { conversationId } });
}
