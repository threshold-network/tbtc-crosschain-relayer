import type { Deposit } from '../types/Deposit.type.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
import logger, { logErrorContext } from './Logger.js';
import { prisma, dbLimit } from '../utils/prisma.js';
import { Prisma } from '@prisma/client';

function serializeDeposit(deposit: Deposit): Prisma.DepositCreateInput {
  // Only JSON fields need to be stringified for Prisma Json type
  return {
    ...deposit,
    hashes: deposit.hashes as Prisma.InputJsonValue,
    receipt: deposit.receipt as Prisma.InputJsonValue,
    L1OutputEvent: deposit.L1OutputEvent
      ? (deposit.L1OutputEvent as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    dates: deposit.dates as Prisma.InputJsonValue,
    status: deposit.status,
  };
}

export class DepositStore {
  static async create(deposit: Deposit): Promise<void> {
    try {
      await dbLimit(() =>
        prisma.deposit.create({
          data: serializeDeposit(deposit),
        }),
      );
      logger.info(`Deposit created: ${deposit.id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        logger.warn(`Deposit already exists: ${deposit.id}`);
      } else {
        logErrorContext(`Failed to create deposit ${deposit.id}:`, err, {
          depositId: deposit.id,
          chainName: deposit.chainId,
          fundingTxHash: deposit.fundingTxHash ?? undefined,
        });
        throw err;
      }
    }
  }

  static async update(deposit: Deposit): Promise<void> {
    try {
      await dbLimit(() =>
        prisma.deposit.update({
          where: { id: deposit.id },
          data: serializeDeposit(deposit),
        }),
      );
      logger.info(`Deposit updated: ${deposit.id}`);
    } catch (err) {
      logErrorContext(`Failed to update deposit ${deposit.id}:`, err, {
        depositId: deposit.id,
        chainName: deposit.chainId,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
        finalizeTxHash: deposit.hashes?.eth?.finalizeTxHash ?? undefined,
      });
      throw err;
    }
  }

  static async getById(id: string): Promise<Deposit | null> {
    try {
      const record = await dbLimit(() => prisma.deposit.findUnique({ where: { id } }));
      return record;
    } catch (err) {
      logErrorContext(`Failed to read deposit ${id}:`, err);
      throw err;
    }
  }

  static async getAll(): Promise<Deposit[]> {
    try {
      const records = await dbLimit(() => prisma.deposit.findMany());
      return records;
    } catch (err) {
      logErrorContext(`Failed to fetch all deposits:`, err);
      return [];
    }
  }

  static async getByStatus(status: DepositStatus, chainId?: string): Promise<Deposit[]> {
    try {
      const whereClause: Prisma.DepositWhereInput = { status };
      if (chainId) {
        whereClause.chainId = chainId;
      }
      const records = await dbLimit(() => prisma.deposit.findMany({ where: whereClause }));
      return records;
    } catch (err) {
      logErrorContext(
        `Failed to fetch deposits by status${chainId ? ` for chain ${chainId}` : ''}:`,
        err,
      );
      return [];
    }
  }

  static async delete(id: string): Promise<void> {
    try {
      await dbLimit(() => prisma.deposit.delete({ where: { id } }));
      logger.info(`Deposit deleted: ${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
        logger.warn(`Deposit not found for delete: ${id}`);
      } else {
        logErrorContext(`Failed to delete deposit ${id}:`, err);
        throw err;
      }
    }
  }
}
