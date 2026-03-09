import { PrismaClient as PrismaClientProd } from '@prisma/client';
import pLimit from 'p-limit';

// In production builds we avoid statically importing '@prisma/client-test'
// because it is not generated/installed. In tests, fall back to requiring it
// dynamically if available, otherwise use the prod client.
function createPrismaClient() {
  if (process.env.NODE_ENV === 'test') {
    try {
      const { PrismaClient: PrismaClientTest } = require('@prisma/client-test');
      return new PrismaClientTest();
    } catch (_err) {
      return new PrismaClientProd();
    }
  }

  return new PrismaClientProd();
}

export const prisma = createPrismaClient();

// A lightweight, in-process concurrency limiter for DB calls to avoid
// exhausting Postgres connection slots on small instances.
// Defaults to 3 concurrent DB operations; configurable via DB_CONCURRENCY.
const dbConcurrency = Math.max(1, Number.parseInt(process.env.DB_CONCURRENCY || '', 10) || 3);
export const dbLimit = pLimit(dbConcurrency);
