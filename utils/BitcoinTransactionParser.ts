import * as bitcoin from 'bitcoinjs-lib';
import type { FundingTransaction } from '../types/FundingTransaction.type.js';
import type { Reveal } from '../types/Reveal.type.js';
import logger from './Logger.js';

/**
 * Error classes for Bitcoin transaction parsing
 */
export class BitcoinParsingError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'BitcoinParsingError';
  }
}

export class InvalidTransactionFormatError extends BitcoinParsingError {
  constructor(message: string, cause?: Error) {
    super(`Invalid transaction format: ${message}`, cause);
    this.name = 'InvalidTransactionFormatError';
  }
}

export class InvalidRevealFormatError extends BitcoinParsingError {
  constructor(message: string, cause?: Error) {
    super(`Invalid reveal format: ${message}`, cause);
    this.name = 'InvalidRevealFormatError';
  }
}

/**
 * Utility functions for byte array handling
 */

/**
 * Converts a byte array to a hex string
 * @param bytes - Array of bytes (numbers 0-255)
 * @returns Hex string with '0x' prefix
 */
export function bytesToHex(bytes: number[]): string {
  if (!Array.isArray(bytes)) {
    throw new BitcoinParsingError('Input must be an array of bytes');
  }

  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new BitcoinParsingError('All bytes must be integers between 0 and 255');
  }

  return '0x' + bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts a byte array to a UTF-8 string
 * @param bytes - Array of bytes (numbers 0-255)
 * @returns UTF-8 decoded string
 */
export function bytesToString(bytes: number[]): string {
  if (!Array.isArray(bytes)) {
    throw new BitcoinParsingError('Input must be an array of bytes');
  }

  try {
    const uint8Array = new Uint8Array(bytes);
    return new TextDecoder('utf-8').decode(uint8Array);
  } catch (error) {
    throw new BitcoinParsingError('Failed to decode bytes as UTF-8 string', error as Error);
  }
}

/**
 * Converts hex string to byte array
 * @param hex - Hex string (with or without '0x' prefix)
 * @returns Array of bytes
 */
export function hexToBytes(hex: string): number[] {
  if (typeof hex !== 'string') {
    throw new BitcoinParsingError('Input must be a hex string');
  }

  // Remove '0x' prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

  // Validate hex string
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new BitcoinParsingError('Invalid hex string');
  }

  // Ensure even length
  const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;

  const bytes: number[] = [];
  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes.push(parseInt(paddedHex.substr(i, 2), 16));
  }

  return bytes;
}

/**
 * Converts a 32-bit integer to little-endian hex string
 * @param value - Integer value to convert
 * @returns Little-endian hex string
 */
function toLittleEndianHex(value: number): string {
  return Buffer.from([
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ]).toString('hex');
}

/**
 * Reverses a hex string for Bitcoin hash display format
 * @param hex - Hex string to reverse
 * @returns Reversed hex string
 */
function reverseHexString(hex: string): string {
  return hex.match(/.{2}/g)?.reverse().join('') || hex;
}

/**
 * Creates input vector hex string from parsed inputs
 * @param inputs - Array of parsed input objects
 * @returns Concatenated hex string of all inputs
 */
function createInputVectorHex(
  inputs: Array<{
    prevTxId: string;
    outputIndex: number;
    scriptSig: string;
    sequence: number;
  }>,
): string {
  return inputs
    .map((input) => {
      const outputIndexHex = toLittleEndianHex(input.outputIndex);
      const sequenceHex = toLittleEndianHex(input.sequence);
      const scriptSigLength = (input.scriptSig.length / 2).toString(16).padStart(2, '0');

      return (
        reverseHexString(input.prevTxId) +
        outputIndexHex +
        scriptSigLength +
        input.scriptSig +
        sequenceHex
      );
    })
    .join('');
}

/**
 * Creates output vector hex string from parsed outputs
 * @param outputs - Array of parsed output objects
 * @returns Concatenated hex string of all outputs
 */
function createOutputVectorHex(
  outputs: Array<{
    value: bigint;
    scriptPubKey: string;
  }>,
): string {
  return outputs
    .map((output) => {
      const valueBytes = Buffer.allocUnsafe(8);
      valueBytes.writeBigUInt64LE(output.value, 0);
      const scriptPubKeyLength = (output.scriptPubKey.length / 2).toString(16).padStart(2, '0');

      return valueBytes.toString('hex') + scriptPubKeyLength + output.scriptPubKey;
    })
    .join('');
}

