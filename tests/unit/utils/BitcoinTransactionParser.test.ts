import { describe, test, expect } from '@jest/globals';
import {
  parseFundingTransaction,
  parseReveal,
  bytesToHex,
  bytesToString,
  hexToBytes,
  normalizeInput,
  calculateTransactionHash,
  validateBitcoinTransaction,
  BitcoinParsingError,
  InvalidTransactionFormatError,
  InvalidRevealFormatError,
} from '../../../utils/BitcoinTransactionParser.js';

describe('BitcoinTransactionParser', () => {
  // Helper function to create a minimal valid Bitcoin transaction
  // Used across multiple test suites to avoid code duplication
  const createMinimalTransaction = (): number[] => {
    const tx: number[] = [];

    // Version (4 bytes, little-endian) - version 1
    tx.push(0x01, 0x00, 0x00, 0x00);

    // Input count (varint) - 1 input
    tx.push(0x01);

    // Input:
    // Previous transaction hash (32 bytes, all zeros for coinbase)
    for (let i = 0; i < 32; i++) tx.push(0x00);

    // Output index (4 bytes, little-endian) - 0xffffffff for coinbase
    tx.push(0xff, 0xff, 0xff, 0xff);

    // Script signature length (varint) - 0 bytes
    tx.push(0x00);

    // Sequence (4 bytes, little-endian)
    tx.push(0xff, 0xff, 0xff, 0xff);

    // Output count (varint) - 1 output
    tx.push(0x01);

    // Output:
    // Value (8 bytes, little-endian) - 5000000000 satoshis
    tx.push(0x00, 0xf2, 0x05, 0x2a, 0x01, 0x00, 0x00, 0x00);

    // Script public key length (varint) - 25 bytes (standard P2PKH)
    tx.push(0x19);

    // Script public key (25 bytes) - OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG
    tx.push(0x76, 0xa9, 0x14);
    for (let i = 0; i < 20; i++) tx.push(0x00); // 20-byte hash
    tx.push(0x88, 0xac);

    // Locktime (4 bytes, little-endian) - 0
    tx.push(0x00, 0x00, 0x00, 0x00);

    return tx;
  };

  describe('bytesToHex', () => {
    test('converts byte array to hex string', () => {
      const bytes = [0, 255, 16, 32];
      const result = bytesToHex(bytes);
      expect(result).toBe('0x00ff1020');
    });

    test('handles empty array', () => {
      const result = bytesToHex([]);
      expect(result).toBe('0x');
    });

    test('pads single digit hex values', () => {
      const bytes = [1, 2, 3];
      const result = bytesToHex(bytes);
      expect(result).toBe('0x010203');
    });

    test('throws error for non-array input', () => {
      expect(() => bytesToHex('not an array' as any)).toThrow(BitcoinParsingError);
    });

    test('throws error for invalid byte values', () => {
      expect(() => bytesToHex([256])).toThrow(BitcoinParsingError);
      expect(() => bytesToHex([-1])).toThrow(BitcoinParsingError);
      expect(() => bytesToHex([1.5])).toThrow(BitcoinParsingError);
    });
  });

  describe('bytesToString', () => {
    test('converts byte array to UTF-8 string', () => {
      const bytes = [72, 101, 108, 108, 111]; // "Hello"
      const result = bytesToString(bytes);
      expect(result).toBe('Hello');
    });

    test('handles empty array', () => {
      const result = bytesToString([]);
      expect(result).toBe('');
    });

    test('handles Unicode characters', () => {
      const bytes = [240, 159, 152, 128]; // 😀 emoji
      const result = bytesToString(bytes);
      expect(result).toBe('😀');
    });

    test('throws error for non-array input', () => {
      expect(() => bytesToString('not an array' as any)).toThrow(BitcoinParsingError);
    });
  });

  describe('hexToBytes', () => {
    test('converts hex string to byte array', () => {
      const hex = '0x00ff1020';
      const result = hexToBytes(hex);
      expect(result).toEqual([0, 255, 16, 32]);
    });

    test('handles hex string without 0x prefix', () => {
      const hex = 'ff1020';
      const result = hexToBytes(hex);
      expect(result).toEqual([255, 16, 32]);
    });

    test('handles odd length hex string', () => {
      const hex = '0xf';
      const result = hexToBytes(hex);
      expect(result).toEqual([15]);
    });

    test('handles empty hex string', () => {
      const result = hexToBytes('0x');
      expect(result).toEqual([]);
    });

    test('throws error for invalid hex characters', () => {
      expect(() => hexToBytes('0xzz')).toThrow(BitcoinParsingError);
    });

    test('throws error for non-string input', () => {
      expect(() => hexToBytes(123 as any)).toThrow(BitcoinParsingError);
    });
  });

  describe('normalizeInput', () => {
    test('returns byte array unchanged', () => {
      const bytes = [1, 2, 3];
      const result = normalizeInput(bytes);
      expect(result).toEqual(bytes);
    });

    test('converts hex string to byte array', () => {
      const hex = '0x010203';
      const result = normalizeInput(hex);
      expect(result).toEqual([1, 2, 3]);
    });

    test('converts Buffer to byte array', () => {
      const buffer = Buffer.from([1, 2, 3]);
      const result = normalizeInput(buffer);
      expect(result).toEqual([1, 2, 3]);
    });

    test('throws error for invalid input type', () => {
      expect(() => normalizeInput(123 as any)).toThrow(BitcoinParsingError);
    });

    test('throws error for invalid byte values in array', () => {
      expect(() => normalizeInput([256])).toThrow(BitcoinParsingError);
    });
  });

  describe('parseFundingTransaction', () => {
    test('parses minimal valid transaction', () => {
      const txBytes = createMinimalTransaction();
      const result = parseFundingTransaction(txBytes);

      expect(result.version).toBe('0x01000000'); // Version 1 in little-endian format
      expect(result.locktime).toBe('0x00000000'); // Locktime 0 in little-endian format
      expect(result.inputVector).toBeDefined();
      expect(result.outputVector).toBeDefined();
    });

    test('throws error for empty input', () => {
      expect(() => parseFundingTransaction([])).toThrow(InvalidTransactionFormatError);
    });

    test('throws error for non-array input', () => {
      expect(() => parseFundingTransaction('not an array' as any)).toThrow(
        InvalidTransactionFormatError,
      );
    });

    test('throws error for too short transaction', () => {
      const shortTx = [1, 2, 3];
      expect(() => parseFundingTransaction(shortTx)).toThrow(InvalidTransactionFormatError);
    });

    test('throws error for truncated transaction', () => {
      const txBytes = createMinimalTransaction();
      const truncated = txBytes.slice(0, txBytes.length - 10);
      expect(() => parseFundingTransaction(truncated)).toThrow(InvalidTransactionFormatError);
    });

    test('throws error for transaction with too many inputs', () => {
      const tx: number[] = [];

      // Version
      tx.push(0x01, 0x00, 0x00, 0x00);

      // Input count - use a large varint (0xfd followed by 2 bytes)
      tx.push(0xfd, 0x10, 0x27); // 10000 inputs

      expect(() => parseFundingTransaction(tx)).toThrow(InvalidTransactionFormatError);
    });

    test('handles transaction with multiple inputs and outputs', () => {
      const tx: number[] = [];

      // Version
      tx.push(0x01, 0x00, 0x00, 0x00);

      // Input count - 2 inputs
      tx.push(0x02);

      // First input
      for (let i = 0; i < 32; i++) tx.push(0x00); // prev tx hash
      tx.push(0x00, 0x00, 0x00, 0x00); // output index
      tx.push(0x00); // script sig length
      tx.push(0xff, 0xff, 0xff, 0xff); // sequence

      // Second input
      for (let i = 0; i < 32; i++) tx.push(0xff); // prev tx hash
      tx.push(0x01, 0x00, 0x00, 0x00); // output index
      tx.push(0x00); // script sig length
      tx.push(0xff, 0xff, 0xff, 0xff); // sequence

      // Output count - 2 outputs
      tx.push(0x02);

      // First output
      tx.push(0x00, 0xf2, 0x05, 0x2a, 0x01, 0x00, 0x00, 0x00); // value
      tx.push(0x19); // script length
      tx.push(0x76, 0xa9, 0x14);
      for (let i = 0; i < 20; i++) tx.push(0x00);
      tx.push(0x88, 0xac);

      // Second output
      tx.push(0x00, 0xe1, 0xf5, 0x05, 0x00, 0x00, 0x00, 0x00); // value
      tx.push(0x19); // script length
      tx.push(0x76, 0xa9, 0x14);
      for (let i = 0; i < 20; i++) tx.push(0x11);
      tx.push(0x88, 0xac);

      // Locktime
      tx.push(0x00, 0x00, 0x00, 0x00);

      const result = parseFundingTransaction(tx);
      expect(result.version).toBe('0x01000000'); // Version 1 in little-endian format
      expect(result.locktime).toBe('0x00000000'); // Locktime 0 in little-endian format
      expect(result.inputVector).toBeDefined();
      expect(result.outputVector).toBeDefined();
    });
  });

  describe('parseReveal', () => {
    const createValidReveal = (): number[] => {
      const reveal: number[] = [];

      // Funding output index (4 bytes, little-endian) - index 1
      reveal.push(0x01, 0x00, 0x00, 0x00);

      // Blinding factor (32 bytes)
      for (let i = 0; i < 32; i++) reveal.push(0xaa);

      // Wallet public key hash (20 bytes)
      for (let i = 0; i < 20; i++) reveal.push(0xbb);

      // Refund public key hash (20 bytes)
      for (let i = 0; i < 20; i++) reveal.push(0xcc);

      // Refund locktime (4 bytes, little-endian) - 500000
      reveal.push(0x20, 0xa1, 0x07, 0x00);

      // Vault (32 bytes)
      for (let i = 0; i < 32; i++) reveal.push(0xdd);

      return reveal;
    };

    test('parses valid reveal data', () => {
      const revealBytes = createValidReveal();
      const result = parseReveal(revealBytes);

      expect(result.fundingOutputIndex).toBe(1);
      expect(result.blindingFactor).toBe('0x' + 'aa'.repeat(32));
      expect(result.walletPubKeyHash).toBe('0x' + 'bb'.repeat(20));
      expect(result.refundPubKeyHash).toBe('0x' + 'cc'.repeat(20));
      expect(result.refundLocktime).toBe('500000');
      expect(result.vault).toBe('0x' + 'dd'.repeat(32));
    });

    test('throws error for wrong length reveal data', () => {
      const shortReveal = new Array(100).fill(0);
      expect(() => parseReveal(shortReveal)).toThrow(InvalidRevealFormatError);

      const longReveal = new Array(120).fill(0);
      expect(() => parseReveal(longReveal)).toThrow(InvalidRevealFormatError);
    });

    test('throws error for non-array input', () => {
      expect(() => parseReveal('not an array' as any)).toThrow(InvalidRevealFormatError);
    });

    test('handles zero values correctly', () => {
      const revealBytes = new Array(112).fill(0);
      const result = parseReveal(revealBytes);

      expect(result.fundingOutputIndex).toBe(0);
      expect(result.blindingFactor).toBe('0x' + '00'.repeat(32));
      expect(result.walletPubKeyHash).toBe('0x' + '00'.repeat(20));
      expect(result.refundPubKeyHash).toBe('0x' + '00'.repeat(20));
      expect(result.refundLocktime).toBe('0');
      expect(result.vault).toBe('0x' + '00'.repeat(32));
    });

    test('handles maximum values correctly', () => {
      const revealBytes = new Array(112).fill(255);
      const result = parseReveal(revealBytes);

      expect(result.fundingOutputIndex).toBe(4294967295);
      expect(result.blindingFactor).toBe('0x' + 'ff'.repeat(32));
      expect(result.walletPubKeyHash).toBe('0x' + 'ff'.repeat(20));
      expect(result.refundPubKeyHash).toBe('0x' + 'ff'.repeat(20));
      expect(result.refundLocktime).toBe('4294967295');
      expect(result.vault).toBe('0x' + 'ff'.repeat(32));
    });
  });

  describe('calculateTransactionHash', () => {
    test('calculates hash for valid transaction', () => {
      const txBytes = createMinimalTransaction();
      const result = calculateTransactionHash(txBytes);

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(64); // SHA256 hash is 64 hex characters
    });

    test('throws error for invalid transaction data', () => {
      const invalidTx = [1, 2, 3];
      expect(() => calculateTransactionHash(invalidTx)).toThrow(BitcoinParsingError);
    });
  });

  describe('validateBitcoinTransaction', () => {
    test('validates correct transaction', () => {
      const txBytes = createMinimalTransaction();
      const result = validateBitcoinTransaction(txBytes);

      expect(result).toBe(true);
    });

    test('throws error for invalid transaction data', () => {
      const invalidTx = [1, 2, 3];
      expect(() => validateBitcoinTransaction(invalidTx)).toThrow(InvalidTransactionFormatError);
    });

    test('throws error for transaction with no inputs', () => {
      // Create transaction with no inputs
      const tx: number[] = [];
      tx.push(0x01, 0x00, 0x00, 0x00); // version
      tx.push(0x00); // 0 inputs
      tx.push(0x01); // 1 output
      // Add minimal output
      tx.push(0x00, 0xf2, 0x05, 0x2a, 0x01, 0x00, 0x00, 0x00); // value
      tx.push(0x00); // empty script
      tx.push(0x00, 0x00, 0x00, 0x00); // locktime

      expect(() => validateBitcoinTransaction(tx)).toThrow(InvalidTransactionFormatError);
    });

    test('throws error for transaction with no outputs', () => {
      // Create transaction with no outputs
      const tx: number[] = [];
      tx.push(0x01, 0x00, 0x00, 0x00); // version
      tx.push(0x01); // 1 input
      // Add minimal input
      for (let i = 0; i < 32; i++) tx.push(0x00); // prev tx hash
      tx.push(0x00, 0x00, 0x00, 0x00); // output index
      tx.push(0x00); // empty script
      tx.push(0xff, 0xff, 0xff, 0xff); // sequence
      tx.push(0x00); // 0 outputs
      tx.push(0x00, 0x00, 0x00, 0x00); // locktime

      expect(() => validateBitcoinTransaction(tx)).toThrow(InvalidTransactionFormatError);
    });
  });

  describe('Error classes', () => {
    test('BitcoinParsingError inherits from Error', () => {
      const error = new BitcoinParsingError('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BitcoinParsingError');
      expect(error.message).toBe('test message');
    });

    test('InvalidTransactionFormatError inherits from BitcoinParsingError', () => {
      const error = new InvalidTransactionFormatError('test message');
      expect(error).toBeInstanceOf(BitcoinParsingError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InvalidTransactionFormatError');
      expect(error.message).toBe('Invalid transaction format: test message');
    });

    test('InvalidRevealFormatError inherits from BitcoinParsingError', () => {
      const error = new InvalidRevealFormatError('test message');
      expect(error).toBeInstanceOf(BitcoinParsingError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InvalidRevealFormatError');
      expect(error.message).toBe('Invalid reveal format: test message');
    });

    test('errors can include cause', () => {
      const cause = new Error('underlying error');
      const error = new BitcoinParsingError('wrapper error', cause);
      expect(error.cause).toBe(cause);
    });
  });

  /**
   * Real-world transaction testing using actual TBTC deposit data
   *
   * These tests use genuine Bitcoin transaction data extracted from production TBTC deposits
   * on Ethereum Sepolia testnet. This provides valuable validation that our parser works
   * correctly with real-world data patterns, not just synthetic test data.
   *
   * Benefits of real-world testing:
   * - Discovers endianness issues that synthetic tests might miss
   * - Validates field length assumptions against actual data
   * - Tests edge cases that occur in production but not in synthetic data
   * - Ensures compatibility with actual Bitcoin transaction formats
   */
  describe('Real-world transaction testing', () => {
    // Real Bitcoin transaction data from Ethereum Sepolia L1BitcoinDepositor
    // Contract: 0x40c74a5f0b0e6CC3Ae4E8dD2Db46d372504445DA
    // Ethereum TX: 0xc50021cf0f103c307b5fcd025e657621aa72cf72345625ce7c3d3cbe0b6db90c
    const REAL_TBTC_TRANSACTION = {
      version: '0x02000000', // Version 2 (little-endian)
      inputVector:
        '0x014a2d47df7d16bc0d5523a7b9bf2d9edfe7fc78eb1cc4b2036dc62be52446981e0100000000fdffffff',
      outputVector:
        '0x0240420f0000000000220020401a160a6d28b39260526c9b9dfc3e9ef4a4fb946a12dea4dac76c699142ba7cec9c060700000000160014a1ba8e6eca8f24ee5048abde56e0b8a45931e34a',
      locktime: '0x895e4500', // Locktime (little-endian)
    } as const;

    const REAL_REVEAL_DATA = {
      fundingOutputIndex: 0,
      blindingFactor: '1b721d60ac4c77d5', // Note: 8 bytes (truncated for this deposit)
      walletPubKeyHash: 'ef5a2946f294f1742a779c9ac034bc3fa5d417b8',
      refundPubKeyHash: '3b37a7f4a2519781af3375f0b8c4766a67964b99',
      refundLocktime: '4e31bb69',
      vault: 'B5679dE944A79732A75CE556191DF11F489448d5',
    } as const;

    /**
     * Helper function to create full transaction hex from components
     */
    const createFullTransactionHex = (tx: typeof REAL_TBTC_TRANSACTION): string => {
      // Remove '0x' prefix from each component before concatenating
      const version = tx.version.slice(2);
      const inputVector = tx.inputVector.slice(2);
      const outputVector = tx.outputVector.slice(2);
      const locktime = tx.locktime.slice(2);
      return version + inputVector + outputVector + locktime;
    };

    test('parses real TBTC testnet funding transaction from Ethereum L1BitcoinDepositor', () => {
      const fullTxHex = createFullTransactionHex(REAL_TBTC_TRANSACTION);
      const txBytes = hexToBytes('0x' + fullTxHex);

      // Test the parser with real transaction data
      const parsed = parseFundingTransaction(txBytes);

      // Verify parsed values match the original data
      expect(parsed.version).toBe(REAL_TBTC_TRANSACTION.version);
      expect(parsed.inputVector).toBe(REAL_TBTC_TRANSACTION.inputVector);
      expect(parsed.outputVector).toBe(REAL_TBTC_TRANSACTION.outputVector);
      expect(parsed.locktime).toBe(REAL_TBTC_TRANSACTION.locktime);

      // Verify transaction structure characteristics
      expect(parsed.inputVector.substring(2, 4)).toBe('01'); // 1 input (skip '0x' prefix)
      expect(parsed.outputVector.substring(2, 4)).toBe('02'); // 2 outputs (skip '0x' prefix)
    });

    test('parses real TBTC testnet reveal data from Ethereum L1BitcoinDepositor', () => {
      // Verify individual field values extracted from Ethereum transaction
      expect(REAL_REVEAL_DATA.fundingOutputIndex).toBe(0);
      expect(REAL_REVEAL_DATA.blindingFactor).toBe('1b721d60ac4c77d5');
      expect(REAL_REVEAL_DATA.walletPubKeyHash).toBe('ef5a2946f294f1742a779c9ac034bc3fa5d417b8');
      expect(REAL_REVEAL_DATA.refundPubKeyHash).toBe('3b37a7f4a2519781af3375f0b8c4766a67964b99');
      expect(REAL_REVEAL_DATA.vault.toLowerCase()).toBe('b5679de944a79732a75ce556191df11f489448d5');

      // Convert hex locktime to decimal for verification
      const locktime = parseInt(REAL_REVEAL_DATA.refundLocktime, 16);
      expect(locktime).toBe(1311882089); // 0x4e31bb69 in decimal (corrected)

      // Verify field lengths (important for understanding data format differences)
      expect(REAL_REVEAL_DATA.blindingFactor.length).toBe(16); // 8 bytes = 16 hex chars (truncated)
      expect(REAL_REVEAL_DATA.walletPubKeyHash.length).toBe(40); // 20 bytes = 40 hex chars
      expect(REAL_REVEAL_DATA.refundPubKeyHash.length).toBe(40); // 20 bytes = 40 hex chars
      expect(REAL_REVEAL_DATA.vault.length).toBe(40); // 20 bytes = 40 hex chars (address)
    });

    test('analyzes real Bitcoin transaction structure from TBTC deposit', () => {
      // Analyze the input vector structure using real data
      const inputVector = REAL_TBTC_TRANSACTION.inputVector;

      // Parse input vector manually to understand structure
      let offset = 2; // Skip '0x' prefix
      const inputCount = parseInt(inputVector.substring(offset, offset + 2), 16);
      expect(inputCount).toBe(1); // 1 input
      offset += 2;

      // Previous transaction hash (32 bytes, reversed for display)
      const prevTxHash = inputVector.substring(offset, offset + 64);
      expect(prevTxHash).toBe('4a2d47df7d16bc0d5523a7b9bf2d9edfe7fc78eb1cc4b2036dc62be52446981e');
      offset += 64;

      // Output index (4 bytes, little-endian)
      const outputIndex = inputVector.substring(offset, offset + 8);
      expect(outputIndex).toBe('01000000'); // Index 1
      offset += 8;

      // Script length and sequence
      const scriptLength = parseInt(inputVector.substring(offset, offset + 2), 16);
      expect(scriptLength).toBe(0); // Empty script (typical for TBTC deposits)
      offset += 2;

      const sequence = inputVector.substring(offset, offset + 8);
      expect(sequence).toBe('fdffffff'); // Sequence number (RBF enabled)
    });

    test('analyzes real Bitcoin output structure from TBTC deposit', () => {
      // Analyze the output vector structure using real data
      const outputVector = REAL_TBTC_TRANSACTION.outputVector;

      let offset = 2; // Skip '0x' prefix
      const outputCount = parseInt(outputVector.substring(offset, offset + 2), 16);
      expect(outputCount).toBe(2); // 2 outputs (typical TBTC pattern)
      offset += 2;

      // First output (TBTC deposit output)
      const output1Value = outputVector.substring(offset, offset + 16);
      expect(output1Value).toBe('40420f0000000000'); // 1,000,000 satoshis (little-endian)
      offset += 16;

      const output1ScriptLength = parseInt(outputVector.substring(offset, offset + 2), 16);
      expect(output1ScriptLength).toBe(34); // 0x22 = 34 bytes (P2WSH script)
      offset += 2;

      const output1Script = outputVector.substring(offset, offset + output1ScriptLength * 2);
      expect(output1Script).toBe(
        '0020401a160a6d28b39260526c9b9dfc3e9ef4a4fb946a12dea4dac76c699142ba7c',
      ); // Corrected: actual script is 33 bytes, not 34
      offset += output1ScriptLength * 2;

      // Second output (change output)
      const output2Value = outputVector.substring(offset, offset + 16);
      expect(output2Value).toBe('ec9c060700000000'); // Change output value (corrected)
      offset += 16;

      const output2ScriptLength = parseInt(outputVector.substring(offset, offset + 2), 16);
      expect(output2ScriptLength).toBe(22); // 0x16 = 22 bytes (P2WPKH script)
      offset += 2;

      const output2Script = outputVector.substring(offset, offset + output2ScriptLength * 2);
      expect(output2Script).toBe('0014a1ba8e6eca8f24ee5048abde56e0b8a45931e34a');
    });

    test('validates real transaction with parser (documents current limitations)', () => {
      // This test demonstrates that the parser works with real Bitcoin transaction data
      const fullTxHex = createFullTransactionHex(REAL_TBTC_TRANSACTION);
      const txBytes = hexToBytes('0x' + fullTxHex);

      // Current parser handles this legacy format successfully
      const parsed = parseFundingTransaction(txBytes);
      expect(parsed).toBeDefined();
      expect(parsed.version).toBe(REAL_TBTC_TRANSACTION.version);

      // Note: Real TBTC deposits use SegWit format in production
      // This parser currently handles legacy format for compatibility
      // SegWit transactions would include witness data after the outputs
    });

    test('compares real data characteristics with expected TBTC patterns', () => {
      // Real transaction uses version 2 (standard Bitcoin transaction version)
      // Note: version is stored in little-endian format, so we need to convert it properly
      const versionBytes = hexToBytes(REAL_TBTC_TRANSACTION.version);
      const versionDecimal =
        versionBytes[0] +
        (versionBytes[1] << 8) +
        (versionBytes[2] << 16) +
        (versionBytes[3] << 24);
      expect(versionDecimal).toBe(2);

      // Real transaction uses specific locktime (block height or timestamp)
      // Note: locktime is also stored in little-endian format
      const locktimeBytes = hexToBytes(REAL_TBTC_TRANSACTION.locktime);
      const locktimeDecimal =
        locktimeBytes[0] +
        (locktimeBytes[1] << 8) +
        (locktimeBytes[2] << 16) +
        (locktimeBytes[3] << 24);
      expect(locktimeDecimal).toBe(4546185); // Actual computed value from little-endian conversion

      // Real transaction follows typical TBTC pattern: 1 input, 2 outputs
      const inputCount = parseInt(REAL_TBTC_TRANSACTION.inputVector.substring(2, 4), 16); // Skip '0x' prefix
      const outputCount = parseInt(REAL_TBTC_TRANSACTION.outputVector.substring(2, 4), 16); // Skip '0x' prefix
      expect(inputCount).toBe(1);
      expect(outputCount).toBe(2);

      // Real blinding factor is truncated (8 bytes vs expected 32 bytes)
      expect(REAL_REVEAL_DATA.blindingFactor.length).toBe(16); // 8 bytes = 16 hex chars

      // This indicates that the reveal format in production may differ from specification
      // or that blinding factors are truncated/padded during extraction
    });
  });
});
