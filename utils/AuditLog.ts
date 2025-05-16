import fs from 'fs';
import path from 'path';
import { DepositStatus } from '../types/DepositStatus.enum';
import { Deposit } from '../types/Deposit.type';
import { LogError, LogMessage } from './Logs';

// Constants
const AUDIT_LOG_DIR = process.env.AUDIT_LOG_DIR || './logs';
const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || 'deposit_audit.log';

// Event types
export enum AuditEventType {
  DEPOSIT_CREATED = 'DEPOSIT_CREATED',
  DEPOSIT_UPDATED = 'DEPOSIT_UPDATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  DEPOSIT_INITIALIZED = 'DEPOSIT_INITIALIZED',
  DEPOSIT_FINALIZED = 'DEPOSIT_FINALIZED',
  DEPOSIT_DELETED = 'DEPOSIT_DELETED',
  DEPOSIT_AWAITING_WORMHOLE_VAA = 'DEPOSIT_AWAITING_WORMHOLE_VAA',
  DEPOSIT_BRIDGED = 'DEPOSIT_BRIDGED',
  ERROR = 'ERROR',
  API_REQUEST = 'API_REQUEST',
}

// Initialize the audit log directory
export const initializeAuditLog = (): void => {
  try {
    // Get absolute path
    const auditLogDir = path.resolve(AUDIT_LOG_DIR);
    const auditLogPath = path.resolve(auditLogDir, AUDIT_LOG_FILE);

    // Create directory if it doesn't exist
    if (!fs.existsSync(auditLogDir)) {
      fs.mkdirSync(auditLogDir, { recursive: true });
      LogMessage(`Created audit log directory: ${auditLogDir}`);
    }

    // Create the log file if it doesn't exist
    if (!fs.existsSync(auditLogPath)) {
      fs.writeFileSync(auditLogPath, '', 'utf8');
      LogMessage(`Created audit log file: ${auditLogPath}`);
    }
  } catch (error) {
    LogError('Failed to initialize audit log', error as Error);
  }
};

/**
 * Append an event to the audit log
 * @param eventType Type of the event
 * @param depositId ID of the deposit
 * @param data Additional data to log
 */
export const appendToAuditLog = (
  eventType: AuditEventType,
  depositId: string,
  data: any = {}
): void => {
  try {
    // Get absolute paths
    const auditLogDir = path.resolve(AUDIT_LOG_DIR);
    const auditLogPath = path.resolve(auditLogDir, AUDIT_LOG_FILE);

    // Ensure directory exists before appending (add a check just in case)
    if (!fs.existsSync(auditLogDir)) {
      throw new Error(`Audit log directory does not exist: ${auditLogDir}`);
    }
    // Ensure file exists before appending (initializeAuditLog should handle this)
    if (!fs.existsSync(auditLogPath)) {
      // Optionally recreate it if missing, or throw error
      fs.writeFileSync(auditLogPath, '', 'utf8');
      LogMessage(`Audit log file was missing, recreated: ${auditLogPath}`);
      // OR: throw new Error(`Audit log file does not exist: ${auditLogPath}`);
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      eventType,
      depositId,
      data,
    };

    const logString = JSON.stringify(logEntry) + '\n';

    // Append to log file
    fs.appendFileSync(auditLogPath, logString, 'utf8');
  } catch (error) {
    LogError('Failed to write to audit log', error as Error);
    console.error('AUDIT LOG ENTRY (FALLBACK):', {
      timestamp: new Date().toISOString(),
      eventType,
      depositId,
      data,
    });
  }
};

/**
 * Log status changes for a deposit
 * @param deposit The deposit object
 * @param oldStatus Previous status (optional)
 * @param newStatus New status
 */
export const logStatusChange = (
  deposit: Deposit,
  newStatus: DepositStatus,
  oldStatus?: DepositStatus
): void => {
  const statusMap = {
    [DepositStatus.QUEUED]: 'QUEUED',
    [DepositStatus.INITIALIZED]: 'INITIALIZED',
    [DepositStatus.FINALIZED]: 'FINALIZED',
    [DepositStatus.AWAITING_WORMHOLE_VAA]: 'AWAITING_WORMHOLE_VAA',
    [DepositStatus.BRIDGED]: 'BRIDGED',
  };

  appendToAuditLog(AuditEventType.STATUS_CHANGED, deposit.id, {
    from: oldStatus !== undefined ? statusMap[oldStatus] : 'UNKNOWN',
    to: statusMap[newStatus],
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      dates: deposit.dates,
    },
  });
};