/**
 * Safely reads a variable-length integer from a buffer
 * @param buffer - Buffer to read from
 * @param offset - Offset to start reading
 * @returns Object with value and new offset
 */
function readVarInt(buffer: Buffer, offset: number): { value: number; newOffset: number } {
  if (offset >= buffer.length) {
    throw new InvalidTransactionFormatError('Buffer too short to read varint');
  }

  const firstByte = buffer[offset];

  if (firstByte < 0xfd) {
    return { value: firstByte, newOffset: offset + 1 };
  } else if (firstByte === 0xfd) {
    if (offset + 3 > buffer.length) {
      throw new InvalidTransactionFormatError('Buffer too short for 2-byte varint');
    }
    return { value: buffer.readUInt16LE(offset + 1), newOffset: offset + 3 };
  } else if (firstByte === 0xfe) {
    if (offset + 5 > buffer.length) {
      throw new InvalidTransactionFormatError('Buffer too short for 4-byte varint');
    }
    return { value: buffer.readUInt32LE(offset + 1), newOffset: offset + 5 };
  } else {
    // 0xff - 8 byte varint
    if (offset + 9 > buffer.length) {
      throw new InvalidTransactionFormatError('Buffer too short for 8-byte varint');
    }
    // For 8-byte varints, we'll read as a BigInt but convert to number
    // This could overflow for very large values, but that's unlikely in practice
    const low = buffer.readUInt32LE(offset + 1);
    const high = buffer.readUInt32LE(offset + 5);
    const value = high * 0x100000000 + low;
    return { value, newOffset: offset + 9 };
  }
}

/**
 * Parses binary Bitcoin transaction data from Sui Move events
 * @param bytes - Array of bytes representing the Bitcoin transaction
 * @returns Parsed funding transaction object
 */
