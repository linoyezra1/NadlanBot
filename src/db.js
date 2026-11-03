import { PrismaClient } from '@prisma/client';

let client;

export function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Start the server with npm start so the local database can boot.');
  }
  if (!client) client = new PrismaClient();
  return client;
}

export const prisma = new Proxy({}, {
  get(_target, property) {
    const value = getPrisma()[property];
    return typeof value === 'function' ? value.bind(getPrisma()) : value;
  },
});
