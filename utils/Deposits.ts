import { ethers } from 'ethers';
import { type Deposit } from '../types/Deposit.type.js';
import { type FundingTransaction } from '../types/FundingTransaction.type.js';
import { getTransactionHash } from './GetTransactionHash.js';
import { DepositStore } from './DepositStore.js';
import logger, { createLoggerWithCorrelation } from './Logger.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
import {
  logDepositCreated,
  logStatusChange,
  logDepositInitialized,
  logDepositFinalized,
  logDepositAwaitingWormholeVAA,
  logDepositBridged,
} from './AuditLog.js';
import { type Reveal } from '../types/Reveal.type.js';

// Type for transaction objects with hash property
interface TransactionWithHash {
  hash: string;
}

/**
 * @name createDeposit
 * @description Creates a new deposit object with the data provided by the event listener.
 * This function takes a funding transaction, reveal parameters, L2 deposit owner, and L2 sender information,
 * and constructs a structured Deposit object. The Deposit object includes transaction hashes, receipt details,
 * event data, ownership information, status, and timestamps.
 *
 * @param {FundingTransaction} fundingTx - The Bitcoin funding transaction.
 * @param {Reveal} reveal - An object containing reveal parameters related to the Bitcoin deposit.
 * @param {string} l2DepositOwner - The owner of the deposit on the L2 network.
 * @param {string} l2Sender - The sender address on the L2 network.
 * @param {string} chainId - The chain ID of the deposit.
 *
 * @returns {Deposit} A structured deposit object containing detailed information for various uses in the system.
 */

/**
 * Reverses the byte order of a hex string (without the 0x prefix).
 * Used for converting between big-endian and little-endian formats.
 */
function reverseHexString(hex: string): string {
  if (typeof hex !== 'string') {
    throw new Error('Input must be a string');
  }
  if (!hex.startsWith('0x')) {
    throw new Error('Hex string must be 0x-prefixed');
  }
  if (hex.length < 4) {
    throw new Error('Hex string must contain at least one byte after 0x');
  }
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const hexBody = hex.slice(2);
  const pairs = hexBody.match(/.{2}/g);
  if (!pairs) {
    throw new Error('Failed to parse hex string into byte pairs');
  }
  return '0x' + pairs.reverse().join('');
}

/**
 * Generates a deposit key by hashing the Bitcoin funding transaction hash and output index
 * using keccak256. This key is a `bytes32` value used for on-chain interactions.
 * For EVM chains, pass reverse=true to match contract expectations.
 * For StarkNet, always use reverse=false.
 *
 * @param {string} fundingTxHash - The 66-character hex string of the Bitcoin funding transaction hash (0x-prefixed, 32 bytes).
 * @param {number} fundingOutputIndex - The index of the output in the funding transaction (must be >= 0 and <= 0xffffffff).
 * @param {boolean} reverse - Whether to reverse the hash (EVM: true, StarkNet: false)
 * @returns {string} The deposit key as a `bytes32` hex string.
 */
export const getDepositKey = (
  fundingTxHash: string,
  fundingOutputIndex: number,
  reverse: boolean = true,
): string => {
  // Validate fundingTxHash
  if (typeof fundingTxHash !== 'string') {
    throw new Error('fundingTxHash must be a string');
  }
  if (!ethers.utils.isHexString(fundingTxHash) || fundingTxHash.length !== 66) {
    throw new Error('fundingTxHash must be a 66-character hex string (e.g. 0x...)');
  }
  // Validate fundingOutputIndex
  if (!Number.isInteger(fundingOutputIndex) || fundingOutputIndex < 0) {
    throw new Error('fundingOutputIndex must be a non-negative integer');
  }
  if (fundingOutputIndex > 0xffffffff) {
    throw new Error('fundingOutputIndex must fit in uint32 range');
  }

  let hashToUse = fundingTxHash;
  if (reverse) {
    hashToUse = reverseHexString(fundingTxHash);
    logger.debug('getDepositKey reversal:', {
      original: fundingTxHash,
      reversed: hashToUse,
      outputIndex: fundingOutputIndex,
    });
  }
  // Use uint32 for output index to match on-chain contract
  const types = ['bytes32', 'uint32'];
  const values = [hashToUse, fundingOutputIndex];
  return ethers.utils.solidityKeccak256(types, values);
};

