import {
  validateStarkNetAddress,
  extractAddressFromBitcoinScript,
  toUint256StarknetAddress,
} from '../../../utils/starknetAddress.js';
import * as bitcoin from 'bitcoinjs-lib';

// Mock starknet.js CallData.compile to avoid actual compilation during tests
// We only care that it's called and doesn't throw for valid inputs.
const mockCompile = jest.fn();
jest.mock('starknet', () => ({
  ...jest.requireActual('starknet'), // Import and retain default exports
  CallData: {
    compile: (obj: any) => mockCompile(obj),
  },
  CairoOption: jest.requireActual('starknet').CairoOption, // Keep actual CairoOption
  CairoOptionVariant: jest.requireActual('starknet').CairoOptionVariant,
}));

describe('StarkNet Address Utilities', () => {
  beforeEach(() => {
    // Clear mock history before each test
    mockCompile.mockClear();
  });

  describe('validateStarkNetAddress', () => {
    it('should return true for a valid StarkNet address', () => {
      const validAddress = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      // Mock CallData.compile to not throw for this specific valid address structure
      mockCompile.mockImplementation(() => ({}));
      expect(validateStarkNetAddress(validAddress)).toBe(true);
      expect(mockCompile).toHaveBeenCalledWith({ addr: validAddress });
    });

    it('should return true for a short valid StarkNet address', () => {
      const shortAddress = '0x1';
      mockCompile.mockImplementation(() => ({}));
      expect(validateStarkNetAddress(shortAddress)).toBe(true);
      expect(mockCompile).toHaveBeenCalledWith({ addr: shortAddress });
    });

    it('should return false for an invalid address (too long)', () => {
      const longAddress = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0'; // Extra char
      // No need to change mockCompile, as length check should catch this
      expect(validateStarkNetAddress(longAddress)).toBe(false);
      // compile might not even be called if ethers.isHexString or length check fails first
    });

    it('should return false for an invalid address (not hex)', () => {
      const invalidAddress = '0xGHIJKLMNOPQRSTUVWXYZGHIJKLMNOPQRSTUVWXYZGHIJKLMNOPQRSTUVWXYZGHIJ';
      expect(validateStarkNetAddress(invalidAddress)).toBe(false);
    });

    it('should return false for an address that causes compile to throw', () => {
      const errorAddress = '0xErrorTrigger';
      mockCompile.mockImplementation(() => {
        throw new Error('Cairo compilation error');
      });
      expect(validateStarkNetAddress(errorAddress)).toBe(false);
      expect(mockCompile).toHaveBeenCalledWith({ addr: errorAddress });
    });

    it('should return false for an empty string', () => {
      expect(validateStarkNetAddress('')).toBe(false);
    });

    it('should return false for just "0x"', () => {
      expect(validateStarkNetAddress('0x')).toBe(false);
    });
  });

  describe('extractAddressFromBitcoinScript', () => {
    // Helper to create a script that pushes data
    const createPushDataScript = (dataHex: string): Buffer => {
      const data = Buffer.from(dataHex, 'hex');
      return bitcoin.script.compile([data]);
    };

    it('should extract a valid StarkNet address from a script', () => {
      // Use a hex string with an even number of characters (31 bytes = 62 hex chars)
      const starkNetAddressHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdee'; // 62 chars
      const script = createPushDataScript(starkNetAddressHex);
      mockCompile.mockImplementation(() => ({}));
      const expectedAddress = '0x' + starkNetAddressHex;
      expect(extractAddressFromBitcoinScript(script)).toBe(expectedAddress);
      expect(mockCompile).toHaveBeenCalledWith({ addr: expectedAddress });
    });

    it('should extract a valid short StarkNet address', () => {
      const starkNetAddressHex = 'cafe'; // 2 bytes
      const script = createPushDataScript(starkNetAddressHex);
      mockCompile.mockImplementation(() => ({}));
      const expectedAddress = '0x' + starkNetAddressHex;
      expect(extractAddressFromBitcoinScript(script)).toBe(expectedAddress);
      expect(mockCompile).toHaveBeenCalledWith({ addr: expectedAddress });
    });

    it('should return null if no valid StarkNet address is found', () => {
      const nonAddressData = 'ffffffffffffffff';
      const script = createPushDataScript(nonAddressData);
      // Mock compile to throw for this specific non-address
      mockCompile.mockImplementation((obj: any) => {
        if (obj.addr === '0x' + nonAddressData) throw new Error('Not an address');
        return {};
      });
      expect(extractAddressFromBitcoinScript(script)).toBe(null);
    });

    it('should return null for a script with multiple data pushes, none being a valid address', () => {
      const script = bitcoin.script.compile([
        Buffer.from('1234', 'hex'),
        Buffer.from('5678', 'hex'),
      ]);
      mockCompile.mockImplementation(() => {
        throw new Error('Cairo compilation error');
      });
      expect(extractAddressFromBitcoinScript(script)).toBe(null);
    });

    it('should extract the first valid StarkNet address if multiple are present (undesirable but testing current logic)', () => {
      const addr1 = '11'; // Use '11' (hex for decimal 17) to ensure it's a data push
      const addr2 = '22'; // Use '22' (hex for decimal 34)
      const script = bitcoin.script.compile([
        Buffer.from(addr1, 'hex'),
        Buffer.from('facefeed', 'hex'), // Non-address data
        Buffer.from(addr2, 'hex'),
      ]);
      mockCompile.mockImplementation((obj: any) => {
        if (obj.addr === '0x' + addr1 || obj.addr === '0x' + addr2) {
          return {};
        }
        throw new Error('Not an address for ' + obj.addr);
      });
      expect(extractAddressFromBitcoinScript(script)).toBe('0x' + addr1); // Expect '0x11'
    });

    it('should return null for an empty script', () => {
      const script = bitcoin.script.compile([]);
      expect(extractAddressFromBitcoinScript(script)).toBe(null);
    });

    it('should return null for a malformed script (string input)', () => {
      // bitcoin.script.decompile might throw or return null for invalid hex
      // Our function catches errors and returns null
      expect(extractAddressFromBitcoinScript('not-a-hex-script')).toBe(null);
    });

    it('should handle data pushes that are too long to be a StarkNet address', () => {
      // 33 bytes, too long for a felt252
      const longDataHex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00';
      const script = createPushDataScript(longDataHex);
      // validateStarkNetAddress should return false if CallData.compile throws or if length is too great.
      // In our current mock, compile might not throw for length, but our function has a chunk.length <= 32 check.
      mockCompile.mockImplementation(() => ({}));
      expect(extractAddressFromBitcoinScript(script)).toBe(null);
    });

    it('should handle data push that is an empty buffer', () => {
      const script = createPushDataScript(''); // empty data push
      mockCompile.mockImplementation(() => ({}));
      expect(extractAddressFromBitcoinScript(script)).toBe(null);
    });
  });

  describe('toUint256StarknetAddress', () => {
    it('should left-pad a valid EVM address to 32 bytes', () => {
      const evmAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const expected = '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      expect(toUint256StarknetAddress(evmAddress)).toBe(expected);
    });

    it('should left-pad a valid EVM address without 0x to 32 bytes', () => {
      const evmAddress = '1234567890abcdef1234567890abcdef12345678';
      const expected = '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      expect(toUint256StarknetAddress(evmAddress)).toBe(expected);
    });

    it('should left-pad a short StarkNet address to 32 bytes', () => {
      const shortAddress = '0x1';
      const expected = '0x0000000000000000000000000000000000000000000000000000000000000001';
      expect(toUint256StarknetAddress(shortAddress)).toBe(expected);
    });

    it('should not change a 32-byte StarkNet address', () => {
      const address = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const expected = address;
      expect(toUint256StarknetAddress(address)).toBe(expected);
    });

    it('should throw for non-hex input', () => {
      expect(() => toUint256StarknetAddress('not-a-hex')).toThrow();
    });

    it('should throw for too long input', () => {
      const tooLong = '0x' + 'a'.repeat(65); // 65 hex chars
      expect(() => toUint256StarknetAddress(tooLong)).toThrow();
    });

    it('should throw error for empty string', () => {
      expect(() => toUint256StarknetAddress('')).toThrow('Address must be a non-empty string');
    });

    it('should always return 0x-prefixed, 64 hex chars', () => {
      const address = '0x1234';
      const result = toUint256StarknetAddress(address);
      expect(result.startsWith('0x')).toBe(true);
      expect(result.length).toBe(66);
    });
  });
});
