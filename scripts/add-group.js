import { ensureDatabaseUrl } from '../src/ensureDatabaseUrl.js';

const [phone, groupId, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ');
if (!phone || !groupId || !name) {
  console.error('Usage: npm run group:add -- <broker phone> <group id> <group name>');
  process.exit(1);
}

await ensureDatabaseUrl();
const { prisma } = await import('../src/db.js');
const { normalizePhone } = await import('../src/domain/phone.js');
const broker = await prisma.broker.findUnique({ where: { phoneNumber: normalizePhone(phone) } });
if (!broker) {
  console.error('Broker was not found.');
  process.exit(1);
}
await prisma.facebookGroup.upsert({
  where: { brokerId_groupId: { brokerId: broker.id, groupId } },
  update: { name },
  create: { brokerId: broker.id, groupId, name },
});
console.log(`Group saved: ${name}`);
await prisma.$disconnect();