export function parseFundingTransaction(bytes: number[]): FundingTransaction {
  if (!Array.isArray(bytes)) {
    throw new InvalidTransactionFormatError('Input must be an array of bytes');
  }

  if (bytes.length < 10) {
    throw new InvalidTransactionFormatError(
      'Transaction data too short (minimum 10 bytes required)',
    );
  }

  try {
    const buffer = Buffer.from(bytes);
    let offset = 0;

    logger.debug('Parsing Bitcoin transaction', {
      totalLength: bytes.length,
      first16Bytes: bytes.slice(0, 16),
      hexPreview: buffer.toString('hex').slice(0, 32) + '...',
    });

    // Read version (4 bytes, little-endian)
    if (offset + 4 > buffer.length) {
      throw new InvalidTransactionFormatError('Buffer too short to read version');
    }
    const version = buffer.readUInt32LE(offset);
    offset += 4;

    // Read number of inputs (varint)
    const inputCountResult = readVarInt(buffer, offset);
    const inputCount = inputCountResult.value;
    offset = inputCountResult.newOffset;

    if (inputCount > 10000) {
      throw new InvalidTransactionFormatError(`Too many inputs: ${inputCount}`);
    }

    // Parse inputs
    const inputs: Array<{
      prevTxId: string;
      outputIndex: number;
      scriptSig: string;
      sequence: number;
    }> = [];

    for (let i = 0; i < inputCount; i++) {
      // Previous transaction hash (32 bytes)
      if (offset + 32 > buffer.length) {
        throw new InvalidTransactionFormatError(`Buffer too short to read input ${i} prevTxId`);
      }
      const prevTxId = buffer
        .subarray(offset, offset + 32)
        .reverse()
        .toString('hex');
      offset += 32;

      // Output index (4 bytes)
      if (offset + 4 > buffer.length) {
        throw new InvalidTransactionFormatError(`Buffer too short to read input ${i} outputIndex`);
      }
      const outputIndex = buffer.readUInt32LE(offset);
      offset += 4;

      // Script signature length (varint)
      const scriptSigLengthResult = readVarInt(buffer, offset);
      const scriptSigLength = scriptSigLengthResult.value;
      offset = scriptSigLengthResult.newOffset;

      // Script signature
      if (offset + scriptSigLength > buffer.length) {
        throw new InvalidTransactionFormatError(`Buffer too short to read input ${i} scriptSig`);
      }
      const scriptSig = buffer.subarray(offset, offset + scriptSigLength).toString('hex');
      offset += scriptSigLength;

      // Sequence (4 bytes)
      if (offset + 4 > buffer.length) {
        throw new InvalidTransactionFormatError(`Buffer too short to read input ${i} sequence`);
      }
      const sequence = buffer.readUInt32LE(offset);
      offset += 4;

      inputs.push({ prevTxId, outputIndex, scriptSig, sequence });
    }

    // Read number of outputs (varint)
    const outputCountResult = readVarInt(buffer, offset);
    const outputCount = outputCountResult.value;
    offset = outputCountResult.newOffset;

    if (outputCount > 10000) {
      throw new InvalidTransactionFormatError(`Too many outputs: ${outputCount}`);
    }

    // Parse outputs
    const outputs: Array<{
      value: bigint;
      scriptPubKey: string;
    }> = [];

    for (let i = 0; i < outputCount; i++) {
      // Value (8 bytes, little-endian)
      if (offset + 8 > buffer.length) {
        throw new InvalidTransactionFormatError(`Buffer too short to read output ${i} value`);
      }
      const valueLow = buffer.readUInt32LE(offset);
      const valueHigh = buffer.readUInt32LE(offset + 4);
      const value = BigInt(valueHigh) * BigInt(0x100000000) + BigInt(valueLow);
      offset += 8;

      // Script public key length (varint)
      const scriptPubKeyLengthResult = readVarInt(buffer, offset);
      const scriptPubKeyLength = scriptPubKeyLengthResult.value;
      offset = scriptPubKeyLengthResult.newOffset;

      // Script public key
      if (offset + scriptPubKeyLength > buffer.length) {
        throw new InvalidTransactionFormatError(
          `Buffer too short to read output ${i} scriptPubKey`,
        );
      }
      const scriptPubKey = buffer.subarray(offset, offset + scriptPubKeyLength).toString('hex');
      offset += scriptPubKeyLength;

      outputs.push({ value, scriptPubKey });
    }

    // Read locktime (4 bytes)
    if (offset + 4 > buffer.length) {
      throw new InvalidTransactionFormatError('Buffer too short to read locktime');
    }
    const locktime = buffer.readUInt32LE(offset);
    offset += 4;

    // Build transaction components using helper functions
    const inputVectorHex = createInputVectorHex(inputs);
    const outputVectorHex = createOutputVectorHex(outputs);
    const inputCountHex = inputCount.toString(16).padStart(2, '0');
    const outputCountHex = outputCount.toString(16).padStart(2, '0');

    const result = {
      version: '0x' + toLittleEndianHex(version),
      inputVector: '0x' + `${inputCountHex}${inputVectorHex}`,
      outputVector: '0x' + `${outputCountHex}${outputVectorHex}`,
      locktime: '0x' + toLittleEndianHex(locktime),
    };

    logger.debug('Parsed Bitcoin transaction result', {
      version: result.version,
      inputCount: inputCount,
      outputCount: outputCount,
      inputVectorLen: result.inputVector.length,
      outputVectorLen: result.outputVector.length,
      locktime: result.locktime,
    });

    return result;
  } catch (error) {
    if (error instanceof BitcoinParsingError) {
      throw error;
    }
    throw new InvalidTransactionFormatError('Failed to parse Bitcoin transaction', error as Error);
  }
}

/**
 * Constants for reveal data structure
 */
const REVEAL_DATA_LENGTHS = {
  FUNDING_OUTPUT_INDEX: 4,
  BLINDING_FACTOR: 32,
  WALLET_PUBKEY_HASH: 20,
  REFUND_PUBKEY_HASH: 20,
  REFUND_LOCKTIME: 4,
  VAULT: 32,
} as const;

const REVEAL_TOTAL_LENGTH = Object.values(REVEAL_DATA_LENGTHS).reduce((sum, len) => sum + len, 0);

/**
 * Extracts a hex string from buffer with 0x prefix
 * @param buffer - Buffer to read from
 * @param offset - Starting offset
 * @param length - Number of bytes to read
 * @returns Hex string with 0x prefix
 */
function extractHexFromBuffer(buffer: Buffer, offset: number, length: number): string {
  return '0x' + buffer.subarray(offset, offset + length).toString('hex');
}

/**
 * Parses binary reveal data from Sui Move events
 * @param bytes - Array of bytes representing the reveal data
 * @returns Parsed reveal object
 */
