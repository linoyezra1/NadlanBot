import { ensureDatabaseUrl } from '../src/ensureDatabaseUrl.js';

const [phone, fullName, businessName = null] = process.argv.slice(2);

if (!phone || !fullName) {
  console.error('Usage: npm run broker:add -- <phone> <full name> [business name]');
  process.exit(1);
}

await ensureDatabaseUrl();
const { prisma } = await import('../src/db.js');
const { normalizePhone } = await import('../src/domain/phone.js');
const phoneNumber = normalizePhone(phone);
const broker = await prisma.broker.upsert({
  where: { phoneNumber },
  update: { fullName, businessName, status: 'active' },
  create: { phoneNumber, fullName, businessName },
});
console.log(`${broker.fullName} ${broker.phoneNumber}`);
await prisma.$disconnect();
