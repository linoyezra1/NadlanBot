import crypto from 'node:crypto';
import { applyParkingChoice, readDisclosure } from '../domain/disclosure.js';
import { AMENITY_KEYS, AMENITY_LABELS, blankFields, coerceField, missingAmenityKeys } from '../domain/fields.js';
import { prisma } from '../db.js';
import { storeBuffer } from './storage.js';
import { MAX_MEDIA_BYTES } from '../crm/multipart.js';

export function propertyData(fields, status) {
  const data = {
    address: fields.address,
    city: fields.city,
    neighborhood: fields.neighborhood,
    rooms: fields.rooms,
    floor: fields.floor,
    sizeSqm: fields.sizeSqm,
    price: fields.price,
    amenities: fields.amenities || {},
    disclosure: fields.disclosure || undefined,
    vacancyDate: fields.vacancyDate,
    featuresText: fields.featuresText,
    listingType: fields.listingType,
  };
  if (status) data.status = status;
  if (data.disclosure == null) delete data.disclosure;
  return data;
}

export async function createPropertyFromDraft({ brokerId, fields, status = 'active' }) {
  const created = await prisma.property.create({
    data: {
      code: `TMP-${crypto.randomUUID()}`,
      brokerId,
      ...propertyData(fields, status),
      owner: {
        create: {
          ownerName: fields.ownerName,
          ownerPhone: fields.ownerPhone,
          privateNotes: fields.privateNotes,
        },
      },
    },
  });
  const code = `APT-${100 + created.seq}`;
  return prisma.property.update({
    where: { id: created.id },
    data: { code },
    include: { owner: true, media: true },
  });
}

export async function updatePropertyFromFields(propertyId, fields, { status } = {}) {
  return prisma.property.update({
    where: { id: propertyId },
    data: {
      ...propertyData(fields, status),
      owner: {
        upsert: {
          update: {
            ownerName: fields.ownerName || null,
            ownerPhone: fields.ownerPhone || null,
            privateNotes: fields.privateNotes || null,
          },
          create: {
            ownerName: fields.ownerName || null,
            ownerPhone: fields.ownerPhone || null,
            privateNotes: fields.privateNotes || null,
          },
        },
      },
    },
    include: { owner: true, media: true },
  });
}

export function findActiveProperty(code) {
  return prisma.property.findFirst({
    where: { code, status: 'active' },
    include: { media: true, broker: true },
  });
}

export function findBrokerProperty(brokerId, code) {
  return prisma.property.findFirst({
    where: { brokerId, code },
    include: { media: true, owner: true },
  });
}

export function listBrokerProperties(brokerId) {
  return prisma.property.findMany({
    where: { brokerId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

export async function attachDraftMedia(conversationId, propertyId) {
  await prisma.propertyMedia.updateMany({
    where: { conversationId, propertyId: null },
    data: { propertyId },
  });
}

const OFFICE_KEYS = [
  'address',
  'city',
  'neighborhood',
  'rooms',
  'floor',
  'sizeSqm',
  'price',
  'vacancyDate',
  'listingType',
  'featuresText',
  'ownerName',
  'ownerPhone',
  'privateNotes',
];

export function officeFields(input) {
  const source = input || {};
  const fields = blankFields();
  for (const key of OFFICE_KEYS) fields[key] = coerceField(key, source[key]);
  const amenities = {};
  for (const key of AMENITY_KEYS) {
    if (key === 'parking') continue;
    if (source[key] === 'yes') amenities[key] = true;
    else if (source[key] === 'no') amenities[key] = false;
  }
  Object.assign(amenities, applyParkingChoice(amenities, source.parking));
  fields.amenities = amenities;
  fields.disclosure = readDisclosure(source);
  const errors = [];
  if (!fields.listingType) errors.push('חסר למכירה או להשכרה.');
  if (!fields.address) errors.push('חסרה כתובת.');
  if (!fields.city) errors.push('חסרה עיר.');
  if (fields.rooms == null) errors.push('חסר מספר חדרים.');
  if (fields.price == null) errors.push('חסר מחיר.');
  const missing = missingAmenityKeys(amenities);
  if (missing.length) errors.push(`חסר סימון יש או אין: ${missing.map((key) => AMENITY_LABELS[key]).join(', ')}.`);
  return { fields, errors };
}

function mediaKind(file) {
  const mime = String(file.mimeType || '');
  const name = String(file.filename || '');
  if (mime.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(name)) return 'video';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name)) return 'image';
  return null;
}

export function saveCardSettings(property, input) {
  const amenities = applyParkingChoice(property.amenities, input?.parking);
  return prisma.property.update({
    where: { id: property.id },
    data: {
      amenities,
      disclosure: { ...(property.disclosure || {}), ...readDisclosure(input) },
    },
  });
}

export async function addPropertyFiles(propertyId, files) {
  const incoming = (files || []).filter((file) => file?.buffer?.length);
  if (!incoming.length) return { saved: 0, rejected: [] };
  const existing = await prisma.propertyMedia.count({ where: { propertyId } });
  const rejected = [];
  const accepted = [];
  for (const file of incoming) {
    const mediaType = mediaKind(file);
    if (file.buffer.length > MAX_MEDIA_BYTES) {
      rejected.push(`${file.filename || 'קובץ'} גדול מ-50MB`);
      continue;
    }
    if (!mediaType) {
      rejected.push(file.filename || 'קובץ');
      continue;
    }
    if (existing + accepted.length >= 20) {
      rejected.push(file.filename || 'קובץ');
      continue;
    }
    accepted.push({ ...file, mediaType });
  }
  for (const file of accepted) {
    const stored = await storeBuffer({
      buffer: file.buffer,
      mimeType: file.mimeType,
      filename: file.filename,
    });
    await prisma.propertyMedia.create({
      data: {
        propertyId,
        mediaType: file.mediaType,
        cloudUrl: stored.url,
        storageKey: stored.key || 'local',
        tags: [],
      },
    });
  }
  return { saved: accepted.length, rejected };
}
