import { config } from '../../config.js';
import { prisma } from '../../db.js';

export async function resolveAccounts(brokerId) {
  const rows = await prisma.socialAccount.findMany({ where: { brokerId } });
  const accounts = new Map(rows.map((row) => [row.platform, row]));
  if (!accounts.has('facebook') && config.metaPageId && config.metaPageAccessToken) {
    accounts.set('facebook', {
      platform: 'facebook',
      accountId: config.metaPageId,
      accessToken: config.metaPageAccessToken,
    });
  }
  if (!accounts.has('instagram') && config.metaIgUserId && config.metaPageAccessToken) {
    accounts.set('instagram', {
      platform: 'instagram',
      accountId: config.metaIgUserId,
      accessToken: config.metaPageAccessToken,
    });
  }
  if (!accounts.has('tiktok') && config.tiktokAccessToken) {
    accounts.set('tiktok', {
      platform: 'tiktok',
      accountId: 'me',
      accessToken: config.tiktokAccessToken,
    });
  }
  return accounts;
}
