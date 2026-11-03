process.env.OPENAI_API_KEY = '';
process.env.WHATSAPP_TOKEN = '';

import crypto from 'node:crypto';
import { ensureDatabaseUrl } from '../src/ensureDatabaseUrl.js';

const BROKER = '972501110000';
const LEAD = '972509998877';
const DETAILS = `כתובת: רחוב הרצל 10
עיר: תל אביב
שכונה: נווה צדק
3.5 חדרים, קומה 2, 82 מ"ר
מחיר: 2,450,000 ₪
יש חניה, יש מעלית, יש מרפסת, יש ממ"ד
פינוי: מיידי
יתרונות: משופצת עם נוף פתוח
בעל הנכס: ישראל כהן
טלפון: 0501234567
הערות: לא להתקשר אחרי 20:00`;

const database = await ensureDatabaseUrl();
const { pushSchema } = await import('../src/server.js');
await pushSchema();
const { prisma } = await import('../src/db.js');
const { handleIncoming } = await import('../src/services/router.js');

function say(from, text, extra = {}) {
  return handleIncoming({
    messageId: `demo-${crypto.randomUUID()}`,
    from,
    name: extra.name || '',
    type: extra.media ? 'image' : 'text',
    text: text || '',
    buttonId: extra.buttonId || null,
    media: extra.media || null,
  });
}

function dump(title, result) {
  console.log(`\n# ${title}`);
  for (const reply of result.replies || []) {
    console.log(reply.type === 'text' || reply.type === 'buttons' ? reply.text : `[${reply.type}] ${reply.caption || reply.url}`);
  }
  for (const note of result.notifications || []) {
    console.log(`NOTIFY ${note.to}: ${(note.replies || []).map((reply) => reply.text).join(' | ')}`);
  }
}

const broker = await prisma.broker.upsert({
  where: { phoneNumber: BROKER },
  update: { fullName: 'מתווך הדגמה', status: 'active' },
  create: { phoneNumber: BROKER, fullName: 'מתווך הדגמה', businessName: 'משרד הדגמה' },
});
await prisma.conversation.deleteMany({ where: { OR: [{ brokerId: broker.id }, { leadPhone: LEAD }] } });
await prisma.property.deleteMany({ where: { brokerId: broker.id } });

const steps = [
  ['new', () => say(BROKER, 'יש לי דירה חדשה להעלות')],
  ['photo', () => say(BROKER, '', { media: { kind: 'image', url: 'https://cdn.example.com/kitchen.jpg', caption: 'מטבח' } })],
  ['done', () => say(BROKER, 'סיימתי')],
  ['details', () => say(BROKER, DETAILS)],
  ['save', () => say(BROKER, 'כן')],
  ['later', () => say(BROKER, 'אחר כך')],
];

try {
  for (const [title, run] of steps) dump(title, await run());
  const property = await prisma.property.findFirst({
    where: { brokerId: broker.id },
    include: { owner: true, media: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!property) throw new Error('property was not saved');
  if (property.city !== 'תל אביב' || property.price !== 2450000) {
    throw new Error(`unexpected property ${property.city} ${property.price}`);
  }
  if (property.owner?.ownerName !== 'ישראל כהן') throw new Error('owner was not stored privately');

  const leadSteps = [
    ['open', `שלום, אני מעוניין בפרטים על דירה ${property.code}`],
    ['facts', 'כמה חדרים ומה המחיר?'],
    ['photo', 'אפשר תמונות של המטבח?'],
    ['hot', 'אני רוצה לבוא לראות'],
    ['name', 'דנה לוי'],
    ['time', 'מחר ב-17:00'],
  ];
  const leadReplies = [];
  let notifications = [];
  for (const [title, text] of leadSteps) {
    const result = await say(LEAD, text, { name: 'דנה' });
    dump(title, result);
    leadReplies.push(...result.replies);
    notifications.push(...(result.notifications || []));
  }
  const spoken = leadReplies.map((reply) => `${reply.text || ''} ${reply.caption || ''}`).join('\n');
  if (spoken.includes('ישראל כהן') || spoken.includes('0501234567')) {
    throw new Error('owner details leaked to the lead');
  }
  if (!leadReplies.some((reply) => reply.type === 'image')) throw new Error('kitchen photo was not sent');
  const conversation = await prisma.conversation.findFirst({ where: { leadPhone: LEAD, propertyId: property.id } });
  if (conversation?.status !== 'converted_hot_lead') throw new Error(`lead status ${conversation?.status}`);
  if (!notifications.length) throw new Error('broker was not notified');
  console.log('\nDemo passed.');
} catch (error) {
  console.error('\nDemo failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await database.stop?.();
}
