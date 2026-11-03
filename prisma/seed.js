import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDatabaseUrl } from '../src/ensureDatabaseUrl.js';

export async function seed() {
  const { prisma } = await import('../src/db.js');
  const { normalizePhone } = await import('../src/domain/phone.js');
  const { config } = await import('../src/config.js');
  if (!config.initialBrokerPhone || !config.initialBrokerName) {
    console.log('Seed skipped. Set INITIAL_BROKER_PHONE and INITIAL_BROKER_NAME.');
    return;
  }
  const phoneNumber = normalizePhone(config.initialBrokerPhone);
  const broker = await prisma.broker.upsert({
    where: { phoneNumber },
    update: {
      fullName: config.initialBrokerName,
      businessName: config.initialBrokerBusiness || null,
      status: 'active',
    },
    create: {
      phoneNumber,
      fullName: config.initialBrokerName,
      businessName: config.initialBrokerBusiness || null,
    },
  });
  if (config.initialFbGroupId && config.initialFbGroupName) {
    await prisma.facebookGroup.upsert({
      where: { brokerId_groupId: { brokerId: broker.id, groupId: config.initialFbGroupId } },
      update: { name: config.initialFbGroupName },
      create: { brokerId: broker.id, groupId: config.initialFbGroupId, name: config.initialFbGroupName },
    });
  }
  console.log(`Broker ready: ${broker.fullName} ${broker.phoneNumber}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await ensureDatabaseUrl();
  try {
    await seed();
  } finally {
    const { prisma } = await import('../src/db.js');
    await prisma.$disconnect();
  }
}