/**
 * Converts a deposit's keccak256 hash (deposit key) into a uint256 string representation,
 * which serves as the unique deposit ID in the system. It calls `getDepositKey`
 * to generate the underlying `bytes32` hash.
 * This ID is used for tracking and storage.
 *
 * @param {string} fundingTxHash - The 66-character hex string of the Bitcoin funding transaction hash (0x-prefixed, 32 bytes).
 *                                 Must be in big-endian; will be reversed for little-endian.
 * @param {number} fundingOutputIndex - The index of the output in the funding transaction (must be >= 0 and <= 0xffffffff).
 * @returns {string} A unique deposit ID as a uint256 string.
 * @throws {Error} If the fundingTxHash is not a valid 66-character hex string or fundingOutputIndex is invalid.
 *
 * @example
 * ```typescript
 * getDepositId('0xabcdef...123456', 0)
 * ```
 */
export const getDepositId = (fundingTxHash: string, fundingOutputIndex: number): string => {
  const hashBytes32 = getDepositKey(fundingTxHash, fundingOutputIndex);
  return ethers.BigNumber.from(hashBytes32).toString();
};

export const createDeposit = (
  fundingTx: FundingTransaction,
  reveal: Reveal,
  l2DepositOwner: string,
  l2Sender: string,
  chainId: string,
): Deposit => {
  // For deposit ID calculation, we need to match the reference script's behavior:
  // 1. Use Bitcoin format hash (reversed)
  // 2. getDepositId will reverse it back to big-endian for keccak256

  // Calculate Bitcoin transaction hash (double SHA256 + reverse)
  // This works for all chains including SUI
  const bitcoinTxHash = getTransactionHash(fundingTx); // This returns reversed hash
  const fundingTxHashHex = '0x' + bitcoinTxHash;

  const depositId = getDepositId(fundingTxHashHex, reveal.fundingOutputIndex);

  // Debug logging for hash transformations
  logger.debug('Deposit hash transformations:', {
    chainId,
    bitcoinTxHash,
    fundingTxHashHex,
    outputIndex: reveal.fundingOutputIndex,
    depositId,
    depositIdHex: '0x' + ethers.BigNumber.from(depositId).toHexString().slice(2).padStart(64, '0'),
  });

  const deposit: Deposit = {
    id: depositId,
    chainId: chainId,
    fundingTxHash: fundingTxHashHex,
    outputIndex: reveal.fundingOutputIndex,
    hashes: {
      btc: {
        btcTxHash: bitcoinTxHash,
      },
      eth: {
        initializeTxHash: null,
        finalizeTxHash: null,
      },
      solana: {
        bridgeTxHash: null,
      },
    },
    receipt: {
      depositor: l2Sender,
      blindingFactor: reveal.blindingFactor,
      walletPublicKeyHash: reveal.walletPubKeyHash,
      refundPublicKeyHash: reveal.refundPubKeyHash,
      refundLocktime: reveal.refundLocktime,
      extraData: l2DepositOwner,
    },
    L1OutputEvent: {
      fundingTx: {
        version: fundingTx.version,
        inputVector: fundingTx.inputVector,
        outputVector: fundingTx.outputVector,
        locktime: fundingTx.locktime,
      },
      reveal: reveal,
      l2DepositOwner: l2DepositOwner,
      l2Sender: l2Sender,
    },
    owner: l2DepositOwner,
    status: DepositStatus.QUEUED,
    dates: {
      createdAt: Date.now(),
      initializationAt: null,
      finalizationAt: null,
      lastActivityAt: Date.now(),
      awaitingWormholeVAAMessageSince: null,
      bridgedAt: null,
    },
    wormholeInfo: {
      txHash: null,
      transferSequence: null,
      bridgingAttempted: false,
    },
    error: null,
  };

  // --- Log Deposit Creation ---
  logDepositCreated(deposit);
  createLoggerWithCorrelation({
    depositId: deposit.id,
    chainName: chainId,
    fromStatus: 'CREATED',
    toStatus: 'QUEUED',
    operation: 'deposit_created',
    fundingTxHash: fundingTxHashHex,
  }).info('Deposit state change: CREATED → QUEUED');
  // --- End Log ---

  return deposit;
};

