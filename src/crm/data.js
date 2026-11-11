import { prisma } from '../db.js';

const PAGE = 20;

const leadListInclude = {
  property: { select: { code: true, address: true, city: true, neighborhood: true, price: true } },
  messages: {
    where: { sender: 'bot' },
    orderBy: { timestamp: 'desc' },
    take: 1,
    select: { text: true },
  },
};

const leadCardSelect = {
  id: true,
  status: true,
  leadPhone: true,
  contactName: true,
  summary: true,
  updatedAt: true,
  botPausedUntil: true,
};

function leadWhere(brokerId, extra = {}) {
  return { role: 'lead', ...extra, ...(brokerId ? { brokerId } : {}) };
}

function startOfTodayInJerusalem(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const probe = new Date(`${day}T00:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(probe));
  const minute = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    minute: '2-digit',
  }).format(probe));
  return new Date(probe.getTime() - (hour * 60 + minute) * 60 * 1000);
}

export async function dashboardData(brokerId) {
  const propertyWhere = brokerId ? { brokerId } : {};
  const today = startOfTodayInJerusalem();
  const [propertyCount, leadCount, hotCount, openCount, todayCount, properties, hotLeads] = await Promise.all([
    prisma.property.count({ where: propertyWhere }),
    prisma.conversation.count({ where: leadWhere(brokerId) }),
    prisma.conversation.count({ where: leadWhere(brokerId, { status: 'converted_hot_lead' }) }),
    prisma.conversation.count({ where: leadWhere(brokerId, { status: 'active' }) }),
    prisma.conversation.count({ where: leadWhere(brokerId, { createdAt: { gte: today } }) }),
    prisma.property.findMany({
      where: propertyWhere,
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: {
        media: { orderBy: { createdAt: 'asc' }, take: 1, select: { cloudUrl: true } },
        _count: { select: { socialPosts: true, conversations: true } },
      },
    }),
    prisma.conversation.findMany({
      where: leadWhere(brokerId, { status: 'converted_hot_lead' }),
      orderBy: { updatedAt: 'desc' },
      take: PAGE,
      include: leadListInclude,
    }),
  ]);
  return { propertyCount, leadCount, hotCount, openCount, todayCount, properties, hotLeads };
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
      media: { orderBy: { createdAt: 'asc' }, take: 1, select: { cloudUrl: true } },
      _count: { select: { socialPosts: true, conversations: true } },
    },
  });
}

export function getProperty(code) {
  return prisma.property.findUnique({
    where: { code },
    include: {
      media: { orderBy: { createdAt: 'asc' }, take: 40 },
      owner: true,
      broker: { select: { id: true, fullName: true, businessName: true, phoneNumber: true } },
      publications: { orderBy: { createdAt: 'desc' }, take: PAGE },
      socialPosts: {
        orderBy: { publishedAt: 'desc' },
        take: PAGE,
        include: { _count: { select: { comments: true } } },
      },
      conversations: {
        where: { role: 'lead' },
        orderBy: { updatedAt: 'desc' },
        take: PAGE,
        select: leadCardSelect,
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
    take: PAGE,
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
  return prisma.broker.findUnique({ where: { id } });
}

export async function getLead(id, brokerId) {
  const lead = await prisma.conversation.findFirst({
    where: leadWhere(brokerId, { id }),
    include: {
      property: {
        select: {
          code: true,
          address: true,
          city: true,
          neighborhood: true,
          price: true,
          media: { orderBy: { createdAt: 'asc' }, take: 1, select: { cloudUrl: true } },
        },
      },
      messages: { orderBy: { timestamp: 'desc' }, take: PAGE },
    },
  });
  if (lead?.messages) lead.messages.reverse();
  return lead;
}