/**
 * Log deposit creation
 * @param deposit The deposit object
 */
export const logDepositCreated = (deposit: Deposit): void => {
  appendToAuditLog(AuditEventType.DEPOSIT_CREATED, deposit.id, {
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      l2DepositOwner: deposit.L1OutputEvent?.l2DepositOwner,
      status: 'QUEUED',
      createdAt: deposit.dates.createdAt,
    },
  });
};

/**
 * Log deposit initialization
 * @param deposit The deposit object
 */
export const logDepositInitialized = (deposit: Deposit): void => {
  appendToAuditLog(AuditEventType.DEPOSIT_INITIALIZED, deposit.id, {
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      l2DepositOwner: deposit.L1OutputEvent?.l2DepositOwner,
      status: 'INITIALIZED',
      initializedAt: deposit.dates.initializationAt,
    },
    txHash: deposit.hashes.eth.initializeTxHash,
  });
};

/**
 * Log deposit finalization
 * @param deposit The deposit object
 */
export const logDepositFinalized = (deposit: Deposit): void => {
  appendToAuditLog(AuditEventType.DEPOSIT_FINALIZED, deposit.id, {
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      l2DepositOwner: deposit.L1OutputEvent?.l2DepositOwner,
      status: 'FINALIZED',
      finalizedAt: deposit.dates.finalizationAt,
    },
    txHash: deposit.hashes.eth.finalizeTxHash,
  });
};

/**
 * Log deposit deletion
 * @param deposit The deposit object
 * @param reason Reason for deletion
 */
export const logDepositDeleted = (deposit: Deposit, reason: string): void => {
  appendToAuditLog(AuditEventType.DEPOSIT_DELETED, deposit.id, {
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      l2DepositOwner: deposit.L1OutputEvent?.l2DepositOwner,
      status: deposit.status,
      createdAt: deposit.dates.createdAt,
      initializedAt: deposit.dates.initializationAt,
      finalizedAt: deposit.dates.finalizationAt,
    },
    reason,
  });
};

/**
 * Log API requests related to deposits
 * @param endpoint API endpoint
 * @param method HTTP method
 * @param depositId Deposit ID (if applicable)
 * @param requestData Request data
 * @param responseStatus Response status code
 */
export const logApiRequest = (
  endpoint: string,
  method: string,
  depositId: string | null,
  requestData: any = {},
  responseStatus: number = 200
): void => {
  appendToAuditLog(AuditEventType.API_REQUEST, depositId || 'no-deposit-id', {
    endpoint,
    method,
    requestData,
    responseStatus,
  });
};

/**
 * Log errors related to deposits
 * @param depositId Deposit ID
 * @param errorMessage Error message
 * @param errorObj Error object
 */
export const logDepositError = (
  depositId: string,
  errorMessage: string,
  errorObj: any = {}
): void => {
  appendToAuditLog(AuditEventType.ERROR, depositId, {
    message: errorMessage,
    error: errorObj.message || JSON.stringify(errorObj),
  });
};

/**
 * Log deposit finalization
 * @param deposit The deposit object
 */
export const logDepositAwaitingWormholeVAA = (deposit: Deposit): void => {
  appendToAuditLog(AuditEventType.DEPOSIT_AWAITING_WORMHOLE_VAA, deposit.id, {
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      l2DepositOwner: deposit.L1OutputEvent?.l2DepositOwner,
      status: 'AWAITING_WORMHOLE_VAA',
      awaitingWormholeVAAMessageSince: deposit.dates.awaitingWormholeVAAMessageSince,
    },
    txHash: deposit.hashes.eth.finalizeTxHash,
  });
};

/**
 * Log deposit finalization
 * @param deposit The deposit object
 */
export const logDepositBridged = (deposit: Deposit): void => {
  appendToAuditLog(AuditEventType.DEPOSIT_BRIDGED, deposit.id, {
    deposit: {
      id: deposit.id,
      fundingTxHash: deposit.fundingTxHash,
      owner: deposit.owner,
      l2DepositOwner: deposit.L1OutputEvent?.l2DepositOwner,
      status: 'BRIDGED',
      bridgedAt: deposit.dates.bridgedAt,
    },
    txHash: deposit.hashes.solana.bridgeTxHash,
  });
};
