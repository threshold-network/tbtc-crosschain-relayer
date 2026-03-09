import { prisma } from './utils/prisma';

export default async () => {
  try {
    if (prisma && prisma.$disconnect) {
      await prisma.$disconnect();
    }

    if (global.gc) {
      global.gc();
    }

    console.log('Jest Global Teardown: Successfully disconnected all connections');
  } catch (error) {
    console.error('Jest Global Teardown: Error during cleanup:', error);
  }
};
