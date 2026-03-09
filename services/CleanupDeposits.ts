import type { Deposit } from '../types/Deposit.type.js';
import { DepositStore } from '../utils/DepositStore.js';
import logger from '../utils/Logger.js';
import { logDepositDeleted } from '../utils/AuditLog.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';

/****************************************************************************************
The goal of this task is cleaning up trash deposits and preventing relayer's congestion.

This task should:
- Delete (remove from persistent storage) QUEUED deposits that have been in that state for more than 48 hours.
- Delete (remove from persistent storage) any deposits that are in the FINALIZED state for more than 12 hours.

More info:
https://www.notion.so/thresholdnetwork/L2-tBTC-SDK-Relayer-Implementation-4dfedabfcf594c7d8ef80609541cf791?pvs=4
****************************************************************************************/

/**
 * @name cleanQueuedDeposits
 * @description Cleans up the deposits that have been in the QUEUED state for more than 48 hours.
 * @returns {Promise<void>} A promise that resolves when the old queued deposits are deleted.
 */

const REMOVE_QUEUED_TIME_MS: number =
  parseInt(process.env.CLEAN_QUEUED_TIME || '48', 10) * 60 * 60 * 1000;

export const cleanQueuedDeposits = async (): Promise<void> => {
  const operations: Deposit[] = await DepositStore.getByStatus(DepositStatus.QUEUED);
  const currentTime = Date.now();

  for (const { id, dates } of operations) {
    const createdAt = dates?.createdAt ? new Date(dates.createdAt).getTime() : null;
    if (!createdAt) continue;

    const ageInMs = currentTime - createdAt;

    if (ageInMs > REMOVE_QUEUED_TIME_MS) {
      const ageInHours = (ageInMs / (60 * 60 * 1000)).toFixed(2);

      logger.debug(
        `Deleting QUEUED ID: ${id} | Created: ${dates.createdAt} | Age: ${ageInHours} hours`,
      );

      const deposit = await DepositStore.getById(id);
      if (deposit) {
        await logDepositDeleted(deposit, `QUEUED deposit exceeded age limit (${ageInHours} hours)`);
      }

      await DepositStore.delete(id);
    }
  }
};

/**
 * @name cleanFinalizedDeposits
 * @description Cleans up the deposits that have been in the FINALIZED state for more than 12 hours.
 * @returns {Promise<void>} A promise that resolves when the old finalized deposits are deleted.
 */

const REMOVE_FINALIZED_TIME_MS: number =
  parseInt(process.env.CLEAN_FINALIZED_TIME || '12', 10) * 60 * 60 * 1000;

export const cleanFinalizedDeposits = async (): Promise<void> => {
  const operations: Deposit[] = await DepositStore.getByStatus(DepositStatus.FINALIZED);
  const currentTime = Date.now();

  for (const { id, dates } of operations) {
    const finalizationAt = dates?.finalizationAt ? new Date(dates.finalizationAt).getTime() : null;
    if (!finalizationAt) {
      continue;
    }

    const ageInMs = currentTime - finalizationAt;

    if (ageInMs > REMOVE_FINALIZED_TIME_MS) {
      const ageInHours = (ageInMs / (60 * 60 * 1000)).toFixed(2);

      logger.debug(
        `Deleting FINALIZED ID: ${id} | Finalized: ${dates.finalizationAt} | Age: ${ageInHours} hours`,
      );

      const deposit = await DepositStore.getById(id);
      if (deposit) {
        await logDepositDeleted(
          deposit,
          `FINALIZED deposit exceeded age limit (${ageInHours} hours)`,
        );
      }

      await DepositStore.delete(id);
    }
  }
};

/**
 * @name cleanBridgedDeposits
 * @description Cleans up the deposits that have been in the BRIDGED state for more than 12 hours.
 * @returns {Promise<void>} A promise that resolves when the old awaiting vaa deposits are deleted.
 */

const REMOVE_BRIDGED_TIME_MS: number =
  parseInt(process.env.CLEAN_BRIDGED_TIME || '12', 10) * 60 * 60 * 1000;

export const cleanBridgedDeposits = async (): Promise<void> => {
  const operations: Deposit[] = await DepositStore.getByStatus(DepositStatus.BRIDGED);
  const currentTime = Date.now();

  for (const { id, dates } of operations) {
    const bridgedAt = dates?.bridgedAt ? new Date(dates.bridgedAt).getTime() : null;
    if (!bridgedAt) continue;

    const ageInMs = currentTime - bridgedAt;

    if (ageInMs > REMOVE_BRIDGED_TIME_MS) {
      const ageInHours = (ageInMs / (60 * 60 * 1000)).toFixed(2);

      logger.info(
        `Deleting BRIDGED ID: ${id} | Bridged at: ${bridgedAt} | Age: ${ageInHours} hours`,
      );

      const deposit = await DepositStore.getById(id);
      if (deposit) {
        await logDepositDeleted(
          deposit,
          `BRIDGED deposit exceeded age limit (${ageInHours} hours)`,
        );
      }

      await DepositStore.delete(id);
    }
  }
};
