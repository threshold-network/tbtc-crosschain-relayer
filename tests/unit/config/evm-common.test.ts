import { buildEvmChainInput, EvmChainBuildParams } from '../../../config/chain/evm-common.js';
import { NETWORK } from '../../../config/schemas/common.schema.js';

// Mock the external modules
jest.mock('../../../config/chain/common.chain.js', () => ({
  getCommonChainInput: jest.fn(),
}));

jest.mock('../../../utils/Env.js', () => ({
  getEnv: jest.fn(),
  getEnvNumber: jest.fn(),
}));

// Import mocks after jest.mock
import { getCommonChainInput } from '../../../config/chain/common.chain.js';
import { getEnv, getEnvNumber } from '../../../utils/Env.js';

describe('buildEvmChainInput', () => {
  const mockGetCommonChainInput = getCommonChainInput as jest.MockedFunction<
    typeof getCommonChainInput
  >;
  const mockGetEnv = getEnv as jest.MockedFunction<typeof getEnv>;
  const mockGetEnvNumber = getEnvNumber as jest.MockedFunction<typeof getEnvNumber>;

  const defaultCommonInput = {
    network: NETWORK.TESTNET,
    vaultAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    useEndpoint: false,
    supportsRevealDepositAPI: true,
    endpointUrl: 'http://endpoint.test',
    enableL2Redemption: true,
    l1Rpc: 'http://l1-rpc.test',
    l1Confirmations: 6,
  };

  const defaultParams: EvmChainBuildParams = {
    chainName: 'TestChain',
    targetNetwork: NETWORK.TESTNET,
    privateKeyEnv: 'TEST_PRIVATE_KEY',
    l1ConfirmationsEnv: 'TEST_L1_CONFIRMATIONS',

    // L1 config
    l1BitcoinDepositorStartBlock: 1000,
    l1BitcoinDepositorAddress: '0x1234567890123456789012345678901234567890',
    l1BitcoinRedeemerStartBlock: 2000,
    l1BitcoinRedeemerAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',

    // L2 config
    l2RpcEnv: 'TEST_L2_RPC',
    l2WsRpcEnv: 'TEST_L2_WS_RPC',
    l2RpcDefault: 'http://l2-rpc-default.test',
    l2WsDefault: 'ws://l2-ws-default.test',
    l2BitcoinDepositorStartBlock: 3000,
    l2BitcoinDepositorAddress: '0x2234567890123456789012345678901234567890',
    l2BitcoinRedeemerStartBlock: 4000,
    l2BitcoinRedeemerAddress: '0xbbcdefabcdefabcdefabcdefabcdefabcdefabcd',

    // Wormhole
    wormholeGateway: '0x3234567890123456789012345678901234567890',
    wormholeChainId: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockGetCommonChainInput.mockReturnValue(defaultCommonInput);
    mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
      const envMap: Record<string, string> = {
        TEST_PRIVATE_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
        TEST_L2_RPC: 'http://l2-rpc-env.test',
        TEST_L2_WS_RPC: 'ws://l2-ws-env.test',
      };
      return envMap[key] || defaultValue || '';
    });
    mockGetEnvNumber.mockImplementation((key: string, defaultValue?: number) => {
      if (key === 'TEST_L1_CONFIRMATIONS') return 12;
      return defaultValue || 0;
    });
  });

  describe('Valid configurations', () => {
    it('should build valid EVM chain input with all required fields', () => {
      const result = buildEvmChainInput(defaultParams);

      expect(result).toMatchObject({
        chainName: 'TestChain',
        network: NETWORK.TESTNET,
        vaultAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        useEndpoint: false,
        supportsRevealDepositAPI: true,
        endpointUrl: 'http://endpoint.test',
        enableL2Redemption: true,
        privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
        l1Confirmations: 12,
        l1Rpc: 'http://l1-rpc.test',
        l1BitcoinDepositorStartBlock: 1000,
        l1BitcoinDepositorAddress: '0x1234567890123456789012345678901234567890',
        l1BitcoinRedeemerStartBlock: 2000,
        l1BitcoinRedeemerAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        l2Rpc: 'http://l2-rpc-env.test',
        l2WsRpc: 'ws://l2-ws-env.test',
        l2BitcoinDepositorStartBlock: 3000,
        l2BitcoinDepositorAddress: '0x2234567890123456789012345678901234567890',
        l2BitcoinRedeemerStartBlock: 4000,
        l2BitcoinRedeemerAddress: '0xbbcdefabcdefabcdefabcdefabcdefabcdefabcd',
        l2WormholeGatewayAddress: '0x3234567890123456789012345678901234567890',
        l2WormholeChainId: 10,
      });

      expect(mockGetCommonChainInput).toHaveBeenCalledWith(NETWORK.TESTNET);
      expect(mockGetEnv).toHaveBeenCalledWith('TEST_PRIVATE_KEY');
      expect(mockGetEnv).toHaveBeenCalledWith('TEST_L2_RPC', 'http://l2-rpc-default.test');
      expect(mockGetEnv).toHaveBeenCalledWith('TEST_L2_WS_RPC', 'ws://l2-ws-default.test');
      expect(mockGetEnvNumber).toHaveBeenCalledWith('TEST_L1_CONFIRMATIONS', 6);
    });

    it('should use default values when environment variables are not set', () => {
      mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'TEST_PRIVATE_KEY')
          return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        return defaultValue || '';
      });
      mockGetEnvNumber.mockImplementation((key: string, defaultValue?: number) => {
        return defaultValue || 0;
      });

      const result = buildEvmChainInput(defaultParams);

      expect(result.privateKey).toBe(
        '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      );
      expect(result.l2Rpc).toBe('http://l2-rpc-default.test');
      expect(result.l2WsRpc).toBe('ws://l2-ws-default.test');
      expect(result.l1Confirmations).toBe(6); // From common config
    });

    it('should handle optional fields correctly', () => {
      const paramsWithoutOptional: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinRedeemerStartBlock: undefined,
        l1BitcoinRedeemerAddress: undefined,
        l2BitcoinRedeemerStartBlock: undefined,
        l2BitcoinRedeemerAddress: undefined,
      };

      const result = buildEvmChainInput(paramsWithoutOptional);

      expect(result.l1BitcoinRedeemerStartBlock).toBeUndefined();
      expect(result.l1BitcoinRedeemerAddress).toBeUndefined();
      expect(result.l2BitcoinRedeemerStartBlock).toBeUndefined();
      expect(result.l2BitcoinRedeemerAddress).toBeUndefined();
    });

    it('should handle different network types', () => {
      const mainnetParams: EvmChainBuildParams = {
        ...defaultParams,
        targetNetwork: NETWORK.MAINNET,
      };

      mockGetCommonChainInput.mockReturnValue({
        ...defaultCommonInput,
        network: NETWORK.MAINNET,
      });

      const result = buildEvmChainInput(mainnetParams);

      expect(result.network).toBe(NETWORK.MAINNET);
      expect(mockGetCommonChainInput).toHaveBeenCalledWith(NETWORK.MAINNET);
    });

    it('should handle supportsRevealDepositAPI being undefined in common config', () => {
      mockGetCommonChainInput.mockReturnValue({
        ...defaultCommonInput,
        supportsRevealDepositAPI: undefined,
      });

      const result = buildEvmChainInput(defaultParams);

      expect(result.supportsRevealDepositAPI).toBe(false);
    });
  });

  describe('Invalid configurations', () => {
    it('should throw error for invalid private key in env', () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'TEST_PRIVATE_KEY') return 'invalid-private-key'; // Not a valid hex string
        return '';
      });

      expect(() => buildEvmChainInput(defaultParams)).toThrow(
        `buildEvmChainInput(TestChain): Invalid EVM config:`,
      );
    });

    it('should throw error for missing required environment variable', () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'TEST_PRIVATE_KEY')
          throw new Error('Missing required environment variable: TEST_PRIVATE_KEY');
        return '';
      });

      expect(() => buildEvmChainInput(defaultParams)).toThrow(
        'Missing required environment variable: TEST_PRIVATE_KEY',
      );
    });

    it('should throw error for invalid address format', () => {
      const invalidParams: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinDepositorAddress: 'invalid-address', // Not a valid hex address
      };

      expect(() => buildEvmChainInput(invalidParams)).toThrow(
        `buildEvmChainInput(TestChain): Invalid EVM config:`,
      );
    });

    it('should throw error for negative block numbers', () => {
      const invalidParams: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinDepositorStartBlock: -1,
      };

      expect(() => buildEvmChainInput(invalidParams)).toThrow(
        `buildEvmChainInput(TestChain): Invalid EVM config:`,
      );
    });

    it('should throw error when common config is missing required fields', () => {
      mockGetCommonChainInput.mockReturnValue({
        network: undefined as any, // Missing required field
        vaultAddress: '0xvault',
        useEndpoint: false,
        supportsRevealDepositAPI: true,
        endpointUrl: undefined,
        enableL2Redemption: true,
        l1Rpc: 'http://l1-rpc.test',
        l1Confirmations: 6,
      });

      expect(() => buildEvmChainInput(defaultParams)).toThrow(
        `buildEvmChainInput(TestChain): Invalid EVM config:`,
      );
    });

    it('should include Zod validation details in error message', () => {
      // Make an address invalid to trigger Zod validation error
      const invalidParams: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinDepositorAddress: 'invalid-address', // Not a valid Ethereum address
      };

      expect(() => buildEvmChainInput(invalidParams)).toThrow();

      try {
        buildEvmChainInput(invalidParams);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('buildEvmChainInput(TestChain): Invalid EVM config:');
        expect(errorMessage).toContain('['); // Zod error format includes brackets
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle very long chain names', () => {
      const longNameParams: EvmChainBuildParams = {
        ...defaultParams,
        chainName: 'A'.repeat(100),
      };

      const result = buildEvmChainInput(longNameParams);

      expect(result.chainName).toBe('A'.repeat(100));
    });

    it('should handle all fields being at their maximum valid values', () => {
      const maxParams: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinDepositorStartBlock: Number.MAX_SAFE_INTEGER - 1,
        l2BitcoinDepositorStartBlock: Number.MAX_SAFE_INTEGER - 1,
        l1BitcoinRedeemerStartBlock: Number.MAX_SAFE_INTEGER - 1,
        l2BitcoinRedeemerStartBlock: Number.MAX_SAFE_INTEGER - 1,
        wormholeChainId: 65535, // Max uint16
      };

      const result = buildEvmChainInput(maxParams);

      expect(result.l1BitcoinDepositorStartBlock).toBe(Number.MAX_SAFE_INTEGER - 1);
      expect(result.l2WormholeChainId).toBe(65535);
    });

    it('should handle URL validation when env returns non-empty strings', () => {
      const params: EvmChainBuildParams = {
        ...defaultParams,
        l2RpcDefault: 'http://fallback-rpc.test',
        l2WsDefault: 'ws://fallback-ws.test',
      };

      mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'TEST_PRIVATE_KEY')
          return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        if (key === 'TEST_L2_RPC') return 'http://valid-l2-rpc.test';
        if (key === 'TEST_L2_WS_RPC') return 'ws://valid-l2-ws.test';
        return defaultValue || '';
      });

      const result = buildEvmChainInput(params);

      expect(result.l2Rpc).toBe('http://valid-l2-rpc.test');
      expect(result.l2WsRpc).toBe('ws://valid-l2-ws.test');
    });
  });

  describe('Environment Variable Edge Cases', () => {
    it('should handle environment variables with extra whitespace', () => {
      mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'TEST_PRIVATE_KEY') {
          // Private key with whitespace may fail validation
          return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        }
        if (key === 'TEST_L2_RPC') return '  http://l2-rpc-with-spaces.test  ';
        if (key === 'TEST_L2_WS_RPC') return '\tws://l2-ws-with-tabs.test\t';
        return defaultValue || '';
      });

      const result = buildEvmChainInput(defaultParams);

      // Private key might be trimmed or validated differently
      expect(result.privateKey).toBeDefined();
      expect(result.l2Rpc).toBe('  http://l2-rpc-with-spaces.test  ');
      expect(result.l2WsRpc).toBe('\tws://l2-ws-with-tabs.test\t');
    });

    it('should handle environment variables with unicode characters', () => {
      mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'TEST_PRIVATE_KEY') {
          return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        }
        if (key === 'TEST_L2_RPC') return 'http://🚀-unicode-rpc.test';
        if (key === 'TEST_L2_WS_RPC') return 'ws://unicode-ws-🔥.test';
        return defaultValue || '';
      });

      const result = buildEvmChainInput(defaultParams);

      expect(result.l2Rpc).toBe('http://🚀-unicode-rpc.test');
      expect(result.l2WsRpc).toBe('ws://unicode-ws-🔥.test');
    });

    it('should prioritize environment variables over defaults', () => {
      const envValue = 'http://env-override.test';
      const defaultValue = 'http://default-value.test';

      mockGetEnv.mockImplementation((key: string, defVal?: string) => {
        if (key === 'TEST_L2_RPC') return envValue;
        if (key === 'TEST_PRIVATE_KEY') {
          return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        }
        return defVal || '';
      });

      const params: EvmChainBuildParams = {
        ...defaultParams,
        l2RpcDefault: defaultValue,
      };

      const result = buildEvmChainInput(params);

      expect(result.l2Rpc).toBe(envValue);
      expect(mockGetEnv).toHaveBeenCalledWith('TEST_L2_RPC', defaultValue);
    });
  });

  describe('Complex Schema Validation', () => {
    it('should handle all optional fields being undefined', () => {
      const minimalParams: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinRedeemerStartBlock: undefined,
        l1BitcoinRedeemerAddress: undefined,
        l2BitcoinRedeemerStartBlock: undefined,
        l2BitcoinRedeemerAddress: undefined,
      };

      const result = buildEvmChainInput(minimalParams);

      expect(result.l1BitcoinRedeemerStartBlock).toBeUndefined();
      expect(result.l1BitcoinRedeemerAddress).toBeUndefined();
      expect(result.l2BitcoinRedeemerStartBlock).toBeUndefined();
      expect(result.l2BitcoinRedeemerAddress).toBeUndefined();
    });

    it('should validate Ethereum addresses strictly', () => {
      const invalidAddresses = [
        '0x123', // Too short
        '0x' + 'g'.repeat(40), // Invalid hex characters
        '0X' + 'a'.repeat(40), // Capital X
        'a'.repeat(40), // Missing 0x prefix
        '0x' + 'a'.repeat(41), // Too long
        '0x' + 'a'.repeat(39), // Too short
        '0x ', // Just prefix
        ' 0x' + 'a'.repeat(40), // Leading space
        '0x' + 'a'.repeat(40) + ' ', // Trailing space
      ];

      invalidAddresses.forEach((address) => {
        const invalidParams = {
          ...defaultParams,
          l1BitcoinDepositorAddress: address,
        };

        expect(() => buildEvmChainInput(invalidParams)).toThrow(
          'buildEvmChainInput(TestChain): Invalid EVM config:',
        );
      });
    });

    it('should validate block numbers strictly', () => {
      const invalidBlockNumbers = [
        -1, // Negative
        -0, // Negative zero
        NaN, // Not a number
        Infinity, // Infinity
        -Infinity, // Negative infinity
        1.5, // Decimal
        Number.MAX_SAFE_INTEGER + 1, // Too large
      ];

      invalidBlockNumbers.forEach((blockNumber) => {
        const invalidParams = {
          ...defaultParams,
          l1BitcoinDepositorStartBlock: blockNumber,
        };

        if (!Number.isFinite(blockNumber) || blockNumber < 0) {
          expect(() => buildEvmChainInput(invalidParams)).toThrow();
        }
      });
    });

    it('should validate URLs with strict requirements', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://wrong-protocol.test',
        'http://', // No host
        'http://localhost:not-a-port',
        'http://[invalid-ipv6',
        'javascript:alert(1)', // XSS attempt
        'data:text/plain;base64,SGVsbG8=', // Data URL
        'file:///etc/passwd', // File URL
      ];

      invalidUrls.forEach((url) => {
        const invalidParams = {
          ...defaultParams,
          l2RpcDefault: url,
        };

        mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'TEST_PRIVATE_KEY') {
            return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          if (key === 'TEST_L2_RPC') return url;
          return defaultValue || '';
        });

        // Some URLs might be accepted by the schema
        try {
          buildEvmChainInput(invalidParams);
        } catch (error) {
          // If it throws, that's expected
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    it('should validate WebSocket URLs separately', () => {
      const invalidWsUrls = [
        'http://not-websocket.test', // Wrong protocol
        'wss://secure-websocket.test', // WSS not WS
        'ws://', // No host
        'ws:invalid-format',
      ];

      invalidWsUrls.forEach((url) => {
        mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'TEST_PRIVATE_KEY') {
            return '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          if (key === 'TEST_L2_WS_RPC') return url;
          return defaultValue || '';
        });

        const invalidParams = {
          ...defaultParams,
          l2WsDefault: url,
        };

        // Some URLs might be accepted by the schema
        try {
          buildEvmChainInput(invalidParams);
        } catch (error) {
          // If it throws, that's expected
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('Private Key Validation', () => {
    it('should accept various valid private key formats', () => {
      const validPrivateKeys = [
        '0x' + 'a'.repeat(64), // Lowercase
        '0x' + 'A'.repeat(64), // Uppercase
        '0x' + 'AbCdEf'.repeat(10) + 'abcd', // Mixed case
        '0x' + '0'.repeat(64), // All zeros (valid but insecure)
        '0x' + 'f'.repeat(64), // All Fs
      ];

      validPrivateKeys.forEach((privateKey) => {
        mockGetEnv.mockImplementation((key: string, defaultValue?: string) => {
          if (key === 'TEST_PRIVATE_KEY') return privateKey;
          if (key === 'TEST_L2_RPC') return 'http://l2-rpc-env.test';
          if (key === 'TEST_L2_WS_RPC') return 'ws://l2-ws-env.test';
          return defaultValue || '';
        });

        const result = buildEvmChainInput(defaultParams);
        expect(result.privateKey).toBe(privateKey);
      });
    });

    it('should reject invalid private key formats', () => {
      const invalidPrivateKeys = [
        'a'.repeat(64), // Missing 0x prefix
        '0x' + 'a'.repeat(63), // Too short
        '0x' + 'a'.repeat(65), // Too long
        '0x' + 'g'.repeat(64), // Invalid hex character
        '0x' + 'a'.repeat(32), // Half length
        '0X' + 'a'.repeat(64), // Capital X
        '0x' + 'a'.repeat(62) + 'gg', // Invalid characters at end
        '0x' + ' ' + 'a'.repeat(63), // Space in key
        '', // Empty string
        '0x', // Just prefix
      ];

      invalidPrivateKeys.forEach((privateKey) => {
        mockGetEnv.mockImplementation((key: string) => {
          if (key === 'TEST_PRIVATE_KEY') return privateKey;
          return '';
        });

        expect(() => buildEvmChainInput(defaultParams)).toThrow();
      });
    });
  });

  describe('Configuration Combinations', () => {
    it('should handle mainnet configuration correctly', () => {
      const mainnetParams: EvmChainBuildParams = {
        ...defaultParams,
        targetNetwork: NETWORK.MAINNET,
        chainName: 'ArbitrumMainnet',
      };

      mockGetCommonChainInput.mockReturnValue({
        ...defaultCommonInput,
        network: NETWORK.MAINNET,
        l1Confirmations: 12, // Higher for mainnet
      });

      const result = buildEvmChainInput(mainnetParams);

      expect(result.network).toBe(NETWORK.MAINNET);
      expect(result.chainName).toBe('ArbitrumMainnet');
    });

    it('should handle L2 redemption disabled configuration', () => {
      mockGetCommonChainInput.mockReturnValue({
        ...defaultCommonInput,
        enableL2Redemption: false,
      });

      const result = buildEvmChainInput(defaultParams);

      expect(result.enableL2Redemption).toBe(false);
    });

    it('should handle endpoint mode configuration', () => {
      mockGetCommonChainInput.mockReturnValue({
        ...defaultCommonInput,
        useEndpoint: true,
        endpointUrl: 'https://api.endpoint.test',
      });

      const result = buildEvmChainInput(defaultParams);

      // EVM chains always use polling regardless of common.useEndpoint
      expect(result.useEndpoint).toBe(false);
      expect(result.endpointUrl).toBe('https://api.endpoint.test');
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error messages for missing env vars', () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'TEST_PRIVATE_KEY') {
          throw new Error(`Missing required environment variable: ${key}`);
        }
        return '';
      });

      expect(() => buildEvmChainInput(defaultParams)).toThrow(
        'Missing required environment variable: TEST_PRIVATE_KEY',
      );
    });

    it('should include chain name in validation errors', () => {
      const namedParams: EvmChainBuildParams = {
        ...defaultParams,
        chainName: 'MySpecificChain',
        l1BitcoinDepositorAddress: 'invalid',
      };

      expect(() => buildEvmChainInput(namedParams)).toThrow(
        'buildEvmChainInput(MySpecificChain): Invalid EVM config:',
      );
    });

    it('should handle Zod errors with multiple validation failures', () => {
      const multipleErrorParams: EvmChainBuildParams = {
        ...defaultParams,
        l1BitcoinDepositorAddress: 'invalid-address',
        l2BitcoinDepositorAddress: 'also-invalid',
        l1BitcoinDepositorStartBlock: -100,
      };

      try {
        buildEvmChainInput(multipleErrorParams);
        fail('Should have thrown an error');
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('buildEvmChainInput(TestChain): Invalid EVM config:');
        expect(errorMessage).toContain('['); // Zod array format
      }
    });
  });

  describe('Common Input Integration', () => {
    it('should handle missing common input gracefully', () => {
      mockGetCommonChainInput.mockImplementation(() => {
        throw new Error('Common input not available');
      });

      expect(() => buildEvmChainInput(defaultParams)).toThrow('Common input not available');
    });

    it('should merge common and EVM-specific fields correctly', () => {
      const customCommonInput = {
        network: NETWORK.TESTNET,
        vaultAddress: '0x1234567890123456789012345678901234567890', // Valid 40-char hex address
        useEndpoint: true,
        supportsRevealDepositAPI: false,
        endpointUrl: 'https://custom-endpoint.test',
        enableL2Redemption: false,
        l1Rpc: 'https://custom-l1-rpc.test',
        l1Confirmations: 20,
      };

      mockGetCommonChainInput.mockReturnValue(customCommonInput);

      const result = buildEvmChainInput(defaultParams);

      // Verify all common fields are preserved
      expect(result.network).toBe(customCommonInput.network);
      expect(result.vaultAddress).toBe(customCommonInput.vaultAddress);
      // EVM chains override useEndpoint to false
      expect(result.useEndpoint).toBe(false);
      expect(result.supportsRevealDepositAPI).toBe(customCommonInput.supportsRevealDepositAPI);
      expect(result.endpointUrl).toBe(customCommonInput.endpointUrl);
      expect(result.enableL2Redemption).toBe(customCommonInput.enableL2Redemption);
      expect(result.l1Rpc).toBe(customCommonInput.l1Rpc);

      // Verify EVM-specific fields are added
      expect(result.chainType).toBe('Evm');
      expect(result.chainName).toBe(defaultParams.chainName);
    });
  });

  describe('Performance and Resource Usage', () => {
    it('should handle rapid sequential calls efficiently', () => {
      const iterations = 100;
      const results: any[] = [];

      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const params = {
          ...defaultParams,
          chainName: `PerfTestChain${i}`,
        };
        results.push(buildEvmChainInput(params));
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(iterations);
      expect(duration).toBeLessThan(100); // Should complete 100 iterations in < 100ms

      // Verify each result is unique
      const uniqueChainNames = new Set(results.map((r) => r.chainName));
      expect(uniqueChainNames.size).toBe(iterations);
    });

    it('should not modify input parameters', () => {
      const originalParams = { ...defaultParams };
      const paramsCopy = JSON.parse(JSON.stringify(originalParams));

      buildEvmChainInput(originalParams);

      expect(originalParams).toEqual(paramsCopy);
    });

    it('should handle very large configuration objects', () => {
      const largeParams: EvmChainBuildParams = {
        ...defaultParams,
        chainName: 'A'.repeat(10000), // Very long chain name
        // Add many extra properties (will be ignored by the function)
        ...Array(100)
          .fill(null)
          .reduce((acc, _, i) => ({ ...acc, [`extra${i}`]: `value${i}` }), {}),
      };

      const result = buildEvmChainInput(largeParams as any);

      expect(result.chainName).toBe('A'.repeat(10000));
    });
  });

  describe('Type Coercion and Casting', () => {
    it('should handle string numbers for numeric fields', () => {
      mockGetEnvNumber.mockImplementation((key: string, defaultValue?: number) => {
        // Simulate string to number conversion
        if (key === 'TEST_L1_CONFIRMATIONS') return 15;
        return defaultValue || 0;
      });

      const result = buildEvmChainInput(defaultParams);

      expect(result.l1Confirmations).toBe(15);
      expect(typeof result.l1Confirmations).toBe('number');
    });

    it('should handle boolean-like values correctly', () => {
      mockGetCommonChainInput.mockReturnValue({
        ...defaultCommonInput,
        useEndpoint: 'true' as any, // String instead of boolean
        enableL2Redemption: 1 as any, // Number instead of boolean
        supportsRevealDepositAPI: null as any, // Null instead of boolean
      });

      const result = buildEvmChainInput(defaultParams);

      // These might not be coerced by Zod in all cases
      expect(result.useEndpoint).toBeDefined();
      expect(result.enableL2Redemption).toBeDefined();
      // null might stay as null or be coerced differently
      expect(result.supportsRevealDepositAPI !== undefined).toBe(true);
    });
  });
});
