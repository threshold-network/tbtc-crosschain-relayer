import fs from 'fs/promises';
import path from 'path';
import { Redemption, RedemptionStatus } from '../types/Redemption.type.js';
import logger from './Logger.js';

const REDEMPTIONS_DIR = path.resolve('./redemptions');

async function ensureRedemptionsDir() {
  try {
    await fs.mkdir(REDEMPTIONS_DIR, { recursive: true });
  } catch (err) {
    logger.error(`Failed to create redemptions directory: ${err}`);
    throw err;
  }
}

function getRedemptionFilePath(id: string): string {
  return path.join(REDEMPTIONS_DIR, `${id}.json`);
}

// In-memory per-file lock: ensures that all async operations on the same file are executed sequentially within this Node.js process, preventing race conditions and data corruption.
const fileLocks: Record<string, Promise<void>> = {};

async function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  // Chain operations for the same file
  const prev = fileLocks[file] || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => (release = resolve));
  fileLocks[file] = prev.then(() => next);
  try {
    await prev;
    return await fn();
  } finally {
    release!();
    // Clean up lock if no further waiters
    if (fileLocks[file] === next) delete fileLocks[file];
  }
}

export class RedemptionStore {
  static async create(redemption: Redemption): Promise<void> {
    await ensureRedemptionsDir();
    const file = getRedemptionFilePath(redemption.id);
    await withFileLock(file, async () => {
      try {
        await fs.writeFile(file, JSON.stringify(redemption, null, 2), { flag: 'wx' });
        logger.info(`Redemption created: ${redemption.id}`);
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          logger.warn(`Redemption already exists: ${redemption.id}`);
        } else {
          logger.error(`Failed to create redemption ${redemption.id}: ${err}`);
          throw err;
        }
      }
    });
  }

  static async update(redemption: Redemption): Promise<void> {
    await ensureRedemptionsDir();
    const file = getRedemptionFilePath(redemption.id);
    await withFileLock(file, async () => {
      try {
        await fs.writeFile(file, JSON.stringify(redemption, null, 2), { flag: 'w' });
        logger.info(`Redemption updated: ${redemption.id}`);
      } catch (err) {
        logger.error(`Failed to update redemption ${redemption.id}: ${err}`);
        throw err;
      }
    });
  }

  static async getById(id: string): Promise<Redemption | null> {
    await ensureRedemptionsDir();
    const file = getRedemptionFilePath(id);
    try {
      const data = await fs.readFile(file, 'utf8');
      return JSON.parse(data) as Redemption;
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      logger.error(`Failed to read redemption ${id}: ${err}`);
      throw err;
    }
  }

  static async getAll(): Promise<Redemption[]> {
    await ensureRedemptionsDir();
    const files = await fs.readdir(REDEMPTIONS_DIR);
    const redemptions: Redemption[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = await fs.readFile(path.join(REDEMPTIONS_DIR, file), 'utf8');
        redemptions.push(JSON.parse(data) as Redemption);
      } catch (err) {
        logger.warn(`Skipping malformed redemption file: ${file}`);
      }
    }
    return redemptions;
  }

  static async getByStatus(status: RedemptionStatus): Promise<Redemption[]> {
    const all = await this.getAll();
    return all.filter((r) => r.status === status);
  }

  static async delete(id: string): Promise<void> {
    await ensureRedemptionsDir();
    const file = getRedemptionFilePath(id);
    await withFileLock(file, async () => {
      try {
        await fs.unlink(file);
        logger.info(`Redemption deleted: ${id}`);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          logger.warn(`Redemption not found for delete: ${id}`);
        } else {
          logger.error(`Failed to delete redemption ${id}: ${err}`);
          throw err;
        }
      }
    });
  }
}
