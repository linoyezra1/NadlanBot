import crypto from 'node:crypto';
import { prisma } from '../db.js';

export async function createPropertyFromDraft({ brokerId, fields }) {
  const created = await prisma.property.create({
    data: {
      code: `TMP-${crypto.randomUUID()}`,
      brokerId,
      address: fields.address,
      city: fields.city,
      neighborhood: fields.neighborhood,
      rooms: fields.rooms,
      floor: fields.floor,
      sizeSqm: fields.sizeSqm,
      price: fields.price,
      amenities: fields.amenities || {},
      vacancyDate: fields.vacancyDate,
      featuresText: fields.featuresText,
      status: 'active',
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

export function findActiveProperty(code) {
  return prisma.property.findFirst({
    where: { code, status: 'active' },
    include: { media: true, broker: true },
  });
}

export function findBrokerProperty(brokerId, code) {
  return prisma.property.findFirst({
    where: { brokerId, code },
    include: { media: true },
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