/**
 * Creates a deposit record from backend notification (gasless flow).
 * The deposit was ALREADY initialized on L1 by the backend.
 *
 * This function is used in the gasless deposit flow where:
 * 1. Backend initializes deposit on L1 using its own keys
 * 2. Backend notifies relayer via HTTP API
 * 3. Relayer creates this deposit record with status=INITIALIZED
 * 4. Relayer continues with normal finalization flow
 *
 * @param depositKey - Deposit key from backend (already calculated)
 * @param fundingTx - Bitcoin funding transaction
 * @param reveal - Deposit reveal info
 * @param destinationChainDepositOwner - L2 deposit owner address
 * @param initTxHash - L1 initialization transaction hash (from backend)
 * @param backendAddress - Backend wallet address (msg.sender on L1 initializeDeposit call)
 * @param chainId - Chain identifier
 * @returns Deposit object with status=INITIALIZED
 */
export const createDepositFromNotification = (
  depositKey: string,
  fundingTx: FundingTransaction,
  reveal: Reveal,
  destinationChainDepositOwner: string,
  initTxHash: string,
  backendAddress: string,
  chainId: string,
): Deposit => {
  const now = Date.now();

  // Calculate Bitcoin transaction hash for consistency checking
  const bitcoinTxHash = getTransactionHash(fundingTx);
  const fundingTxHashHex = '0x' + bitcoinTxHash;

  // Verify depositKey matches (should have been verified by controller, but double-check)
  // This is a critical validation - if it fails, we must halt execution to prevent
  // creating a corrupted deposit record that will fail during finalization
  const calculatedDepositId = getDepositId(fundingTxHashHex, reveal.fundingOutputIndex);
  if (calculatedDepositId !== depositKey) {
    const errorMsg = `Deposit key mismatch in createDepositFromNotification: provided=${depositKey}, calculated=${calculatedDepositId}, fundingTxHash=${fundingTxHashHex}, outputIndex=${reveal.fundingOutputIndex}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const deposit: Deposit = {
    id: depositKey,
    chainId: chainId,
    fundingTxHash: fundingTxHashHex,
    outputIndex: reveal.fundingOutputIndex,
    hashes: {
      btc: {
        btcTxHash: bitcoinTxHash,
      },
      eth: {
        initializeTxHash: initTxHash, // Backend's initialization tx
        finalizeTxHash: null,
      },
      solana: {
        bridgeTxHash: null,
      },
    },
    receipt: {
      depositor: backendAddress, // Backend wallet address (msg.sender on L1)
      blindingFactor: reveal.blindingFactor,
      walletPublicKeyHash: reveal.walletPubKeyHash,
      refundPublicKeyHash: reveal.refundPubKeyHash,
      refundLocktime: reveal.refundLocktime,
      extraData: destinationChainDepositOwner,
    },
    L1OutputEvent: {
      fundingTx: {
        version: fundingTx.version,
        inputVector: fundingTx.inputVector,
        outputVector: fundingTx.outputVector,
        locktime: fundingTx.locktime,
      },
      reveal: reveal,
      l2DepositOwner: destinationChainDepositOwner,
      l2Sender: backendAddress, // Backend wallet address (msg.sender on L1)
    },
    owner: destinationChainDepositOwner,
    status: DepositStatus.INITIALIZED, // ALREADY initialized by backend
    dates: {
      createdAt: now,
      initializationAt: now, // Just initialized by backend
      finalizationAt: null,
      lastActivityAt: now,
      awaitingWormholeVAAMessageSince: null,
      bridgedAt: null,
    },
    wormholeInfo: {
      txHash: null,
      transferSequence: null,
      bridgingAttempted: false,
    },
    error: null,
  };

  logDepositCreated(deposit);
  createLoggerWithCorrelation({
    depositId: depositKey,
    chainName: chainId,
    fromStatus: 'CREATED',
    toStatus: 'INITIALIZED',
    operation: 'deposit_created_from_notification',
    fundingTxHash: fundingTxHashHex,
    initializeTxHash: initTxHash,
  }).info('Deposit state change: CREATED → INITIALIZED (from backend notification)');

  return deposit;
};

/**
 * @name updateToFinalizedDeposit
 * @description Updates the status of a deposit to "FINALIZED" and records the finalization transaction hash.
 * This function takes a deposit object and a transaction object, updates the deposit status to "FINALIZED",
 * records the finalization timestamp, and stores the finalization transaction hash in the deposit object.
 * The updated deposit object is then written to the JSON storage.
 * @param {Deposit} deposit - The deposit object to be updated.
 * @param {TransactionWithHash} tx - The transaction object containing the finalization transaction hash.
 */
export const updateToFinalizedDeposit = async (
  deposit: Deposit,
  tx?: TransactionWithHash,
  error?: string,
) => {
  const oldStatus = deposit.status; // Capture old status before changes
  const newStatus = tx ? DepositStatus.FINALIZED : deposit.status;
  const newFinalizationAt = tx ? Date.now() : deposit.dates.finalizationAt;
  const newHash = tx
    ? {
        ...deposit.hashes,
        eth: {
          ...deposit.hashes.eth,
          finalizeTxHash: tx?.hash ? tx.hash : null,
        },
      }
    : deposit.hashes;

  const updatedDeposit: Deposit = {
    ...deposit,
    status: newStatus,
    dates: {
      ...deposit.dates,
      finalizationAt: newFinalizationAt,
      lastActivityAt: Date.now(),
    },
    hashes: newHash,
    error: error ? error : null,
  };

  // Log status change if it actually changed
  if (newStatus !== oldStatus) {
    logStatusChange(updatedDeposit, newStatus, oldStatus);
    createLoggerWithCorrelation({
      depositId: deposit.id,
      chainName: deposit.chainId,
      fromStatus: DepositStatus[oldStatus],
      toStatus: DepositStatus[newStatus],
      operation: 'deposit_finalized',
      fundingTxHash: deposit.fundingTxHash ?? undefined,
      initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
      finalizeTxHash: tx?.hash,
    }).info(`Deposit state change: ${DepositStatus[oldStatus]} → ${DepositStatus[newStatus]}`);
  }

  await DepositStore.update(updatedDeposit);

  if (tx) {
    logDepositFinalized(updatedDeposit);
    // --- End Log ---
  }
  // Note: No specific log if only error was updated
};

/**
 * @name updateToInitializedDeposit
 * @description Updates the status of a deposit to "INITIALIZED" and records the initialization transaction hash.
 * This function takes a deposit object and a transaction object, updates the deposit status to "INITIALIZED",
 * records the initialization timestamp, and stores the initialization transaction hash in the deposit object.
 * The updated deposit object is then written to the JSON storage.
 * @param {Deposit} deposit - The deposit object to be updated.
 * @param {TransactionWithHash} tx - The transaction object containing the initialization transaction hash.
 */
export const updateToInitializedDeposit = async (
  deposit: Deposit,
  tx?: TransactionWithHash,
  error?: string,
) => {
  const oldStatus = deposit.status; // Capture old status before changes
  const newStatus = tx ? DepositStatus.INITIALIZED : deposit.status;
  const newInitializationAt = tx ? Date.now() : deposit.dates.initializationAt;
  const newHash = tx
    ? {
        ...deposit.hashes,
        eth: {
          ...deposit.hashes.eth,
          initializeTxHash: tx?.hash ? tx.hash : null,
        },
      }
    : deposit.hashes;

  const updatedDeposit: Deposit = {
    ...deposit,
    status: newStatus,
    dates: {
      ...deposit.dates,
      initializationAt: newInitializationAt,
      lastActivityAt: Date.now(),
    },
    hashes: newHash,
    error: error ? error : null,
  };

  // Log status change if it actually changed
  if (newStatus !== oldStatus) {
    logStatusChange(updatedDeposit, newStatus, oldStatus);
    createLoggerWithCorrelation({
      depositId: deposit.id,
      chainName: deposit.chainId,
      fromStatus: DepositStatus[oldStatus],
      toStatus: DepositStatus[newStatus],
      operation: 'deposit_initialized',
      fundingTxHash: deposit.fundingTxHash ?? undefined,
      initializeTxHash: tx?.hash,
    }).info(`Deposit state change: ${DepositStatus[oldStatus]} → ${DepositStatus[newStatus]}`);
  }

  await DepositStore.update(updatedDeposit);

  if (tx) {
    logDepositInitialized(updatedDeposit);
    // --- End Log ---
  }
  // Note: No specific log if only error was updated
};

/**
 * @name updateToAwaitingWormholeVAA
 * @description Updates the status of a deposit to `AWAITING_WORMHOLE_VAA` and
 * stores the Wormhole transfer sequence (so we can fetch the VAA later).
 *
 * - Sets deposit status to AWAITING_WORMHOLE_VAA
 * - Records lastActivityAt
 * - Clears error
 * - Updates or creates `wormholeInfo.transferSequence`
 * - Writes the updated deposit object to JSON storage
 *
 * @param deposit The deposit object to update
 * @param transferSequence The Wormhole transfer sequence ID
 * @param bridgingAttempted Whether bridging was already attempted (default: false)
 */
export const updateToAwaitingWormholeVAA = async (
  txHash: string,
  deposit: Deposit,
  transferSequence: string,
  bridgingAttempted: boolean = false,
): Promise<void> => {
  const oldStatus = deposit.status;
  const newStatus = DepositStatus.AWAITING_WORMHOLE_VAA;

  // Update (or create) wormholeInfo
  const newWormholeInfo = {
    ...deposit.wormholeInfo,
    txHash,
    transferSequence,
    bridgingAttempted,
  };

  const updatedDeposit: Deposit = {
    ...deposit,
    status: newStatus,
    wormholeInfo: newWormholeInfo,
    error: null, // clear any previous error
    dates: {
      ...deposit.dates,
      lastActivityAt: Date.now(),
      awaitingWormholeVAAMessageSince: Date.now(),
    },
  };

  // Log status change if it actually changed
  if (newStatus !== oldStatus) {
    logStatusChange(updatedDeposit, newStatus, oldStatus);
    createLoggerWithCorrelation({
      depositId: deposit.id,
      chainName: deposit.chainId,
      fromStatus: DepositStatus[oldStatus],
      toStatus: DepositStatus[newStatus],
      operation: 'deposit_awaiting_wormhole_vaa',
      fundingTxHash: deposit.fundingTxHash ?? undefined,
      initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
      finalizeTxHash: deposit.hashes?.eth?.finalizeTxHash ?? undefined,
      wormholeTxHash: txHash,
      transferSequence,
    }).info(`Deposit state change: ${DepositStatus[oldStatus]} → ${DepositStatus[newStatus]}`);
  }

  // Write to JSON file
  await DepositStore.update(updatedDeposit);

  logDepositAwaitingWormholeVAA(updatedDeposit);
};

const getChainTypeFromId = (chainId: string): 'sui' | 'solana' | 'unknown' => {
  const lowerChainId = chainId.toLowerCase();
  if (lowerChainId.includes('sui')) {
    return 'sui';
  }
  if (lowerChainId.includes('solana')) {
    return 'solana';
  }
  return 'unknown';
};

/**
 * @name updateToBridgedDeposit
 * @description Updates the status of a deposit to `BRIDGED`
 *
 * - Sets deposit status to BRIDGED
 * - Records lastActivityAt
 * - Clears error
 * - Updates or creates `wormholeInfo.transferSequence`
 * - Writes the updated deposit object to JSON storage
 *
 * @param deposit The deposit object to update
 * @param transferSequence The Wormhole transfer sequence ID
 * @param bridgingAttempted Whether bridging was already attempted (default: false)
 */
export const updateToBridgedDeposit = async (
  deposit: Deposit,
  txSignature: string,
): Promise<void> => {
  const oldStatus = deposit.status;
  const newStatus = DepositStatus.BRIDGED;

  let updatedHashes;
  const chainType = getChainTypeFromId(deposit.chainId);

  switch (chainType) {
    case 'sui':
      // Update SUI-specific hash structure
      updatedHashes = {
        ...deposit.hashes,
        sui: {
          ...deposit.hashes?.sui,
          l2BridgeTxHash: txSignature,
        },
      };
      break;
    case 'solana':
      // Update Solana-specific hash structure
      updatedHashes = {
        ...deposit.hashes,
        solana: {
          ...deposit.hashes?.solana,
          bridgeTxHash: txSignature,
        },
      };
      break;
    default:
      logger.warn(
        `[updateToBridgedDeposit] Unknown chainId: ${deposit.chainId}. Defaulting to Solana hash structure for backward compatibility.`,
      );
      // Default to Solana for backward compatibility
      updatedHashes = {
        ...deposit.hashes,
        solana: {
          ...deposit.hashes?.solana,
          bridgeTxHash: txSignature,
        },
      };
      break;
  }

  const updatedDeposit: Deposit = {
    ...deposit,
    status: newStatus,
    wormholeInfo: {
      ...deposit.wormholeInfo,
      bridgingAttempted: true,
    },
    hashes: updatedHashes,
    error: null, // clear any previous error
    dates: {
      ...deposit.dates,
      lastActivityAt: Date.now(),
      bridgedAt: Date.now(),
    },
  };

  // Log status change if it actually changed
  if (newStatus !== oldStatus) {
    logStatusChange(updatedDeposit, newStatus, oldStatus);
    createLoggerWithCorrelation({
      depositId: deposit.id,
      chainName: deposit.chainId,
      fromStatus: DepositStatus[oldStatus],
      toStatus: DepositStatus[newStatus],
      operation: 'deposit_bridged',
      fundingTxHash: deposit.fundingTxHash ?? undefined,
      initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
      finalizeTxHash: deposit.hashes?.eth?.finalizeTxHash ?? undefined,
      wormholeTxHash: deposit.wormholeInfo?.txHash ?? undefined,
      transferSequence: deposit.wormholeInfo?.transferSequence ?? undefined,
      bridgeTxHash: txSignature,
    }).info(`Deposit state change: ${DepositStatus[oldStatus]} → ${DepositStatus[newStatus]}`);
  }

  // Write to JSON file
  await DepositStore.update(updatedDeposit);

  logDepositBridged(updatedDeposit);
};

/**
 * @name updateLastActivity
 * @description Updates the last activity timestamp of a deposit.
 * This function takes a deposit object and updates the last activity timestamp to the current time.
 * The updated deposit object is then written to the JSON storage.
 * @param {Deposit} deposit - The deposit object to be updated.
 */
export const updateLastActivity = async (deposit: Deposit): Promise<Deposit> => {
  const updatedDeposit: Deposit = {
    ...deposit,
    dates: {
      ...deposit.dates,
      lastActivityAt: Date.now(),
    },
  };

  await DepositStore.update(updatedDeposit);
  return updatedDeposit;
};

/**
 * @name createFinalizedDepositFromOnChainData
 * @description Creates a new deposit object for a deposit that was already finalized on-chain but not tracked locally.
 * This happens if the relayer was down when the deposit was requested and finalized.
 * The function uses minimal data fetched from the `OptimisticMintingRequested` event.
 * Many fields will be placeholders as the full original data is not available.
 *
 * @param {string} depositId - The deposit key.
 * @param {string} fundingTxHash - The Bitcoin funding transaction hash.
 * @param {number} fundingOutputIndex - The output index of the funding transaction.
 * @param {string} depositor - The address of the depositor.
 * @param {string} chainId - The chain ID of the deposit.
 *
 * @returns {Deposit} A structured, but partially filled, deposit object.
 */
export const createFinalizedDepositFromOnChainData = (
  depositId: string,
  fundingTxHash: string,
  fundingOutputIndex: number,
  depositor: string,
  chainId: string,
): Deposit => {
  const now = Date.now();
  const deposit: Deposit = {
    id: depositId,
    chainId: chainId,
    fundingTxHash: fundingTxHash,
    outputIndex: fundingOutputIndex,
    hashes: {
      btc: {
        btcTxHash: fundingTxHash,
      },
      eth: {
        initializeTxHash: 'unknown-recovered', // Mark as recovered
        finalizeTxHash: 'unknown-recovered', // Mark as recovered
      },
      solana: {
        bridgeTxHash: null,
      },
    },
    receipt: {
      depositor: depositor,
      // These fields are unknown and set to placeholders
      blindingFactor: '0x',
      walletPublicKeyHash: '0x',
      refundPublicKeyHash: '0x',
      refundLocktime: '0',
      extraData: depositor, // Assume owner is depositor
    },
    L1OutputEvent: {
      // This data is not available, set to placeholders
      fundingTx: {
        version: '0',
        inputVector: '0x',
        outputVector: '0x',
        locktime: '0',
      },
      reveal: {
        blindingFactor: '0x',
        fundingOutputIndex: fundingOutputIndex,
        refundLocktime: '0',
        refundPubKeyHash: '0x',
        vault: '0x',
        walletPubKeyHash: '0x',
      },
      l2DepositOwner: depositor,
      l2Sender: depositor,
    },
    owner: depositor, // Assume owner is depositor
    status: DepositStatus.FINALIZED, // It's already finalized
    dates: {
      createdAt: now,
      initializationAt: now, // Mark as initialized at recovery time
      finalizationAt: now,
      awaitingWormholeVAAMessageSince: null,
      bridgedAt: null,
      lastActivityAt: now,
    },
    wormholeInfo: {
      txHash: null,
      transferSequence: null,
      bridgingAttempted: false,
    },
    error: null,
  };

  logDepositCreated(deposit);
  logStatusChange(deposit, DepositStatus.FINALIZED, DepositStatus.QUEUED); // Log transition
  logDepositFinalized(deposit);
  createLoggerWithCorrelation({
    depositId: deposit.id,
    chainName: chainId,
    fromStatus: 'RECOVERED',
    toStatus: 'FINALIZED',
    operation: 'deposit_recovered_finalized',
    fundingTxHash: fundingTxHash ?? undefined,
  }).info('Deposit state change: RECOVERED → FINALIZED (from on-chain data)');

  return deposit;
};

/**
 * @name createInitializedDepositFromOnChainData
 * @description Creates a new deposit object for a deposit that was initialized on-chain but not tracked locally.
 * This can happen if the relayer was down when the deposit was initiated.
 * The function uses data from the `DepositInitialized` event.
 *
 * @param {string} depositId - The deposit key.
 * @param {string} fundingTxHash - The Bitcoin funding transaction hash.
 * @param {number} fundingOutputIndex - The output index of the funding transaction.
 * @param {string} depositor - The address of the depositor.
 * @param {string} chainId - The chain ID of the deposit.
 * @param {string} initializeTxHash - The hash of the initialization transaction.
 *
 * @returns {Deposit} A structured, but partially filled, deposit object.
 */
export const createInitializedDepositFromOnChainData = (
  depositId: string,
  fundingTxHash: string,
  fundingOutputIndex: number,
  depositor: string,
  chainId: string,
  initializeTxHash: string,
): Deposit => {
  const now = Date.now();
  const deposit: Deposit = {
    id: depositId,
    chainId: chainId,
    fundingTxHash: fundingTxHash,
    outputIndex: fundingOutputIndex,
    hashes: {
      btc: {
        btcTxHash: fundingTxHash,
      },
      eth: {
        initializeTxHash: initializeTxHash,
        finalizeTxHash: null,
      },
      solana: {
        bridgeTxHash: null,
      },
    },
    receipt: {
      depositor: depositor,
      blindingFactor: '0x',
      walletPublicKeyHash: '0x',
      refundPublicKeyHash: '0x',
      refundLocktime: '0',
      extraData: depositor,
    },
    L1OutputEvent: {
      fundingTx: {
        version: '0',
        inputVector: '0x',
        outputVector: '0x',
        locktime: '0',
      },
      reveal: {
        blindingFactor: '0x',
        fundingOutputIndex: fundingOutputIndex,
        refundLocktime: '0',
        refundPubKeyHash: '0x',
        vault: '0x',
        walletPubKeyHash: '0x',
      },
      l2DepositOwner: depositor,
      l2Sender: depositor,
    },
    owner: depositor,
    status: DepositStatus.INITIALIZED,
    dates: {
      createdAt: now,
      initializationAt: now,
      finalizationAt: null,
      awaitingWormholeVAAMessageSince: null,
      bridgedAt: null,
      lastActivityAt: now,
    },
    wormholeInfo: {
      txHash: null,
      transferSequence: null,
      bridgingAttempted: false,
    },
    error: null,
  };

  logDepositCreated(deposit);
  logStatusChange(deposit, DepositStatus.INITIALIZED, DepositStatus.QUEUED);
  createLoggerWithCorrelation({
    depositId: depositId,
    chainName: chainId,
    fromStatus: 'RECOVERED',
    toStatus: 'INITIALIZED',
    operation: 'deposit_recovered_initialized',
    fundingTxHash: fundingTxHash ?? undefined,
    initializeTxHash: initializeTxHash,
  }).info('Deposit state change: RECOVERED → INITIALIZED (from on-chain data)');

  return deposit;
};

/**
 * Creates a simplified, partial deposit object from on-chain event data.
 * This is used to back-fill deposits that are found on-chain but are missing from the local database.
 * The created deposit is in an INITIALIZED state but lacks BTC funding details.
 *
 * @param depositKey The unique key for the deposit.
 * @param depositor The address of the depositor.
 * @param chainId The ID of the chain where the deposit occurred.
 * @param initializeTxHash The transaction hash of the initialization event.
 * @returns A partial Deposit object.
 */
export const createPartialDepositFromOnChainData = (
  depositKey: string,
  depositor: string,
  chainId: string,
  initializeTxHash: string,
): Deposit => {
  const deposit: Deposit = {
    id: depositKey,
    chainId,
    fundingTxHash: null, // This information is not available from the event
    outputIndex: null, // This information is not available from the event
    hashes: {
      btc: {
        btcTxHash: null,
      },
      eth: {
        initializeTxHash: initializeTxHash,
        finalizeTxHash: null,
      },
      solana: {
        bridgeTxHash: null,
      },
    },
    receipt: {
      depositor: depositor,
      blindingFactor: '0x',
      walletPublicKeyHash: '0x',
      refundPublicKeyHash: '0x',
      refundLocktime: '0',
      extraData: depositor, // In this context, the depositor is also the owner
    },
    L1OutputEvent: {
      fundingTx: {
        version: '0',
        inputVector: '0x',
        outputVector: '0x',
        locktime: '0',
      },
      reveal: {
        blindingFactor: '0x',
        fundingOutputIndex: 0, // Not available, set to 0 as a placeholder
        refundLocktime: '0',
        refundPubKeyHash: '0x',
        vault: '0x',
        walletPubKeyHash: '0x',
      },
      l2DepositOwner: depositor,
      l2Sender: depositor,
    },
    owner: depositor,
    status: DepositStatus.INITIALIZED,
    dates: {
      createdAt: Date.now(),
      initializationAt: Date.now(),
      finalizationAt: null,
      awaitingWormholeVAAMessageSince: null,
      bridgedAt: null,
      lastActivityAt: Date.now(),
    },
    wormholeInfo: {
      txHash: null,
      transferSequence: null,
      bridgingAttempted: false,
    },
    error: null,
  };

  createLoggerWithCorrelation({
    depositId: depositKey,
    chainName: chainId,
    fromStatus: 'RECOVERED',
    toStatus: 'INITIALIZED',
    operation: 'deposit_partial_from_onchain',
    initializeTxHash: initializeTxHash,
  }).info('Deposit state change: RECOVERED → INITIALIZED (partial from on-chain data)');

  return deposit;
};
