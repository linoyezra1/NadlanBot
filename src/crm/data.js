import { prisma } from '../db.js';

const leadListInclude = {
  property: { select: { code: true, address: true, city: true, neighborhood: true, price: true } },
  messages: {
    where: { sender: 'bot' },
    orderBy: { timestamp: 'desc' },
    take: 1,
  },
};

function leadWhere(brokerId, extra = {}) {
  return { role: 'lead', ...extra, ...(brokerId ? { brokerId } : {}) };
}

export async function dashboardData(brokerId) {
  const propertyWhere = brokerId ? { brokerId } : {};
  const [propertyCount, leadCount, hotCount, openCount, properties, hotLeads] = await Promise.all([
    prisma.property.count({ where: propertyWhere }),
    prisma.conversation.count({ where: leadWhere(brokerId) }),
    prisma.conversation.count({ where: leadWhere(brokerId, { status: 'converted_hot_lead' }) }),
    prisma.conversation.count({ where: leadWhere(brokerId, { status: 'active' }) }),
    prisma.property.findMany({
      where: propertyWhere,
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: {
        media: { orderBy: { createdAt: 'asc' }, take: 1 },
        conversations: { where: { role: 'lead' }, select: { id: true, status: true } },
      },
    }),
    prisma.conversation.findMany({
      where: leadWhere(brokerId, { status: 'converted_hot_lead' }),
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: leadListInclude,
    }),
  ]);
  return { propertyCount, leadCount, hotCount, openCount, properties, hotLeads };
}

export function listProperties(q, brokerId) {
  const query = String(q || '').trim();
  const where = {};
  if (brokerId) where.brokerId = brokerId;
  if (query) {
    where.OR = [
      { code: { contains: query, mode: 'insensitive' } },
      { address: { contains: query, mode: 'insensitive' } },
      { city: { contains: query, mode: 'insensitive' } },
      { neighborhood: { contains: query, mode: 'insensitive' } },
    ];
  }
  return prisma.property.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      broker: true,
      conversations: { where: { role: 'lead' }, select: { id: true, status: true } },
    },
  });
}

export function getProperty(code) {
  return prisma.property.findUnique({
    where: { code },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      owner: true,
      broker: true,
      publications: { orderBy: { createdAt: 'desc' } },
      conversations: {
        where: { role: 'lead' },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
}

export function listLeads(filter, brokerId) {
  const where = leadWhere(brokerId);
  if (filter === 'hot') where.status = 'converted_hot_lead';
  if (filter === 'active') where.status = 'active';
  if (filter === 'closed') where.status = 'closed';
  return prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: leadListInclude,
  });
}

export function listBrokers() {
  return prisma.broker.findMany({
    orderBy: { fullName: 'asc' },
    include: { _count: { select: { properties: true } } },
  });
}

export function getBroker(id) {
  return prisma.broker.findUnique({
    where: { id },
    include: {
      properties: {
        orderBy: { createdAt: 'desc' },
        include: {
          media: { orderBy: { createdAt: 'asc' }, take: 1 },
          conversations: { where: { role: 'lead' }, select: { id: true, status: true } },
        },
      },
    },
  });
}

export function getLead(id, brokerId) {
  return prisma.conversation.findFirst({
    where: leadWhere(brokerId, { id }),
    include: {
      property: { include: { media: { orderBy: { createdAt: 'asc' }, take: 8 } } },
      messages: { orderBy: { timestamp: 'asc' } },
    },
  });
}