export function parseReveal(bytes: number[]): Reveal {
  if (!Array.isArray(bytes)) {
    throw new InvalidRevealFormatError('Input must be an array of bytes');
  }

  if (bytes.length !== REVEAL_TOTAL_LENGTH) {
    throw new InvalidRevealFormatError(
      `Invalid reveal data length. Expected ${REVEAL_TOTAL_LENGTH} bytes, got ${bytes.length} bytes`,
    );
  }

  try {
    const buffer = Buffer.from(bytes);
    let offset = 0;

    // Read funding output index (4 bytes, little-endian)
    const fundingOutputIndex = buffer.readUInt32LE(offset);
    offset += REVEAL_DATA_LENGTHS.FUNDING_OUTPUT_INDEX;

    // Read blinding factor (32 bytes)
    const blindingFactor = extractHexFromBuffer(
      buffer,
      offset,
      REVEAL_DATA_LENGTHS.BLINDING_FACTOR,
    );
    offset += REVEAL_DATA_LENGTHS.BLINDING_FACTOR;

    // Read wallet public key hash (20 bytes)
    const walletPubKeyHash = extractHexFromBuffer(
      buffer,
      offset,
      REVEAL_DATA_LENGTHS.WALLET_PUBKEY_HASH,
    );
    offset += REVEAL_DATA_LENGTHS.WALLET_PUBKEY_HASH;

    // Read refund public key hash (20 bytes)
    const refundPubKeyHash = extractHexFromBuffer(
      buffer,
      offset,
      REVEAL_DATA_LENGTHS.REFUND_PUBKEY_HASH,
    );
    offset += REVEAL_DATA_LENGTHS.REFUND_PUBKEY_HASH;

    // Read refund locktime (4 bytes, little-endian)
    const refundLocktime = buffer.readUInt32LE(offset).toString();
    offset += REVEAL_DATA_LENGTHS.REFUND_LOCKTIME;

    // Read vault (32 bytes)
    const vault = extractHexFromBuffer(buffer, offset, REVEAL_DATA_LENGTHS.VAULT);

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
    throw new InvalidRevealFormatError('Failed to parse reveal data', error as Error);
  }
}

/**
 * Validates that input data can be processed by parsing functions
 * Supports both number arrays (from Sui Move events) and hex strings
 * @param input - Input data to validate
 * @returns Normalized byte array
 */
export function normalizeInput(input: number[] | string | Buffer): number[] {
  if (Array.isArray(input)) {
    // Validate array elements
    if (input.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new BitcoinParsingError('Array must contain only integers between 0 and 255');
    }
    return input;
  }

  if (typeof input === 'string') {
    // Convert hex string to byte array
    return hexToBytes(input);
  }

  if (Buffer.isBuffer(input)) {
    // Convert Buffer to byte array
    return Array.from(input);
  }

  throw new BitcoinParsingError('Input must be a number array, hex string, or Buffer');
}

/**
 * Utility function to verify Bitcoin transaction hash
 * @param transactionBytes - Raw transaction bytes
 * @returns SHA256 double hash of the transaction
 */
export function calculateTransactionHash(transactionBytes: number[]): string {
  try {
    const buffer = Buffer.from(transactionBytes);
    const tx = bitcoin.Transaction.fromBuffer(buffer);
    return tx.getId();
  } catch (error) {
    throw new BitcoinParsingError('Failed to calculate transaction hash', error as Error);
  }
}

/**
 * Validates Bitcoin transaction structure using bitcoinjs-lib
 * @param transactionBytes - Raw transaction bytes
 * @returns True if valid, throws error if invalid
 */
export function validateBitcoinTransaction(transactionBytes: number[]): boolean {
  try {
    const buffer = Buffer.from(transactionBytes);
    const tx = bitcoin.Transaction.fromBuffer(buffer);

    // Basic validation checks
    if (tx.ins.length === 0) {
      throw new InvalidTransactionFormatError('Transaction must have at least one input');
    }

    if (tx.outs.length === 0) {
      throw new InvalidTransactionFormatError('Transaction must have at least one output');
    }

    return true;
  } catch (error) {
    if (error instanceof BitcoinParsingError) {
      throw error;
    }
    throw new InvalidTransactionFormatError('Invalid Bitcoin transaction format', error as Error);
  }
}
