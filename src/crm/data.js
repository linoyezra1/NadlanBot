import { prisma } from '../db.js';

const leadListInclude = {
  property: { select: { code: true, address: true, city: true, neighborhood: true, price: true } },
  messages: {
    where: { sender: 'bot' },
    orderBy: { timestamp: 'desc' },
    take: 1,
  },
};

export async function dashboardData() {
  const [propertyCount, leadCount, hotCount, openCount, properties, hotLeads] = await Promise.all([
    prisma.property.count(),
    prisma.conversation.count({ where: { role: 'lead' } }),
    prisma.conversation.count({ where: { role: 'lead', status: 'converted_hot_lead' } }),
    prisma.conversation.count({ where: { role: 'lead', status: 'active' } }),
    prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: {
        media: { orderBy: { createdAt: 'asc' }, take: 1 },
        conversations: { where: { role: 'lead' }, select: { id: true, status: true } },
      },
    }),
    prisma.conversation.findMany({
      where: { role: 'lead', status: 'converted_hot_lead' },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: leadListInclude,
    }),
  ]);
  return { propertyCount, leadCount, hotCount, openCount, properties, hotLeads };
}

export function listProperties(q) {
  const query = String(q || '').trim();
  return prisma.property.findMany({
    where: query ? {
      OR: [
        { code: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
        { neighborhood: { contains: query, mode: 'insensitive' } },
      ],
    } : undefined,
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

export function listLeads(filter) {
  const where = { role: 'lead' };
  if (filter === 'hot') where.status = 'converted_hot_lead';
  if (filter === 'active') where.status = 'active';
  if (filter === 'closed') where.status = 'closed';
  return prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: leadListInclude,
  });
}

export function getLead(id) {
  return prisma.conversation.findFirst({
    where: { id, role: 'lead' },
    include: {
      property: { include: { media: { orderBy: { createdAt: 'asc' }, take: 8 } } },
      messages: { orderBy: { timestamp: 'asc' } },
    },
  });
}
