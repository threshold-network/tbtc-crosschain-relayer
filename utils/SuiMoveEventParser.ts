import type { SuiEvent } from '@mysten/sui/client';
import {
  parseFundingTransaction,
  normalizeInput,
  BitcoinParsingError,
  InvalidRevealFormatError,
  bytesToHex,
} from './BitcoinTransactionParser.js';
import type { FundingTransaction } from '../types/FundingTransaction.type.js';
import type { Reveal } from '../types/Reveal.type.js';
import logger from './Logger.js';

/**
 * Event data structure for SUI Move DepositInitialized events.
 * Corresponds to the Move struct:
 * ```
 * public struct DepositInitialized has copy, drop {
 *     funding_tx: vector<u8>,
 *     deposit_reveal: vector<u8>,
 *     deposit_owner: vector<u8>,
 *     sender: vector<u8>,
 * }
 * ```
 */
export interface DepositInitializedEventData {
  /** Raw Bitcoin funding transaction data as byte vector */
  funding_tx: string | number[];
  /** Bitcoin deposit reveal data as byte vector */
  deposit_reveal: string | number[];
  /** L2 deposit owner address as byte vector */
  deposit_owner: string | number[];
  /** L2 transaction sender address as byte vector */
  sender: string | number[];
}

/**
 * Parsed data from a SUI DepositInitialized event
 */
export interface ParsedDepositInitializedEvent {
  /** Parsed Bitcoin funding transaction */
  fundingTransaction: FundingTransaction;
  /** Parsed Bitcoin reveal data */
  reveal: Reveal;
  /** L2 deposit owner address (hex string) */
  depositOwner: string;
  /** L2 transaction sender address (hex string) */
  sender: string;
}

/**
 * Parses binary data fields from Sui Move events
 * Handles both hex string and number array formats
 * @param field - Binary field from Move event (string or number[])
 * @returns Normalized byte array
 */
export function parseEventBinaryField(field: string | number[]): number[] {
  if (Array.isArray(field)) {
    // Data is already in number array format
    return normalizeInput(field);
  }

  if (typeof field === 'string') {
    // Data is in hex string format, convert to bytes
    return normalizeInput(field);
  }

  throw new BitcoinParsingError(
    'Invalid binary field format in Move event. Expected string or number array.',
  );
}

/**
 * Converts binary address data to SUI hex address format
 * @param addressBytes - Address as byte array
 * @returns Hex string address with 0x prefix
 */
export function convertBinaryToSuiAddress(addressBytes: number[]): string {
  return '0x' + Buffer.from(addressBytes).toString('hex');
}

/**
 * SUI-specific reveal data structure (56 bytes)
 */
const SUI_REVEAL_DATA_LENGTHS = {
  FUNDING_OUTPUT_INDEX: 4,
  BLINDING_FACTOR: 8, // 8 bytes for SUI
  WALLET_PUBKEY_HASH: 20,
  REFUND_PUBKEY_HASH: 20,
  REFUND_LOCKTIME: 4,
} as const;

const SUI_REVEAL_TOTAL_LENGTH = Object.values(SUI_REVEAL_DATA_LENGTHS).reduce(
  (sum, len) => sum + len,
  0,
); // 56 bytes

/**
 * Parses SUI-specific 56-byte reveal data
 * @param bytes - Array of bytes representing the reveal data
 * @returns Parsed reveal object
 */
function parseSuiReveal(bytes: number[]): Reveal {
  if (!Array.isArray(bytes)) {
    throw new InvalidRevealFormatError('Input must be an array of bytes');
  }

  if (bytes.length !== SUI_REVEAL_TOTAL_LENGTH) {
    throw new InvalidRevealFormatError(
      `Invalid SUI reveal data length. Expected ${SUI_REVEAL_TOTAL_LENGTH} bytes, got ${bytes.length} bytes`,
    );
  }

  try {
    const buffer = Buffer.from(bytes);
    let offset = 0;

    logger.debug('Parsing SUI reveal data', {
      totalLength: bytes.length,
      first16Bytes: bytes.slice(0, 16),
      hexPreview: buffer.toString('hex').slice(0, 32) + '...',
    });

    // Read funding output index (4 bytes, BIG-ENDIAN as per sui-event-listener.cjs)
    // NOTE: SUI uses BIG-ENDIAN but L1 expects LITTLE-ENDIAN, so we keep as number
    const fundingOutputIndex = buffer.readUInt32BE(offset);
    logger.debug('Read fundingOutputIndex', {
      bytes: Array.from(buffer.subarray(offset, offset + 4)),
      asBE: fundingOutputIndex,
      asLE: buffer.readUInt32LE(offset),
    });
    offset += SUI_REVEAL_DATA_LENGTHS.FUNDING_OUTPUT_INDEX;

    // Read blinding factor (8 bytes)
    const blindingFactor = bytesToHex(
      Array.from(buffer.subarray(offset, offset + SUI_REVEAL_DATA_LENGTHS.BLINDING_FACTOR)),
    );
    offset += SUI_REVEAL_DATA_LENGTHS.BLINDING_FACTOR;

    // Read wallet public key hash (20 bytes)
    const walletPubKeyHash = bytesToHex(
      Array.from(buffer.subarray(offset, offset + SUI_REVEAL_DATA_LENGTHS.WALLET_PUBKEY_HASH)),
    );
    offset += SUI_REVEAL_DATA_LENGTHS.WALLET_PUBKEY_HASH;

    // Read refund public key hash (20 bytes)
    const refundPubKeyHash = bytesToHex(
      Array.from(buffer.subarray(offset, offset + SUI_REVEAL_DATA_LENGTHS.REFUND_PUBKEY_HASH)),
    );
    offset += SUI_REVEAL_DATA_LENGTHS.REFUND_PUBKEY_HASH;

    // Read refund locktime (4 bytes, BIG-ENDIAN to match fundingOutputIndex)
    // SUI stores this as big-endian bytes, we keep it as-is
    const refundLocktime = '0x' + buffer.subarray(offset, offset + 4).toString('hex');

    // Vault field is not present in SUI's 56-byte format
    // For SUI, we need to use the configured vault address from the chain config
    // This will be set by the handler when creating the deposit
    // For now, we'll use a placeholder that the handler should replace
    const vault = '0x0000000000000000000000000000000000000000000000000000000000000000';

    return {
      fundingOutputIndex,
      blindingFactor,
      walletPubKeyHash,
      refundPubKeyHash,
      refundLocktime,
      vault,
    };
  } catch (error) {
    if (error instanceof BitcoinParsingError) {
      throw error;
    }
    throw new InvalidRevealFormatError('Failed to parse SUI reveal data', error as Error);
  }
}

