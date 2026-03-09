import { createHash } from 'crypto';
import type { FundingTransaction } from '../types/FundingTransaction.type.js';
import logger from './Logger.js';

/**
 * Converts a hexadecimal string to a Buffer.
 *
 * @param {string} hex - The hexadecimal string to convert.
 * @returns {Buffer} The resulting buffer.
 */
function hexToBuffer(hex: string | undefined | null): Buffer {
  if (!hex || hex === '0x') {
    return Buffer.alloc(0);
  }

  return Buffer.from(hex.slice(2), 'hex');
}

/**
 * Serializes a FundingTransaction object into a single Buffer.
 *
 * @param {FundingTransaction} fundingTx - The transaction to serialize.
 * @returns {Buffer} The serialized transaction as a buffer.
 */
function serializeTransaction(fundingTx: FundingTransaction): Buffer {
  const { version, inputVector, outputVector, locktime } = fundingTx;

  // Convert hex strings to buffers
  const versionBuffer = hexToBuffer(version);
  const inputVectorBuffer = hexToBuffer(inputVector);
  const outputVectorBuffer = hexToBuffer(outputVector);
  const locktimeBuffer = hexToBuffer(locktime);

  // Concatenate all buffers
  const serializedTx = Buffer.concat([
    versionBuffer,
    inputVectorBuffer,
    outputVectorBuffer,
    locktimeBuffer,
  ]);

  return serializedTx;
}

/**
 * Computes the double SHA-256 hash of a buffer.
 *
 * @param {Buffer} buffer - The buffer to hash.
 * @returns {Buffer} The resulting double SHA-256 hash.
 */
function doubleSha256(buffer: Buffer): Buffer {
  const hash1 = createHash('sha256').update(buffer).digest();
  return createHash('sha256').update(hash1).digest();
}

/**
 * Computes the reversed double SHA-256 hash of a serialized transaction and returns it as a hexadecimal string.
 *
 * @param {FundingTransaction} fundingTx - The transaction to hash.
 * @returns {string} The resulting hash as a hexadecimal string.
 */
export function getTransactionHash(fundingTx: FundingTransaction): string {
  const serializedTx = serializeTransaction(fundingTx);
  const hash = doubleSha256(serializedTx);
  const reversedHash = hash.reverse().toString('hex');

  logger.debug('getTransactionHash calculation', {
    inputVersion: fundingTx.version,
    inputVectorLen: fundingTx.inputVector?.length,
    outputVectorLen: fundingTx.outputVector?.length,
    serializedLength: serializedTx.length,
    serializedHex: serializedTx.toString('hex').slice(0, 32) + '...',
    hashBeforeReverse: Buffer.from(hash).reverse().toString('hex'), // Show original hash
    hashAfterReverse: reversedHash,
  });

  return reversedHash;
}

/**
 * Computes the double SHA-256 hash of a serialized transaction and returns it as a hexadecimal string.
 *
 * @param {FundingTransaction} fundingTx - The transaction to hash.
 * @returns {string} The resulting hash as a hexadecimal string.
 */
export function getFundingTxHash(fundingTx: FundingTransaction): string {
  const serializedTx = serializeTransaction(fundingTx);
  const hash = doubleSha256(serializedTx);
  return '0x' + hash.toString('hex');
}
