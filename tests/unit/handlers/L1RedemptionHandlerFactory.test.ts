import { L1RedemptionHandlerFactory } from '../../../handlers/L1RedemptionHandlerFactory.js';
import { L1RedemptionHandler } from '../../../handlers/L1RedemptionHandler.js';
import { CHAIN_TYPE, NETWORK } from '../../../config/schemas/common.schema.js';
import type { AnyChainConfig } from '../../../config/index.js';
import type { EvmChainConfig } from '../../../config/schemas/evm.chain.schema.js';
import type { SolanaChainConfig } from '../../../config/schemas/solana.chain.schema.js';
import type { SuiChainConfig } from '../../../config/schemas/sui.chain.schema.js';
import type { StarknetChainConfig } from '../../../config/schemas/starknet.chain.schema.js';
import logger from '../../../utils/Logger.js';

// Mock the logger
jest.mock('../../../utils/Logger.js', () => ({
  __esModule: true,
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

// Mock the L1RedemptionHandler
jest.mock('../../../handlers/L1RedemptionHandler.js');

describe('L1RedemptionHandlerFactory', () => {
  let mockEvmConfig: EvmChainConfig;
  let mockSolanaConfig: SolanaChainConfig;
  let mockSuiConfig: SuiChainConfig;
  let mockStarknetConfig: StarknetChainConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock EVM configuration
    mockEvmConfig = {
      chainName: 'ArbitrumSepolia',
      chainType: CHAIN_TYPE.EVM,
      network: NETWORK.TESTNET,
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
      l1Confirmations: 6,
      l1Rpc: 'http://l1-rpc.test',
      l2Rpc: 'http://l2-rpc.test',
      l2WsRpc: 'ws://l2-ws.test',
      l1BitcoinDepositorAddress: '0x1234567890123456789012345678901234567890',
      l1BitcoinDepositorStartBlock: 1000,
      l2BitcoinDepositorAddress: '0x2234567890123456789012345678901234567890',
      l2BitcoinDepositorStartBlock: 2000,
      l2WormholeGatewayAddress: '0x3234567890123456789012345678901234567890',
      l2WormholeChainId: 10,
      vaultAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      useEndpoint: false,
      enableL2Redemption: true,
    } as EvmChainConfig;

    // Mock Solana configuration
    mockSolanaConfig = {
      chainName: 'SolanaDevnet',
      chainType: CHAIN_TYPE.SOLANA,
      network: NETWORK.TESTNET,
      l1Confirmations: 6,
      l1Rpc: 'http://l1-rpc.test',
      l2Rpc: 'http://solana-rpc.test',
      solanaPrivateKey: 'mockSolanaPrivateKey',
      solanaCommitment: 'confirmed',
      vaultAddress: '0xvault',
      useEndpoint: false,
      enableL2Redemption: true,
    } as SolanaChainConfig;

    // Mock Sui configuration
    mockSuiConfig = {
      chainName: 'SuiTestnet',
      chainType: CHAIN_TYPE.SUI,
      network: NETWORK.TESTNET,
      l1Confirmations: 6,
      l1Rpc: 'http://l1-rpc.test',
      l2Rpc: 'http://sui-rpc.test',
      suiPrivateKey: 'mockSuiPrivateKey',
      vaultAddress: '0xvault',
      useEndpoint: false,
      enableL2Redemption: true,
    } as SuiChainConfig;

    // Mock Starknet configuration
    mockStarknetConfig = {
      chainName: 'StarknetTestnet',
      chainType: CHAIN_TYPE.STARKNET,
      network: NETWORK.TESTNET,
      l1Confirmations: 6,
      l1Rpc: 'http://l1-rpc.test',
      l2Rpc: 'http://starknet-rpc.test',
      vaultAddress: '0xvault',
      useEndpoint: false,
      enableL2Redemption: true,
    } as StarknetChainConfig;
  });

  describe('createHandler', () => {
    it('should create an L1RedemptionHandler for EVM chain type', () => {
      const handler = L1RedemptionHandlerFactory.createHandler(mockEvmConfig);

      expect(handler).toBeInstanceOf(L1RedemptionHandler);
      expect(logger.info).toHaveBeenCalledWith(
        'Attempting to create chain handler for type: Evm, name: ArbitrumSepolia',
      );
      expect(logger.info).toHaveBeenCalledWith('Creating EVMChainHandler');
      expect(L1RedemptionHandler).toHaveBeenCalledWith(mockEvmConfig);
    });

    it('should log info messages during handler creation', () => {
      L1RedemptionHandlerFactory.createHandler(mockEvmConfig);

      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        'Attempting to create chain handler for type: Evm, name: ArbitrumSepolia',
      );
      expect(logger.info).toHaveBeenNthCalledWith(2, 'Creating EVMChainHandler');
    });

    it('should throw error for unsupported chain type - Solana', () => {
      expect(() => L1RedemptionHandlerFactory.createHandler(mockSolanaConfig)).toThrow(
        'Unsupported chain type: Solana',
      );

      expect(logger.error).toHaveBeenCalledWith('Unsupported chain type: Solana');
    });

    it('should throw error for unsupported chain type - Sui', () => {
      expect(() => L1RedemptionHandlerFactory.createHandler(mockSuiConfig)).toThrow(
        'Unsupported chain type: Sui',
      );

      expect(logger.error).toHaveBeenCalledWith('Unsupported chain type: Sui');
    });

    it('should throw error for unsupported chain type - Starknet', () => {
      expect(() => L1RedemptionHandlerFactory.createHandler(mockStarknetConfig)).toThrow(
        'Unsupported chain type: Starknet',
      );

      expect(logger.error).toHaveBeenCalledWith('Unsupported chain type: Starknet');
    });

    it('should handle undefined chain type', () => {
      const invalidConfig = {
        ...mockEvmConfig,
        chainType: undefined,
      } as any;

      expect(() => L1RedemptionHandlerFactory.createHandler(invalidConfig)).toThrow(
        'Unsupported chain type: undefined',
      );

      expect(logger.error).toHaveBeenCalledWith('Unsupported chain type: undefined');
    });

    it('should handle unknown chain type', () => {
      const invalidConfig = {
        ...mockEvmConfig,
        chainType: 'UnknownChain' as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(invalidConfig)).toThrow(
        'Unsupported chain type: UnknownChain',
      );

      expect(logger.error).toHaveBeenCalledWith('Unsupported chain type: UnknownChain');
    });

    it('should throw error when L1RedemptionHandler constructor throws', () => {
      const constructorError = new Error('Failed to construct handler');
      (L1RedemptionHandler as jest.MockedClass<typeof L1RedemptionHandler>).mockImplementationOnce(
        () => {
          throw constructorError;
        },
      );

      expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(
        constructorError,
      );
    });

    it('should pass the exact config object to L1RedemptionHandler', () => {
      const specificConfig: EvmChainConfig = {
        ...mockEvmConfig,
        chainName: 'SpecificChain',
        l1Rpc: 'http://specific-l1-rpc.test',
        l2Rpc: 'http://specific-l2-rpc.test',
      };

      L1RedemptionHandlerFactory.createHandler(specificConfig);

      expect(L1RedemptionHandler).toHaveBeenCalledWith(specificConfig);
      expect(L1RedemptionHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle config with minimal required fields', () => {
      const minimalConfig = {
        chainName: 'MinimalChain',
        chainType: CHAIN_TYPE.EVM,
        network: NETWORK.TESTNET,
        l1Rpc: 'http://minimal-rpc.test',
      } as AnyChainConfig;

      const handler = L1RedemptionHandlerFactory.createHandler(minimalConfig);

      expect(handler).toBeInstanceOf(L1RedemptionHandler);
      expect(L1RedemptionHandler).toHaveBeenCalledWith(minimalConfig);
    });
  });

  describe('Factory pattern validation', () => {
    it('should be a static factory class', () => {
      // Verify that createHandler is a static method
      expect(L1RedemptionHandlerFactory.createHandler).toBeDefined();
      expect(typeof L1RedemptionHandlerFactory.createHandler).toBe('function');

      // Verify that we cannot instantiate the factory
      expect(() => new (L1RedemptionHandlerFactory as any)()).not.toThrow();
      // The factory can be instantiated but it should not have any instance methods
      const instance = new (L1RedemptionHandlerFactory as any)();
      expect(instance.createHandler).toBeUndefined();
    });

    it('should maintain consistent error handling pattern', () => {
      const unsupportedConfigs = [
        { config: mockSolanaConfig, type: 'Solana' },
        { config: mockSuiConfig, type: 'Sui' },
        { config: mockStarknetConfig, type: 'Starknet' },
      ];

      unsupportedConfigs.forEach(({ config, type }) => {
        expect(() => L1RedemptionHandlerFactory.createHandler(config)).toThrow(
          `Unsupported chain type: ${type}`,
        );
      });
    });

    it('should create independent handler instances', () => {
      const handler1 = L1RedemptionHandlerFactory.createHandler(mockEvmConfig);
      const handler2 = L1RedemptionHandlerFactory.createHandler(mockEvmConfig);

      // Each call should create a new instance
      expect(L1RedemptionHandler).toHaveBeenCalledTimes(2);

      // Verify they are different instances (in the real implementation)
      // Note: In our mock, they will be the same since we're mocking the constructor
      // but in reality, they should be different instances
      expect(handler1).toBeDefined();
      expect(handler2).toBeDefined();
    });
  });

  describe('Error scenarios', () => {
    it('should propagate errors from L1RedemptionHandler constructor', () => {
      const constructorError = new Error('Failed to initialize handler');
      (L1RedemptionHandler as jest.MockedClass<typeof L1RedemptionHandler>).mockImplementationOnce(
        () => {
          throw constructorError;
        },
      );

      expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(
        'Failed to initialize handler',
      );
    });

    it('should handle null config gracefully', () => {
      expect(() => L1RedemptionHandlerFactory.createHandler(null as any)).toThrow();
    });

    it('should handle undefined config gracefully', () => {
      expect(() => L1RedemptionHandlerFactory.createHandler(undefined as any)).toThrow();
    });

    it('should handle empty object config', () => {
      const emptyConfig = {} as AnyChainConfig;

      expect(() => L1RedemptionHandlerFactory.createHandler(emptyConfig)).toThrow(
        'Unsupported chain type: undefined',
      );
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle rapid sequential handler creations', () => {
      const iterations = 100;
      const handlers: any[] = [];

      for (let i = 0; i < iterations; i++) {
        const config = {
          ...mockEvmConfig,
          chainName: `TestChain${i}`,
        };
        handlers.push(L1RedemptionHandlerFactory.createHandler(config));
      }

      expect(handlers).toHaveLength(iterations);
      expect(L1RedemptionHandler).toHaveBeenCalledTimes(iterations);

      // Verify each handler got unique config
      for (let i = 0; i < iterations; i++) {
        expect(L1RedemptionHandler).toHaveBeenNthCalledWith(
          i + 1,
          expect.objectContaining({ chainName: `TestChain${i}` }),
        );
      }
    });

    it('should handle concurrent handler creation attempts', async () => {
      const promises = Array(10)
        .fill(null)
        .map((_, index) => {
          const config = {
            ...mockEvmConfig,
            chainName: `ConcurrentChain${index}`,
          };
          return Promise.resolve(L1RedemptionHandlerFactory.createHandler(config));
        });

      const handlers = await Promise.all(promises);

      expect(handlers).toHaveLength(10);
      expect(handlers.every((h) => h instanceof L1RedemptionHandler)).toBe(true);
    });
  });

  describe('Config Validation Edge Cases', () => {
    it('should handle config with numeric chain type', () => {
      const numericConfig = {
        ...mockEvmConfig,
        chainType: 0 as any, // Numeric instead of string
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(numericConfig)).toThrow(
        'Unsupported chain type: 0',
      );
    });

    it('should handle config with boolean chain type', () => {
      const booleanConfig = {
        ...mockEvmConfig,
        chainType: true as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(booleanConfig)).toThrow(
        'Unsupported chain type: true',
      );
    });

    it('should handle config with array chain type', () => {
      const arrayConfig = {
        ...mockEvmConfig,
        chainType: ['EVM'] as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(arrayConfig)).toThrow(
        'Unsupported chain type: EVM',
      );
    });

    it('should handle config with object chain type', () => {
      const objectConfig = {
        ...mockEvmConfig,
        chainType: { type: 'EVM' } as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(objectConfig)).toThrow(
        'Unsupported chain type: [object Object]',
      );
    });

    it('should handle config with mixed case chain type', () => {
      const mixedCaseConfig = {
        ...mockEvmConfig,
        chainType: 'eVm' as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(mixedCaseConfig)).toThrow(
        'Unsupported chain type: eVm',
      );
    });

    it('should handle config with whitespace in chain type', () => {
      const whitespaceConfig = {
        ...mockEvmConfig,
        chainType: ' Evm ' as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(whitespaceConfig)).toThrow(
        'Unsupported chain type:  Evm ',
      );
    });

    it('should handle config with special characters in chain type', () => {
      const specialConfig = {
        ...mockEvmConfig,
        chainType: 'EVM!' as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(specialConfig)).toThrow(
        'Unsupported chain type: EVM!',
      );
    });
  });

  describe('Error Recovery and Diagnostics', () => {
    it('should provide meaningful error context for constructor failures', () => {
      const constructorError = new Error('Missing required configuration');
      constructorError.stack =
        'Error: Missing required configuration\n    at new L1RedemptionHandler';
      (L1RedemptionHandler as jest.MockedClass<typeof L1RedemptionHandler>).mockImplementationOnce(
        () => {
          throw constructorError;
        },
      );

      expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(
        'Missing required configuration',
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to create chain handler'),
      );
    });

    it('should handle out of memory errors gracefully', () => {
      const oomError = new Error('Maximum call stack size exceeded');
      (oomError as any).code = 'ERR_STACK_OVERFLOW';
      (L1RedemptionHandler as jest.MockedClass<typeof L1RedemptionHandler>).mockImplementationOnce(
        () => {
          throw oomError;
        },
      );

      expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(
        'Maximum call stack size exceeded',
      );
    });

    it('should handle circular reference in config', () => {
      const circularConfig: any = { ...mockEvmConfig };
      circularConfig.self = circularConfig; // Create circular reference

      // Should still work as the factory doesn't serialize the config
      const handler = L1RedemptionHandlerFactory.createHandler(circularConfig);

      expect(handler).toBeInstanceOf(L1RedemptionHandler);
      expect(L1RedemptionHandler).toHaveBeenCalledWith(circularConfig);
    });
  });

  describe('Chain Type Coverage', () => {
    it('should handle all unsupported chain types consistently', () => {
      const unsupportedTypes = [
        'Bitcoin',
        'Ethereum',
        'BSC',
        'Avalanche',
        'Fantom',
        'Harmony',
        'Moonbeam',
        'Celo',
        'Near',
        'Cosmos',
        'Polkadot',
        'Cardano',
        'Tezos',
        'Algorand',
        'Elrond',
        'Hedera',
        'Flow',
        'Waves',
        'EOS',
        'Tron',
      ];

      unsupportedTypes.forEach((chainType) => {
        const config = {
          ...mockEvmConfig,
          chainType: chainType as any,
        };

        expect(() => L1RedemptionHandlerFactory.createHandler(config)).toThrow(
          `Unsupported chain type: ${chainType}`,
        );

        expect(logger.error).toHaveBeenCalledWith(`Unsupported chain type: ${chainType}`);
      });
    });

    it('should handle future chain types gracefully', () => {
      const futureConfig = {
        ...mockEvmConfig,
        chainType: 'QuantumChain' as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(futureConfig)).toThrow(
        'Unsupported chain type: QuantumChain',
      );
    });
  });

  describe('Factory Method Behavior', () => {
    it('should not modify the input config', () => {
      const originalConfig = { ...mockEvmConfig };
      const configCopy = { ...originalConfig };

      L1RedemptionHandlerFactory.createHandler(originalConfig);

      expect(originalConfig).toEqual(configCopy);
    });

    it('should handle Symbol as chain type', () => {
      const symbolConfig = {
        ...mockEvmConfig,
        chainType: Symbol('EVM') as any,
      };

      expect(() => L1RedemptionHandlerFactory.createHandler(symbolConfig)).toThrow();
    });

    it('should handle very long chain names in config', () => {
      const longNameConfig = {
        ...mockEvmConfig,
        chainName: 'A'.repeat(1000),
      };

      const handler = L1RedemptionHandlerFactory.createHandler(longNameConfig);

      expect(handler).toBeInstanceOf(L1RedemptionHandler);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('A'.repeat(50)), // Log should contain at least part of the name
      );
    });

    it('should handle config with missing chainName', () => {
      const noNameConfig = {
        ...mockEvmConfig,
        chainName: undefined as any,
      };

      const handler = L1RedemptionHandlerFactory.createHandler(noNameConfig);

      expect(handler).toBeInstanceOf(L1RedemptionHandler);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('undefined'));
    });
  });

  describe('Constructor Propagation', () => {
    it('should propagate all types of errors from constructor', () => {
      const errorTypes = [
        { error: new TypeError('Type mismatch'), name: 'TypeError' },
        { error: new RangeError('Value out of range'), name: 'RangeError' },
        { error: new ReferenceError('Undefined reference'), name: 'ReferenceError' },
        { error: new SyntaxError('Invalid syntax'), name: 'SyntaxError' },
        { error: new EvalError('Eval error'), name: 'EvalError' },
      ];

      errorTypes.forEach(({ error, name }) => {
        (
          L1RedemptionHandler as jest.MockedClass<typeof L1RedemptionHandler>
        ).mockImplementationOnce(() => {
          throw error;
        });

        expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(error);
      });
    });

    it('should handle async errors in constructor', () => {
      // Note: Constructors can't be async, but they might trigger async operations
      const asyncError = new Error('Async initialization failed');
      (asyncError as any).isAsync = true;

      (L1RedemptionHandler as jest.MockedClass<typeof L1RedemptionHandler>).mockImplementationOnce(
        () => {
          throw asyncError;
        },
      );

      expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(asyncError);
    });
  });

  describe('Logging and Debugging', () => {
    it('should log appropriate messages for each chain type attempt', () => {
      // Test successful EVM creation
      L1RedemptionHandlerFactory.createHandler(mockEvmConfig);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to create chain handler for type: Evm'),
      );
      expect(logger.info).toHaveBeenCalledWith('Creating EVMChainHandler');

      // Clear mocks
      jest.clearAllMocks();

      // Test failed creation for other types
      try {
        L1RedemptionHandlerFactory.createHandler(mockSolanaConfig);
      } catch {
        // Expected to throw
      }

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to create chain handler for type: Solana'),
      );
      expect(logger.error).toHaveBeenCalledWith('Unsupported chain type: Solana');
    });

    it('should handle logging failures gracefully', () => {
      // Mock logger to throw
      (logger.info as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Logger failed');
      });

      // Factory should throw if logging fails
      expect(() => L1RedemptionHandlerFactory.createHandler(mockEvmConfig)).toThrow(
        'Logger failed',
      );
    });
  });

  describe('Thread Safety and State Management', () => {
    it('should not maintain state between calls', () => {
      const handler1 = L1RedemptionHandlerFactory.createHandler(mockEvmConfig);
      const handler2 = L1RedemptionHandlerFactory.createHandler(mockEvmConfig);

      // Each call should create a new instance
      expect(L1RedemptionHandler).toHaveBeenCalledTimes(2);

      // The factory itself should not maintain any state
      expect(Object.keys(L1RedemptionHandlerFactory)).toHaveLength(0);
    });

    it('should handle property additions to factory', () => {
      // Try to add properties to the factory
      (L1RedemptionHandlerFactory as any).customProp = 'test';

      // Factory should still work normally
      const handler = L1RedemptionHandlerFactory.createHandler(mockEvmConfig);
      expect(handler).toBeInstanceOf(L1RedemptionHandler);

      // Clean up
      delete (L1RedemptionHandlerFactory as any).customProp;
    });
  });
});