/**
 * Parses a SUI DepositInitialized event and returns parsed data
 * @param event - SUI event object
 * @param chainName - Name of the chain processing the event (used for logging)
 * @returns Parsed event data or null if parsing fails
 */
export function parseDepositInitializedEvent(
  event: SuiEvent,
  chainName: string,
): ParsedDepositInitializedEvent | null {
  try {
    // Validate event type
    if (!event.type.includes('DepositInitialized')) {
      return null;
    }

    logger.debug('Parsing SUI DepositInitialized event', {
      chainName,
      txDigest: event.id?.txDigest,
      eventType: event.type,
    });

    // Parse event data according to the Move struct
    const eventData = event.parsedJson as DepositInitializedEventData;

    // Validate required fields
    if (
      !eventData.funding_tx ||
      !eventData.deposit_reveal ||
      !eventData.deposit_owner ||
      !eventData.sender
    ) {
      logger.warn('Incomplete SUI deposit event data', {
        chainName,
        txDigest: event.id?.txDigest,
        missingFields: {
          funding_tx: !eventData.funding_tx,
          deposit_reveal: !eventData.deposit_reveal,
          deposit_owner: !eventData.deposit_owner,
          sender: !eventData.sender,
        },
      });
      return null;
    }

    // Parse binary fields from the event data
    const fundingTxBytes = parseEventBinaryField(eventData.funding_tx);
    const revealBytes = parseEventBinaryField(eventData.deposit_reveal);
    const depositOwnerBytes = parseEventBinaryField(eventData.deposit_owner);
    const senderBytes = parseEventBinaryField(eventData.sender);

    if (!fundingTxBytes || !revealBytes || !depositOwnerBytes || !senderBytes) {
      logger.warn('Failed to parse binary fields from SUI event', {
        chainName,
        txDigest: event.id?.txDigest,
        fundingTxValid: !!fundingTxBytes,
        revealValid: !!revealBytes,
        depositOwnerValid: !!depositOwnerBytes,
        senderValid: !!senderBytes,
      });
      return null;
    }

    logger.debug('Parsed binary fields from SUI event', {
      chainName,
      fundingTxLength: fundingTxBytes.length,
      fundingTxFirst8: fundingTxBytes.slice(0, 8),
      revealLength: revealBytes.length,
      revealFirst8: revealBytes.slice(0, 8),
      depositOwnerLength: depositOwnerBytes.length,
      senderLength: senderBytes.length,
    });

    // Parse Bitcoin transaction and reveal data
    const fundingTransaction = parseFundingTransaction(fundingTxBytes);
    const reveal = parseSuiReveal(revealBytes); // Use SUI-specific parser

    logger.debug('Parsed Bitcoin transaction and reveal', {
      chainName,
      fundingTxVersion: fundingTransaction.version,
      fundingTxInputVector: fundingTransaction.inputVector?.slice(0, 16) + '...',
      fundingTxOutputVector: fundingTransaction.outputVector?.slice(0, 16) + '...',
      revealFundingOutputIndex: reveal.fundingOutputIndex,
      revealBlindingFactor: reveal.blindingFactor,
      revealWalletPubKeyHash: reveal.walletPubKeyHash,
    });

    // Convert SUI addresses to hex format
    const depositOwner = convertBinaryToSuiAddress(depositOwnerBytes);
    const sender = convertBinaryToSuiAddress(senderBytes);

    logger.debug('Converted SUI addresses', {
      chainName,
      depositOwner,
      sender,
    });

    return {
      fundingTransaction,
      reveal,
      depositOwner,
      sender,
    };
  } catch (error: any) {
    logger.warn(`Failed to parse Bitcoin data from SUI event for ${chainName}:`, {
      error: error.message,
      txDigest: event.id?.txDigest,
      eventType: event.type,
    });
    return null;
  }
}
