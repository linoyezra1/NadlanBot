import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';

export const pageTiming = new AsyncLocalStorage();

const globalForPrisma = globalThis;

function createClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const started = Date.now();
          const result = await query(args);
          const elapsed = Date.now() - started;
          const timing = pageTiming.getStore();
          if (timing) timing.db += elapsed;
          if (elapsed >= 100) console.log('slow query', model, operation, elapsed, 'ms');
          return result;
        },
      },
    },
  });
}

export function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Start the server with npm start so the local database can boot.');
  }
  if (!globalForPrisma.prismaClient) globalForPrisma.prismaClient = createClient();
  return globalForPrisma.prismaClient;
}

export const prisma = new Proxy({}, {
  get(_target, property) {
    const value = getPrisma()[property];
    return typeof value === 'function' ? value.bind(getPrisma()) : value;
  },
});
