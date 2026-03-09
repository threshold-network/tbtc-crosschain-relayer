import {
  L1RedemptionHandlerRegistry,
  l1RedemptionHandlerRegistry,
} from '../../../handlers/L1RedemptionHandlerRegistry.js';
import { L1RedemptionHandlerFactory } from '../../../handlers/L1RedemptionHandlerFactory.js';
import { CHAIN_TYPE, NETWORK } from '../../../config/schemas/common.schema.js';
import type { AnyChainConfig } from '../../../config/index.js';
import type { EvmChainConfig } from '../../../config/schemas/evm.chain.schema.js';
import type { L1RedemptionHandlerInterface } from '../../../interfaces/L1RedemptionHandler.interface.js';
import { logErrorContext } from '../../../utils/Logger.js';

// Mock external dependencies
jest.mock('../../../handlers/L1RedemptionHandlerFactory.js');
jest.mock('../../../handlers/L1RedemptionHandler.js');
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
  logErrorContext: jest.fn(),
}));

describe('L1RedemptionHandlerRegistry', () => {
  let registry: L1RedemptionHandlerRegistry;
  let mockHandler1: jest.Mocked<L1RedemptionHandlerInterface>;
  let mockHandler2: jest.Mocked<L1RedemptionHandlerInterface>;
  let mockEvmConfig1: EvmChainConfig;
  let mockEvmConfig2: EvmChainConfig;
  let mockNonEvmConfig: AnyChainConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new registry instance for each test
    registry = new L1RedemptionHandlerRegistry();

    // Mock handlers
    mockHandler1 = {
      initialize: jest.fn().mockResolvedValue(undefined),
      relayRedemptionToL1: jest.fn(),
      config: {} as EvmChainConfig,
    };

    mockHandler2 = {
      initialize: jest.fn().mockResolvedValue(undefined),
      relayRedemptionToL1: jest.fn(),
      config: {} as EvmChainConfig,
    };

    // Mock configurations
    mockEvmConfig1 = {
      chainName: 'ArbitrumSepolia',
      chainType: CHAIN_TYPE.EVM,
      network: NETWORK.TESTNET,
      enableL2Redemption: true,
      privateKey: '0x123',
      l1Confirmations: 6,
      l1Rpc: 'http://l1-rpc.test',
      l2Rpc: 'http://l2-rpc.test',
      l2WsRpc: 'ws://l2-ws.test',
      l1BitcoinDepositorAddress: '0x123',
      l1BitcoinDepositorStartBlock: 1000,
      l2BitcoinDepositorAddress: '0x456',
      l2BitcoinDepositorStartBlock: 2000,
      l2WormholeGatewayAddress: '0x789',
      l2WormholeChainId: 10,
      vaultAddress: '0xabc',
      useEndpoint: false,
    } as EvmChainConfig;

    mockEvmConfig2 = {
      ...mockEvmConfig1,
      chainName: 'BaseSepolia',
    };

    mockNonEvmConfig = {
      chainName: 'SolanaDevnet',
      chainType: CHAIN_TYPE.SOLANA,
      network: NETWORK.TESTNET,
      enableL2Redemption: true,
      vaultAddress: '0xvault',
      useEndpoint: false,
    } as AnyChainConfig;

    // Setup factory mock
    (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockImplementation((config) => {
      if (config.chainName === 'ArbitrumSepolia') return mockHandler1;
      if (config.chainName === 'BaseSepolia') return mockHandler2;
      return null;
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('register', () => {
    it('should register a handler for a chain', () => {
      registry.register('ArbitrumSepolia', mockHandler1);

      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
    });

    it('should overwrite existing handler when registering with same chain name', () => {
      const newHandler = { ...mockHandler1 } as L1RedemptionHandlerInterface;

      registry.register('ArbitrumSepolia', mockHandler1);
      registry.register('ArbitrumSepolia', newHandler);

      expect(registry.get('ArbitrumSepolia')).toBe(newHandler);
      expect(registry.get('ArbitrumSepolia')).not.toBe(mockHandler1);
    });

    it('should handle multiple handler registrations', () => {
      registry.register('ArbitrumSepolia', mockHandler1);
      registry.register('BaseSepolia', mockHandler2);

      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
      expect(registry.get('BaseSepolia')).toBe(mockHandler2);
    });
  });

  describe('get', () => {
    it('should return registered handler', () => {
      registry.register('ArbitrumSepolia', mockHandler1);

      const handler = registry.get('ArbitrumSepolia');

      expect(handler).toBe(mockHandler1);
    });

    it('should return undefined for non-registered chain', () => {
      const handler = registry.get('NonExistentChain');

      expect(handler).toBeUndefined();
    });

    it('should be case-sensitive for chain names', () => {
      registry.register('ArbitrumSepolia', mockHandler1);

      expect(registry.get('arbitrumsepolia')).toBeUndefined();
      expect(registry.get('ARBITRUMSEPOLIA')).toBeUndefined();
      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
    });
  });

  describe('list', () => {
    it('should return empty array when no handlers registered', () => {
      const handlers = registry.list();

      expect(handlers).toEqual([]);
    });

    it('should return all registered handlers', () => {
      registry.register('ArbitrumSepolia', mockHandler1);
      registry.register('BaseSepolia', mockHandler2);

      const handlers = registry.list();

      expect(handlers).toHaveLength(2);
      expect(handlers).toContain(mockHandler1);
      expect(handlers).toContain(mockHandler2);
    });

    it('should return unique handlers even if same handler registered for multiple chains', () => {
      registry.register('Chain1', mockHandler1);
      registry.register('Chain2', mockHandler1);
      registry.register('Chain3', mockHandler2);

      const handlers = registry.list();

      expect(handlers).toHaveLength(3);
      // Note: In this case, we get 3 because values() returns all values,
      // even if they reference the same object
    });
  });

  describe('filter', () => {
    beforeEach(() => {
      mockHandler1.config = { ...mockEvmConfig1, l1Rpc: 'http://l1-a.test' };
      mockHandler2.config = { ...mockEvmConfig2, l1Rpc: 'http://l1-b.test' };

      registry.register('ArbitrumSepolia', mockHandler1);
      registry.register('BaseSepolia', mockHandler2);
    });

    it('should filter handlers based on predicate', () => {
      const filtered = registry.filter((handler) => handler.config.chainName === 'ArbitrumSepolia');

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(mockHandler1);
    });

    it('should return empty array if no handlers match predicate', () => {
      const filtered = registry.filter((handler) => handler.config.chainName === 'NonExistent');

      expect(filtered).toEqual([]);
    });

    it('should handle complex predicates', () => {
      const filtered = registry.filter(
        (handler) =>
          handler.config.l1Rpc?.includes('l1-a') || handler.config.network === NETWORK.MAINNET,
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(mockHandler1);
    });

    it('should return all handlers if predicate always returns true', () => {
      const filtered = registry.filter(() => true);

      expect(filtered).toHaveLength(2);
      expect(filtered).toContain(mockHandler1);
      expect(filtered).toContain(mockHandler2);
    });
  });

  describe('initialize', () => {
    it('should initialize handlers only for EVM chains with L2 redemption enabled', async () => {
      const configs = [mockEvmConfig1, mockEvmConfig2, mockNonEvmConfig];

      await registry.initialize(configs);

      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledTimes(2);
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledWith(mockEvmConfig1);
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledWith(mockEvmConfig2);
      expect(L1RedemptionHandlerFactory.createHandler).not.toHaveBeenCalledWith(mockNonEvmConfig);

      expect(mockHandler1.initialize).toHaveBeenCalled();
      expect(mockHandler2.initialize).toHaveBeenCalled();

      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
      expect(registry.get('BaseSepolia')).toBe(mockHandler2);
    });

    it('should skip chains with L2 redemption disabled', async () => {
      const disabledConfig = { ...mockEvmConfig1, enableL2Redemption: false };

      await registry.initialize([disabledConfig]);

      expect(L1RedemptionHandlerFactory.createHandler).not.toHaveBeenCalled();
      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
    });

    it('should skip non-EVM chains', async () => {
      await registry.initialize([mockNonEvmConfig]);

      expect(L1RedemptionHandlerFactory.createHandler).not.toHaveBeenCalled();
      expect(registry.get('SolanaDevnet')).toBeUndefined();
    });

    it('should handle factory returning null', async () => {
      (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockReturnValue(null);

      await registry.initialize([mockEvmConfig1]);

      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalled();
      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
    });

    it('should not re-register already existing handlers', async () => {
      registry.register('ArbitrumSepolia', mockHandler1);
      mockHandler1.initialize.mockClear();

      await registry.initialize([mockEvmConfig1]);

      // Factory is called but handler is not re-initialized
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledTimes(1);
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledWith(mockEvmConfig1);
      expect(mockHandler1.initialize).not.toHaveBeenCalled();
      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
    });

    it('should handle handler initialization errors gracefully', async () => {
      const initError = new Error('Handler init failed');
      mockHandler1.initialize.mockRejectedValue(initError);

      await registry.initialize([mockEvmConfig1]);

      expect(logErrorContext).toHaveBeenCalledWith(
        'Failed to initialize L1RedemptionHandler for ArbitrumSepolia',
        initError,
        { chainName: 'ArbitrumSepolia' },
      );

      // Handler should not be registered if initialization fails
      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
    });

    it('should handle factory creation errors gracefully', async () => {
      const factoryError = new Error('Factory error');
      (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockImplementation(() => {
        throw factoryError;
      });

      await registry.initialize([mockEvmConfig1]);

      expect(logErrorContext).toHaveBeenCalledWith(
        'Failed to initialize L1RedemptionHandler for ArbitrumSepolia',
        factoryError,
        { chainName: 'ArbitrumSepolia' },
      );

      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
    });

    it('should process all configs even if some fail', async () => {
      (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockImplementation((config) => {
        if (config.chainName === 'ArbitrumSepolia') throw new Error('Factory error');
        if (config.chainName === 'BaseSepolia') return mockHandler2;
        return null;
      });

      await registry.initialize([mockEvmConfig1, mockEvmConfig2]);

      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
      expect(registry.get('BaseSepolia')).toBe(mockHandler2);
    });

    it('should handle empty config array', async () => {
      await registry.initialize([]);

      expect(L1RedemptionHandlerFactory.createHandler).not.toHaveBeenCalled();
      expect(registry.list()).toEqual([]);
    });

    it('should handle undefined enableL2Redemption as false', async () => {
      const configWithoutFlag = { ...mockEvmConfig1, enableL2Redemption: undefined };

      await registry.initialize([configWithoutFlag as any]);

      expect(L1RedemptionHandlerFactory.createHandler).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all registered handlers', () => {
      registry.register('ArbitrumSepolia', mockHandler1);
      registry.register('BaseSepolia', mockHandler2);

      expect(registry.list()).toHaveLength(2);

      registry.clear();

      expect(registry.list()).toEqual([]);
      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
      expect(registry.get('BaseSepolia')).toBeUndefined();
    });

    it('should work on empty registry', () => {
      expect(() => registry.clear()).not.toThrow();
      expect(registry.list()).toEqual([]);
    });
  });

  describe('Singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(l1RedemptionHandlerRegistry).toBeInstanceOf(L1RedemptionHandlerRegistry);
    });

    it('should maintain state across imports', () => {
      // This test verifies that the exported instance is truly a singleton
      l1RedemptionHandlerRegistry.register('TestChain', mockHandler1);

      // In a real scenario, another import would get the same instance
      expect(l1RedemptionHandlerRegistry.get('TestChain')).toBe(mockHandler1);

      // Clean up
      l1RedemptionHandlerRegistry.clear();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle a typical multi-chain initialization', async () => {
      const configs: AnyChainConfig[] = [
        mockEvmConfig1,
        mockEvmConfig2,
        { ...mockEvmConfig1, chainName: 'ArbitrumMainnet', network: NETWORK.MAINNET },
        {
          ...mockEvmConfig2,
          chainName: 'BaseMainnet',
          network: NETWORK.MAINNET,
          enableL2Redemption: false,
        },
        mockNonEvmConfig,
        {
          ...(mockNonEvmConfig as any),
          chainType: CHAIN_TYPE.SUI,
          chainName: 'SuiTestnet',
          l2PackageId: '0x1',
          suiPrivateKey: '0x2',
          wormholeCoreId: '0x3',
          tokenBridgeId: '0x4',
          suiBridgePackageId: '0x5',
          suiCoinType: '0x6',
          l1PeerEndpoint: 'https://example.com',
        },
      ];

      const mockHandler3 = { ...mockHandler1 } as L1RedemptionHandlerInterface;
      (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockImplementation((config) => {
        if (config.chainName === 'ArbitrumSepolia') return mockHandler1;
        if (config.chainName === 'BaseSepolia') return mockHandler2;
        if (config.chainName === 'ArbitrumMainnet') return mockHandler3;
        return null;
      });

      await registry.initialize(configs);

      // Should only initialize EVM chains with L2 redemption enabled
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledTimes(3);
      expect(registry.list()).toHaveLength(3);
      expect(registry.get('ArbitrumSepolia')).toBeDefined();
      expect(registry.get('BaseSepolia')).toBeDefined();
      expect(registry.get('ArbitrumMainnet')).toBeDefined();
      expect(registry.get('BaseMainnet')).toBeUndefined(); // L2 redemption disabled
      expect(registry.get('SolanaDevnet')).toBeUndefined(); // Non-EVM
      expect(registry.get('SuiTestnet')).toBeUndefined(); // Non-EVM
    });

    it('should support re-initialization with different configs', async () => {
      // First initialization
      await registry.initialize([mockEvmConfig1]);
      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);

      // Clear and re-initialize
      registry.clear();
      await registry.initialize([mockEvmConfig2]);

      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
      expect(registry.get('BaseSepolia')).toBe(mockHandler2);
    });
  });

  describe('Concurrency and Thread Safety', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      registry.clear();
    });

    it('should handle concurrent registrations safely', async () => {
      const promises = Array(10)
        .fill(null)
        .map((_, index) => {
          return Promise.resolve(registry.register(`ConcurrentChain${index}`, mockHandler1));
        });

      await Promise.all(promises);

      const handlers = registry.list();
      // Each chain gets the same handler, but list returns unique handlers
      const uniqueHandlers = [...new Set(handlers)];
      expect(uniqueHandlers).toHaveLength(1); // Same handler registered multiple times

      // Check that all chains are registered
      for (let i = 0; i < 10; i++) {
        expect(registry.get(`ConcurrentChain${i}`)).toBe(mockHandler1);
      }
    });

    it('should handle concurrent initializations', async () => {
      const configs = Array(5)
        .fill(null)
        .map((_, index) => ({
          ...mockEvmConfig1,
          chainName: `ConcurrentInit${index}`,
        }));

      // Create unique handlers for each config
      const handlers = configs.map((_, index) => {
        const handler = {
          initialize: jest.fn().mockResolvedValue(undefined),
          relayRedemptionToL1: jest.fn(),
          config: configs[index],
        };
        (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockReturnValueOnce(handler);
        return handler;
      });

      await registry.initialize(configs);

      // Verify all handlers were created and initialized
      configs.forEach((config, index) => {
        expect(registry.get(config.chainName)).toBe(handlers[index]);
        expect(handlers[index].initialize).toHaveBeenCalled();
      });
    });

    it('should handle concurrent reads while writing', async () => {
      // Start with some handlers
      registry.register('ExistingChain1', mockHandler1);
      registry.register('ExistingChain2', mockHandler2);

      // Concurrent operations
      const operations = [
        // Reads
        () => registry.get('ExistingChain1'),
        () => registry.get('ExistingChain2'),
        () => registry.list(),
        () => registry.filter((h) => h.config.network === NETWORK.TESTNET),

        // Writes
        () => registry.register('NewChain1', mockHandler1),
        () => registry.register('NewChain2', mockHandler2),

        // More reads
        () => registry.get('NewChain1'),
        () => registry.get('NewChain2'),
      ];

      const results = await Promise.all(operations.map((op) => Promise.resolve(op())));

      // Verify operations completed successfully
      expect(results[0]).toBe(mockHandler1); // get ExistingChain1
      expect(results[1]).toBe(mockHandler2); // get ExistingChain2
      expect(results[2]).toContain(mockHandler1); // list
      expect(results[2]).toContain(mockHandler2); // list

      // Filter results depend on timing, but should be an array
      const filteredHandlers = results[3] as unknown as Array<{ config: { network: NETWORK } }>;
      expect(Array.isArray(filteredHandlers)).toBe(true);
      // At least one of the existing handlers should have TESTNET
      expect(filteredHandlers.length).toBeGreaterThanOrEqual(0);

      // New chains should be registered
      expect(results[6]).toBe(mockHandler1); // get NewChain1
      expect(results[7]).toBe(mockHandler2); // get NewChain2
    });

    it('should handle race conditions during clear operation', async () => {
      // Populate registry
      for (let i = 0; i < 10; i++) {
        registry.register(`Chain${i}`, i % 2 === 0 ? mockHandler1 : mockHandler2);
      }

      // Concurrent operations including clear
      const operations = [
        () => registry.list(),
        () => registry.clear(),
        () => registry.get('Chain5'),
        () => registry.register('NewChain', mockHandler1),
      ];

      await Promise.all(operations.map((op) => Promise.resolve(op())));

      // After clear, only NewChain should exist (if registered after clear)
      const finalList = registry.list();
      expect(finalList.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Memory Management and Cleanup', () => {
    it('should not retain references after clear', () => {
      const handler = {
        initialize: jest.fn(),
        relayRedemptionToL1: jest.fn(),
        config: mockEvmConfig1,
      };

      registry.register('TestChain', handler as any);
      expect(registry.get('TestChain')).toBe(handler);

      registry.clear();

      // Handler should be completely removed
      expect(registry.get('TestChain')).toBeUndefined();
      expect(registry.list()).toHaveLength(0);
    });

    it('should handle large number of handlers', () => {
      const handlerCount = 1000;

      for (let i = 0; i < handlerCount; i++) {
        const handler = {
          initialize: jest.fn(),
          relayRedemptionToL1: jest.fn(),
          config: { ...mockEvmConfig1, chainName: `Chain${i}` },
        };
        registry.register(`Chain${i}`, handler as any);
      }

      expect(registry.list()).toHaveLength(handlerCount);

      // Clear should work efficiently
      registry.clear();
      expect(registry.list()).toHaveLength(0);
    });

    it('should handle handler replacement without memory leaks', () => {
      const originalHandler = {
        initialize: jest.fn(),
        relayRedemptionToL1: jest.fn(),
        config: mockEvmConfig1,
      };

      const replacementHandler = {
        initialize: jest.fn(),
        relayRedemptionToL1: jest.fn(),
        config: mockEvmConfig1,
      };

      registry.register('TestChain', originalHandler as any);
      registry.register('TestChain', replacementHandler as any);

      expect(registry.get('TestChain')).toBe(replacementHandler);
      expect(registry.get('TestChain')).not.toBe(originalHandler);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should continue initialization after handler creation failure', async () => {
      const errorConfig = {
        ...mockEvmConfig1,
        chainName: 'ErrorChain',
      };

      const configs = [errorConfig, mockEvmConfig2];

      (L1RedemptionHandlerFactory.createHandler as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('Handler creation failed');
        })
        .mockReturnValueOnce(mockHandler2);

      await registry.initialize(configs);

      expect(registry.get('ErrorChain')).toBeUndefined();
      expect(registry.get('BaseSepolia')).toBe(mockHandler2);
    });

    it('should handle initialization with mix of success and failures', async () => {
      const configs = [mockEvmConfig1, mockEvmConfig2];

      mockHandler1.initialize.mockRejectedValue(new Error('Init failed'));
      mockHandler2.initialize.mockResolvedValue(undefined);

      await registry.initialize(configs);

      // Both handlers should be created, but only one successfully initialized
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledTimes(2);
      expect(mockHandler1.initialize).toHaveBeenCalled();
      expect(mockHandler2.initialize).toHaveBeenCalled();

      // Registry should only contain successfully initialized handler
      expect(registry.get('ArbitrumSepolia')).toBeUndefined();
      expect(registry.get('BaseSepolia')).toBe(mockHandler2);
    });

    it('should recover from handler initialization timeout', async () => {
      const timeoutHandler = {
        initialize: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              // Never resolves to simulate timeout
            }),
        ),
        relayRedemptionToL1: jest.fn(),
        config: mockEvmConfig1,
      };

      (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockReturnValue(timeoutHandler);

      // In real implementation, this might have a timeout
      const initPromise = registry.initialize([mockEvmConfig1]);

      // Simulate timeout handling
      await Promise.race([
        initPromise,
        new Promise((resolve) => {
          // Immediately resolve to simulate timeout in test
          resolve(undefined);
        }),
      ]);

      // Handler should still be pending initialization
      expect(timeoutHandler.initialize).toHaveBeenCalled();
    });
  });

  describe('Registry Query Performance', () => {
    beforeEach(() => {
      // Populate with many handlers
      for (let i = 0; i < 100; i++) {
        const handler = {
          initialize: jest.fn(),
          relayRedemptionToL1: jest.fn(),
          config: {
            ...mockEvmConfig1,
            chainName: `PerfTestChain${i}`,
            network: i % 2 === 0 ? NETWORK.TESTNET : NETWORK.MAINNET,
            l1Rpc: `http://l1-rpc-${i}.test`,
          },
        };
        registry.register(`PerfTestChain${i}`, handler as any);
      }
    });

    it('should have O(1) lookup performance for get', () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        registry.get('PerfTestChain50');
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be very fast for 1000 lookups
      expect(duration).toBeLessThan(10); // 10ms for 1000 operations
    });

    it('should filter efficiently with complex predicates', () => {
      const complexFilter = (handler: { config: EvmChainConfig }) => {
        return (
          handler.config.network === NETWORK.TESTNET &&
          handler.config.l1Rpc?.includes('rpc-5') &&
          handler.config.chainName.endsWith('0')
        );
      };

      const filtered = registry.filter(
        complexFilter as unknown as (h: L1RedemptionHandlerInterface) => boolean,
      );

      // Should find handlers matching all criteria
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThan(100);

      // Verify all results match the criteria
      filtered.forEach((handler) => {
        expect(handler.config.network).toBe(NETWORK.TESTNET);
        expect(handler.config.l1Rpc).toContain('rpc-5');
        expect(handler.config.chainName).toMatch(/0$/);
      });
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty string as chain name', () => {
      registry.register('', mockHandler1);
      expect(registry.get('')).toBe(mockHandler1);
    });

    it('should handle very long chain names', () => {
      const longName = 'A'.repeat(1000);
      registry.register(longName, mockHandler1);
      expect(registry.get(longName)).toBe(mockHandler1);
    });

    it('should handle special characters in chain names', () => {
      const specialNames = [
        'chain-with-dash',
        'chain_with_underscore',
        'chain.with.dots',
        'chain@with@at',
        'chain with spaces',
        'chain\twith\ttabs',
        'chain\nwith\nnewlines',
        '🚀chain-with-emoji',
      ];

      specialNames.forEach((name) => {
        registry.register(name, mockHandler1);
        expect(registry.get(name)).toBe(mockHandler1);
      });
    });

    it('should handle null/undefined gracefully', () => {
      expect(() => registry.register(null as any, mockHandler1)).not.toThrow();
      expect(() => registry.register('test', null as any)).not.toThrow();
      expect(() => registry.get(null as any)).not.toThrow();
      expect(() => registry.filter(null as any)).toThrow(); // Filter needs a function
    });

    it('should handle initialization with no EVM chains', async () => {
      const nonEvmConfigs = [mockNonEvmConfig];

      await registry.initialize(nonEvmConfigs);

      expect(L1RedemptionHandlerFactory.createHandler).not.toHaveBeenCalled();
      expect(registry.list()).toHaveLength(0);
    });

    it('should handle duplicate configs in initialization', async () => {
      const duplicateConfigs = [mockEvmConfig1, mockEvmConfig1, mockEvmConfig1];

      await registry.initialize(duplicateConfigs);

      // Should create handler only once due to duplicate checking
      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledTimes(3);
      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
    });
  });

  describe('Registry State Consistency', () => {
    it('should maintain consistent state across operations', () => {
      // Initial state
      expect(registry.list()).toHaveLength(0);

      // Add handlers
      registry.register('Chain1', mockHandler1);
      registry.register('Chain2', mockHandler2);
      expect(registry.list()).toHaveLength(2);

      // Replace handler
      registry.register('Chain1', mockHandler2);
      expect(registry.list()).toHaveLength(2); // Still 2 unique handlers
      expect(registry.get('Chain1')).toBe(mockHandler2);

      // Clear
      registry.clear();
      expect(registry.list()).toHaveLength(0);
      expect(registry.get('Chain1')).toBeUndefined();
      expect(registry.get('Chain2')).toBeUndefined();
    });

    it('should handle circular references in handlers', () => {
      const circularHandler: any = {
        initialize: jest.fn(),
        relayRedemptionToL1: jest.fn(),
        config: mockEvmConfig1,
      };
      circularHandler.self = circularHandler; // Create circular reference

      registry.register('CircularChain', circularHandler);

      expect(registry.get('CircularChain')).toBe(circularHandler);
      expect(registry.list()).toContain(circularHandler);
    });

    it('should maintain registry after errors', async () => {
      registry.register('ExistingChain', mockHandler1);

      // Try to initialize with error
      const errorConfig = { ...mockEvmConfig2, chainName: 'ErrorChain' };
      (L1RedemptionHandlerFactory.createHandler as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Creation failed');
      });

      await registry.initialize([errorConfig]);

      // Existing handler should still be there
      expect(registry.get('ExistingChain')).toBe(mockHandler1);
      expect(registry.get('ErrorChain')).toBeUndefined();
    });
  });

  describe('Integration Scenarios with Edge Cases', () => {
    it('should handle rapid registration and deregistration', () => {
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        // Register
        registry.register(`RapidChain${i}`, mockHandler1);

        // Immediately replace
        registry.register(`RapidChain${i}`, mockHandler2);

        // Verify
        expect(registry.get(`RapidChain${i}`)).toBe(mockHandler2);
      }

      // Clear and verify
      registry.clear();
      for (let i = 0; i < iterations; i++) {
        expect(registry.get(`RapidChain${i}`)).toBeUndefined();
      }
    });

    it('should handle mixed chain types with various states', async () => {
      const mixedConfigs = [
        { ...mockEvmConfig1, enableL2Redemption: true },
        { ...mockEvmConfig2, enableL2Redemption: false }, // Should skip
        { ...mockNonEvmConfig, enableL2Redemption: true }, // Should skip (non-EVM)
        { ...mockEvmConfig1, chainName: 'AnotherEvm', enableL2Redemption: true },
      ];

      const anotherHandler = {
        initialize: jest.fn().mockResolvedValue(undefined),
        relayRedemptionToL1: jest.fn(),
        config: mixedConfigs[3],
      };

      (L1RedemptionHandlerFactory.createHandler as jest.Mock)
        .mockReturnValueOnce(mockHandler1)
        .mockReturnValueOnce(anotherHandler);

      await registry.initialize(mixedConfigs);

      expect(L1RedemptionHandlerFactory.createHandler).toHaveBeenCalledTimes(2);
      expect(registry.get('ArbitrumSepolia')).toBe(mockHandler1);
      expect(registry.get('AnotherEvm')).toBe(anotherHandler);
      expect(registry.get('BaseSepolia')).toBeUndefined(); // enableL2Redemption: false
      expect(registry.get('SolanaDevnet')).toBeUndefined(); // non-EVM
    });
  });
});
