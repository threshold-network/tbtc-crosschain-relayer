import { Deposit } from '../types/Deposit.type';
import {
  deleteJson,
  getAllJsonOperationsByStatus,
  getJsonById,
} from '../utils/JsonUtils';
import { LogMessage } from '../utils/Logs';
import { logDepositDeleted } from '../utils/AuditLog';
import { DepositStatus } from '../types/DepositStatus.enum';

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
  const operations: Deposit[] = await getAllJsonOperationsByStatus(
    DepositStatus.QUEUED
  );
  const currentTime = Date.now();

  // Filtrar y eliminar depósitos en una sola pasada, verificando que createdAt exista
  operations.forEach(({ id, dates }) => {
    const createdAt = dates?.createdAt
      ? new Date(dates.createdAt).getTime()
      : null;
    if (!createdAt) return;

    const ageInMs = currentTime - createdAt;

    // Verifica si createdAt es válido antes de proceder
    if (ageInMs > REMOVE_QUEUED_TIME_MS) {
      const ageInHours = (ageInMs / (60 * 60 * 1000)).toFixed(2);

      LogMessage(
        `Deleting QUEUED ID: ${id} | Created: ${dates.createdAt} | Age: ${ageInHours} hours`
      );

      // Get full deposit to log it before deletion
      const deposit = getJsonById(id);
      if (deposit) {
        // Log the deletion to the audit log
        logDepositDeleted(
          deposit,
          `QUEUED deposit exceeded age limit (${ageInHours} hours)`
        );
      }

      deleteJson(id);
    }
  });
};

/**
 * @name cleanFinalizedDeposits
 * @description Cleans up the deposits that have been in the FINALIZED state for more than 12 hours.
 * @returns {Promise<void>} A promise that resolves when the old finalized deposits are deleted.
 */

const REMOVE_FINALIZED_TIME_MS: number =
  parseInt(process.env.CLEAN_FINALIZED_TIME || '12', 10) * 60 * 60 * 1000;

export const cleanFinalizedDeposits = async (): Promise<void> => {
  const operations: Deposit[] = await getAllJsonOperationsByStatus(
    DepositStatus.FINALIZED
  );
  const currentTime = Date.now();

  // Filter and delete deposits in a single pass, checking that finalizationAt exists
  operations.forEach(({ id, dates }) => {
    const finalizationAt = dates?.finalizationAt
      ? new Date(dates.finalizationAt).getTime()
      : null;
    if (!finalizationAt) return;

    const ageInMs = currentTime - finalizationAt;

    if (ageInMs > REMOVE_FINALIZED_TIME_MS) {
      const ageInHours = (ageInMs / (60 * 60 * 1000)).toFixed(2);

      LogMessage(
        `Deleting FINALIZED ID: ${id} | Finalized: ${dates.finalizationAt} | Age: ${ageInHours} hours`
      );

      // Get full deposit to log it before deletion
      const deposit = getJsonById(id);
      if (deposit) {
        // Log the deletion to the audit log
        logDepositDeleted(
          deposit,
          `FINALIZED deposit exceeded age limit (${ageInHours} hours)`
        );
      }

      deleteJson(id);
    }
  });
};

/**
 * @name cleanBridgedDeposits
 * @description Cleans up the deposits that have been in the BRIDGED state for more than 12 hours.
 * @returns {Promise<void>} A promise that resolves when the old awaiting vaa deposits are deleted.
 */

const REMOVE_BRIDGED_TIME_MS: number =
  parseInt(process.env.CLEAN_BRIDGED_TIME || '12', 10) * 60 * 60 * 1000;

export const cleanBridgedDeposits = async (): Promise<void> => {
  const operations: Deposit[] = await getAllJsonOperationsByStatus(
    DepositStatus.BRIDGED
  );
  const currentTime = Date.now();

  // Filter and delete deposits in a single pass, checking that finalizationAt exists
  operations.forEach(({ id, dates }) => {
    const bridgedAt = dates?.bridgedAt
      ? new Date(dates.bridgedAt).getTime()
      : null;
    if (!bridgedAt) return;

    const ageInMs = currentTime - bridgedAt;

    if (ageInMs > REMOVE_BRIDGED_TIME_MS) {
      const ageInHours = (ageInMs / (60 * 60 * 1000)).toFixed(2);

      LogMessage(
        `Deleting BRIDGED ID: ${id} | Bridged at: ${bridgedAt} | Age: ${ageInHours} hours`
      );

      // Get full deposit to log it before deletion
      const deposit = getJsonById(id);
      if (deposit) {
        // Log the deletion to the audit log
        logDepositDeleted(
          deposit,
          `BRIDGED deposit exceeded age limit (${ageInHours} hours)`
        );
      }

      deleteJson(id);
    }
  });
};
