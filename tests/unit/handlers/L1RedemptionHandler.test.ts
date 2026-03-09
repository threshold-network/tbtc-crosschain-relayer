import { L1RedemptionHandler } from '../../../handlers/L1RedemptionHandler.js';
import { ethers, Wallet, providers } from 'ethers';
import { TBTC } from '@keep-network/tbtc-v2.ts';
import type { BigNumber } from 'ethers';
import { NETWORK } from '../../../config/schemas/common.schema.js';
import type { EvmChainConfig } from '../../../config/schemas/evm.chain.schema.js';
import logger, { logErrorContext } from '../../../utils/Logger.js';

// Mock external dependencies
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  Wallet: jest.fn(),
  providers: {
    JsonRpcProvider: jest.fn(),
  },
}));

jest.mock('@keep-network/tbtc-v2.ts', () => ({
  TBTC: {
    initializeSepolia: jest.fn(),
    initializeMainnet: jest.fn(),
  },
}));

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

describe('L1RedemptionHandler', () => {
  let handler: L1RedemptionHandler;
  let mockConfig: EvmChainConfig;
  let mockProvider: jest.Mocked<providers.JsonRpcProvider>;
  let mockWallet: jest.Mocked<Wallet>;
  let mockSdk: any;
  let mockL2Provider: jest.Mocked<providers.JsonRpcProvider>;
  let mockL2Signer: jest.Mocked<Wallet>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();

    // Mock provider
    mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1, name: 'homestead' }),
      waitForTransaction: jest.fn(),
    } as any;

    mockL2Provider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: 421614, name: 'arbitrum-sepolia' }),
    } as any;

    // Mock wallet
    mockWallet = {
      address: '0xRelayerAddress123456789012345678901234567890',
      provider: mockProvider,
      connect: jest.fn().mockReturnThis(),
    } as any;

    mockL2Signer = {
      address: '0xRelayerAddress123456789012345678901234567890',
      provider: mockL2Provider,
      connect: jest.fn().mockReturnThis(),
    } as any;

    // Mock TBTC SDK
    mockSdk = {
      redemptions: {
        relayRedemptionRequestToL1: jest.fn(),
      },
      initializeCrossChain: jest.fn(),
    };

    // Setup provider and wallet mocks
    (providers.JsonRpcProvider as unknown as jest.Mock).mockImplementation((url) => {
      if (url === 'http://l1-rpc.test') {
        return mockProvider;
      } else if (url === 'http://l2-rpc.test') {
        return mockL2Provider;
      }
      return mockProvider;
    });

    (Wallet as unknown as jest.Mock).mockImplementation((privateKey, provider) => {
      if (provider === mockL2Provider) {
        return mockL2Signer;
      }
      return mockWallet;
    });

    (TBTC.initializeSepolia as jest.Mock).mockResolvedValue(mockSdk);
    (TBTC.initializeMainnet as jest.Mock).mockResolvedValue(mockSdk);

    // Default config
    mockConfig = {
      chainName: 'ArbitrumSepolia',
      chainType: 'Evm',
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
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should construct successfully with valid config', () => {
      handler = new L1RedemptionHandler(mockConfig);

      expect(handler).toBeInstanceOf(L1RedemptionHandler);
      expect(handler.config).toEqual(mockConfig);
      expect(logger.debug).toHaveBeenCalledWith(
        'Constructing L1RedemptionHandler for ArbitrumSepolia',
      );
    });

    it('should initialize L1 components successfully', async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      expect(providers.JsonRpcProvider).toHaveBeenCalledWith('http://l1-rpc.test');
      expect(Wallet).toHaveBeenCalledWith(mockConfig.privateKey, mockProvider);
      expect(TBTC.initializeSepolia).toHaveBeenCalledWith(mockWallet, true);
      expect(logger.info).toHaveBeenCalledWith(
        'L1RedemptionHandler created for L1 at http://l1-rpc.test. Relayer L1 address: 0xRelayerAddress123456789012345678901234567890',
      );
    });

    it('should initialize mainnet SDK for mainnet config', async () => {
      const mainnetConfig = { ...mockConfig, network: NETWORK.MAINNET };
      handler = new L1RedemptionHandler(mainnetConfig);
      await handler.initialize();

      expect(TBTC.initializeMainnet).toHaveBeenCalledWith(mockWallet, true);
      expect(TBTC.initializeSepolia).not.toHaveBeenCalled();
    });

    it('should initialize cross-chain support successfully', async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      expect(providers.JsonRpcProvider).toHaveBeenCalledWith('http://l2-rpc.test');
      expect(mockSdk.initializeCrossChain).toHaveBeenCalledWith('Arbitrum', mockL2Signer);
      expect(logger.info).toHaveBeenCalledWith(
        'Initialized cross-chain support for ArbitrumSepolia in L1RedemptionHandler',
      );
    });

    it('should handle cross-chain initialization failure gracefully', async () => {
      mockSdk.initializeCrossChain.mockRejectedValue(new Error('Cross-chain init failed'));

      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      expect(logErrorContext).toHaveBeenCalledWith(
        'Failed to initialize cross-chain support for ArbitrumSepolia in L1RedemptionHandler',
        expect.any(Error),
      );
      // Should not throw, just log the error
    });

    it('should throw error if missing required L1 configuration', async () => {
      const invalidConfig = { ...mockConfig, l1Rpc: undefined } as any;
      handler = new L1RedemptionHandler(invalidConfig);

      await expect(handler.initialize()).rejects.toThrow(
        'Missing required L1 RPC/Contract/Vault/Network configuration for ArbitrumSepolia',
      );
    });

    it('should throw error if missing private key', async () => {
      const invalidConfig = { ...mockConfig, privateKey: undefined } as any;
      handler = new L1RedemptionHandler(invalidConfig);

      await expect(handler.initialize()).rejects.toThrow(
        'Missing required L1 RPC/Contract/Vault/Network configuration for ArbitrumSepolia',
      );
    });

    it('should throw error if missing network', async () => {
      const invalidConfig = { ...mockConfig, network: undefined } as any;
      handler = new L1RedemptionHandler(invalidConfig);

      await expect(handler.initialize()).rejects.toThrow(
        'Missing required L1 RPC/Contract/Vault/Network configuration for ArbitrumSepolia',
      );
    });

    it('should handle different chain names correctly', async () => {
      const configs = [
        { chainName: 'ArbitrumMainnet', expectedDestination: 'Arbitrum' },
        { chainName: 'BaseMainnet', expectedDestination: 'Base' },
        { chainName: 'BaseSepolia', expectedDestination: 'Base' },
      ];

      for (const { chainName, expectedDestination } of configs) {
        jest.clearAllMocks();
        const config = { ...mockConfig, chainName };
        handler = new L1RedemptionHandler(config);
        await handler.initialize();

        expect(mockSdk.initializeCrossChain).toHaveBeenCalledWith(
          expectedDestination,
          expect.any(Object),
        );
      }
    });
  });

  describe('relayRedemptionToL1', () => {
    let mockAmount: BigNumber;
    let mockSignedVaa: Uint8Array;
    const mockL2ChainName = 'ArbitrumSepolia';
    const mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';

    beforeEach(async () => {
      mockAmount = ethers.BigNumber.from('1000000000000000000'); // 1 token
      mockSignedVaa = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      // Reset mocks after initialization
      jest.clearAllMocks();
    });

    it('should successfully relay redemption to L1', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xL1TxHash123456'),
      };
      const mockReceipt = {
        status: 1,
        transactionHash: '0xL1TxHash123456',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt;

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBe('0xL1TxHash123456');
      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledWith(
        mockAmount,
        mockSignedVaa,
        'Arbitrum',
      );
      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith('0xL1TxHash123456', 1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('L1 redemption relay transaction successful!'),
      );
    });

    it('should handle transaction hash without toPrefixedString method', async () => {
      const mockReceipt = {
        status: 1,
        transactionHash: '0xL1TxHash789',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt;

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: {
          toString: jest.fn().mockReturnValue('L1TxHash789'), // No 0x prefix
        },
      });
      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBe('0xL1TxHash789'); // Should add 0x prefix
    });

    it('should handle transaction hash as plain string', async () => {
      const mockReceipt = {
        status: 1,
        transactionHash: '0xL1TxHashABC',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt;

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: 'L1TxHashABC',
      });
      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBe('0xL1TxHashABC');
    });

    it('should handle null targetChainTxHash', async () => {
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: null,
      });

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
    });

    it('should return null if transaction is reverted', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xRevertedTxHash'),
      };
      const mockReceipt = {
        status: 0, // Reverted
        transactionHash: '0xRevertedTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt;

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('L1 redemption relay transaction failed'),
        expect.any(Error),
      );
    });

    it('should handle timeout waiting for transaction confirmation', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xTimeoutTxHash'),
      };

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });

      // Simulate timeout error directly without real timers
      const timeoutError = new Error('Transaction wait timeout');
      mockProvider.waitForTransaction.mockRejectedValue(timeoutError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });

    it('should handle VAA already executed error', async () => {
      const error = new Error('VAA was already executed');
      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(error);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('This VAA has already been redeemed.');
    });

    it('should handle insufficient funds error', async () => {
      const error = new Error('insufficient funds for gas * price + value');
      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(error);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Insufficient funds for gas on L1.');
    });

    it('should handle generic errors with full details', async () => {
      const mockError = Object.assign(new Error('Something went wrong'), {
        name: 'CustomError',
        error: { code: 'NETWORK_ERROR' },
        transaction: { to: '0x123', data: '0xabc' },
        receipt: { status: 0 },
      });
      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(mockError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('"errorName":"CustomError"'),
        expect.any(Error),
      );
    });

    it('should handle non-Error objects thrown', async () => {
      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue('String error');

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });

    it('should log transaction details', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xLoggedTxHash'),
      };
      const mockReceipt = {
        status: 1,
        transactionHash: '0xLoggedTxHash',
        blockNumber: 67890,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt;

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt);

      await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      // Check initial attempt log
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          '"relayerAddress":"0xRelayerAddress123456789012345678901234567890"',
        ),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('"amount":"1000000000000000000"'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('"l2ChainName":"ArbitrumSepolia"'),
      );

      // Check submission log
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('"l1TransactionHash":"0xLoggedTxHash"'),
      );

      // Check success log
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"l1BlockNumber":67890'));
    });
  });

  describe('Edge cases', () => {
    it('should handle initialization being called multiple times', async () => {
      handler = new L1RedemptionHandler(mockConfig);

      await handler.initialize();
      jest.clearAllMocks();

      // Second initialization should not throw
      await handler.initialize();

      // Should reinitialize everything
      expect(TBTC.initializeSepolia).toHaveBeenCalledTimes(1);
    });

    it('should handle missing destination chain mapping', async () => {
      const unknownChainConfig = { ...mockConfig, chainName: 'UnknownChain' };
      handler = new L1RedemptionHandler(unknownChainConfig);

      await handler.initialize();

      // Should attempt to initialize with undefined destination
      expect(mockSdk.initializeCrossChain).toHaveBeenCalledWith(undefined, mockL2Signer);
    });

    it('should handle empty VAA array', async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      const result = await handler.relayRedemptionToL1(
        ethers.BigNumber.from('1000'),
        new Uint8Array(0), // Empty VAA
        'ArbitrumSepolia',
        '0xL2TxHash',
      );

      // Should still attempt to relay
      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalled();
    });

    it('should handle very large amounts', async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      const largeAmount = ethers.BigNumber.from('999999999999999999999999999999');
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xLargeTxHash'),
      };
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xLargeTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);

      const result = await handler.relayRedemptionToL1(
        largeAmount,
        new Uint8Array([1, 2, 3]),
        'ArbitrumSepolia',
        '0xL2TxHash',
      );

      expect(result).toBe('0xLargeTxHash');
      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledWith(
        largeAmount,
        expect.any(Uint8Array),
        'Arbitrum',
      );
    });
  });

  describe('Gas and Fee Management', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle gas price spike scenarios', async () => {
      const highGasError = new Error('Gas price too high');
      (highGasError as any).code = 'UNPREDICTABLE_GAS_LIMIT';

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(highGasError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });

    it('should handle replacement transaction underpriced errors', async () => {
      const replacementError = new Error('replacement transaction underpriced');
      (replacementError as any).code = 'REPLACEMENT_UNDERPRICED';

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(replacementError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });
  });

  describe('Network and Provider Issues', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle provider connection loss during transaction', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xTxHash'),
      };

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });

      const connectionError = new Error('Provider connection lost');
      (connectionError as any).code = 'NETWORK_ERROR';
      mockProvider.waitForTransaction.mockRejectedValue(connectionError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });

    it('should handle JSON-RPC rate limiting', async () => {
      const rateLimitError = new Error('Too many requests');
      (rateLimitError as any).code = 'SERVER_ERROR';
      (rateLimitError as any).statusCode = 429;

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(rateLimitError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
    });

    it('should handle provider returning null network', async () => {
      handler = new L1RedemptionHandler(mockConfig);

      // Mock network to be missing chainId which TBTC SDK needs
      mockProvider.getNetwork.mockResolvedValue({ name: 'unknown', chainId: 0 } as any);

      // TBTC SDK might not throw for null network, just use default
      await handler.initialize();

      // Handler should still be initialized
      expect((handler as any).sdk).toBeDefined();
    });
  });

  describe('VAA Validation and Edge Cases', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle VAA with maximum size', async () => {
      const maxSizeVaa = new Uint8Array(10000); // Large VAA
      maxSizeVaa.fill(1);

      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xMaxVaaTxHash'),
      };
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xMaxVaaTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);

      await handler.relayRedemptionToL1(
        mockAmount,
        maxSizeVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledWith(
        mockAmount,
        maxSizeVaa,
        'Arbitrum',
      );
    });

    it('should handle malformed VAA bytes', async () => {
      const malformedVaa = new Uint8Array([0xff, 0xff, 0xff]); // Invalid VAA structure

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(
        new Error('Invalid VAA structure'),
      );

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        malformedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalled();
    });

    it('should handle zero amount redemption', async () => {
      const zeroAmount = ethers.BigNumber.from(0);
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xZeroAmountTxHash'),
      };
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xZeroAmountTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);

      await handler.relayRedemptionToL1(
        zeroAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledWith(
        zeroAmount,
        mockSignedVaa,
        'Arbitrum',
      );
    });
  });

  describe('Memory Management and Cleanup', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(() => {
      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should properly clean up resources on error', async () => {
      handler = new L1RedemptionHandler(mockConfig);

      // Mock providers to fail during initialization
      (providers.JsonRpcProvider as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      await expect(handler.initialize()).rejects.toThrow('Network error');

      // Verify no lingering references
      expect((handler as any).l1Provider).toBeUndefined();
      expect((handler as any).l1Wallet).toBeUndefined();
      expect((handler as any).sdk).toBeUndefined();
    });

    it('should handle multiple concurrent relay requests', async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xConcurrentTxHash'),
      };

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });

      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xConcurrentTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);

      // Launch multiple concurrent requests
      const promises = Array(5)
        .fill(null)
        .map((_, index) =>
          handler.relayRedemptionToL1(
            mockAmount,
            new Uint8Array([index]),
            mockL2ChainName,
            `0xL2TxHash${index}`,
          ),
        );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r === '0xConcurrentTxHash')).toBe(true);
      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledTimes(5);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle config with minimal required fields', async () => {
      const minimalConfig: EvmChainConfig = {
        ...mockConfig,
        l1BitcoinDepositorAddress: '0x0000000000000000000000000000000000000000' as any,
        l1BitcoinDepositorStartBlock: 0 as any,
        l2BitcoinDepositorAddress: '0x0000000000000000000000000000000000000000' as any,
        l2BitcoinDepositorStartBlock: 0 as any,
      };

      handler = new L1RedemptionHandler(minimalConfig);
      await handler.initialize();

      // All required components should still be initialized
      expect((handler as any).l1Signer).toBeDefined();
      expect((handler as any).sdk).toBeDefined();
    });

    it('should handle very long private key', async () => {
      const configWithLongKey = {
        ...mockConfig,
        privateKey: '0x' + 'a'.repeat(64), // Max length private key
      };

      handler = new L1RedemptionHandler(configWithLongKey);
      await handler.initialize();

      expect(Wallet).toHaveBeenCalledWith(configWithLongKey.privateKey, expect.any(Object));
    });

    it('should handle special characters in chain name', async () => {
      const specialChainConfig = {
        ...mockConfig,
        chainName: 'Chain-Name_With.Special@Chars!',
      };

      handler = new L1RedemptionHandler(specialChainConfig);
      await handler.initialize();

      expect(logger.debug).toHaveBeenCalledWith(
        'Constructing L1RedemptionHandler for Chain-Name_With.Special@Chars!',
      );
    });
  });

  describe('Transaction State Management', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle pending transaction that never confirms', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xPendingTxHash'),
      };

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });

      // Mock a pending transaction that never resolves
      mockProvider.waitForTransaction.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      // This should eventually timeout (in real implementation)
      const resultPromise = handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      // In a real scenario, this would timeout
      // For testing, we'll just verify the call was made
      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalled();

      // Clean up the hanging promise
      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xPendingTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);
    });

    it('should handle transaction replaced by another', async () => {
      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xOriginalTxHash'),
      };

      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });

      const replacedError = new Error('Transaction was replaced');
      (replacedError as any).code = 'TRANSACTION_REPLACED';
      (replacedError as any).replacement = {
        hash: '0xReplacementTxHash',
      };

      mockProvider.waitForTransaction.mockRejectedValue(replacedError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalled();
    });
  });

  describe('Chain-Specific Behaviors', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(() => {
      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle Optimism-specific configurations', async () => {
      const optimismConfig = {
        ...mockConfig,
        chainName: 'OptimismSepolia',
        l2Rpc: 'https://sepolia.optimism.io',
      };

      handler = new L1RedemptionHandler(optimismConfig);
      await handler.initialize();

      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xOptimismTxHash'),
      };
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xOptimismTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        'OptimismSepolia',
        mockL2TransactionHash,
      );

      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledWith(
        mockAmount,
        mockSignedVaa,
        undefined, // OptimismSepolia not in chain mapping
      );
    });

    it('should handle Polygon-specific configurations', async () => {
      const polygonConfig = {
        ...mockConfig,
        chainName: 'PolygonMumbai',
        l2Rpc: 'https://rpc-mumbai.maticvigil.com',
      };

      handler = new L1RedemptionHandler(polygonConfig);
      await handler.initialize();

      const mockTxHash = {
        toPrefixedString: jest.fn().mockReturnValue('0xPolygonTxHash'),
      };
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: mockTxHash,
      });
      mockProvider.waitForTransaction.mockResolvedValue({
        status: 1,
        transactionHash: '0xPolygonTxHash',
        blockNumber: 12345,
        to: '0x0000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        contractAddress: null,
        transactionIndex: 0,
        logsBloom: '0x',
        gasUsed: ethers.BigNumber.from(0),
        cumulativeGasUsed: ethers.BigNumber.from(0),
        logs: [],
        byzantium: true,
        confirmations: 1,
        effectiveGasPrice: ethers.BigNumber.from(0),
        type: 2,
      } as unknown as providers.TransactionReceipt);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        'PolygonMumbai',
        mockL2TransactionHash,
      );

      expect(mockSdk.redemptions.relayRedemptionRequestToL1).toHaveBeenCalledWith(
        mockAmount,
        mockSignedVaa,
        undefined, // PolygonMumbai not in chain mapping
      );
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle nonce too low errors', async () => {
      const nonceError = new Error('nonce too low');
      (nonceError as any).code = 'NONCE_EXPIRED';

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(nonceError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });

    it('should handle invalid signature errors', async () => {
      const signatureError = new Error('invalid signature');
      (signatureError as any).code = 'INVALID_ARGUMENT';
      (signatureError as any).argument = 'signature';

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(signatureError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
    });
  });

  describe('SDK Integration Edge Cases', () => {
    let mockAmount: any;
    let mockSignedVaa: Uint8Array;
    let mockL2ChainName: string;
    let mockL2TransactionHash: string;

    beforeEach(async () => {
      handler = new L1RedemptionHandler(mockConfig);
      await handler.initialize();

      mockAmount = ethers.BigNumber.from(100000);
      mockSignedVaa = new Uint8Array([1, 2, 3, 4]);
      mockL2ChainName = 'ArbitrumSepolia';
      mockL2TransactionHash = '0xL2TxHash123456789012345678901234567890';
    });

    it('should handle SDK returning undefined targetChainTxHash', async () => {
      mockSdk.redemptions.relayRedemptionRequestToL1.mockResolvedValue({
        targetChainTxHash: undefined,
      });

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
    });

    it('should handle SDK throwing custom errors', async () => {
      const customError = {
        message: 'Custom SDK error',
        code: 'CUSTOM_SDK_ERROR',
        details: { reason: 'Invalid state' },
      };

      mockSdk.redemptions.relayRedemptionRequestToL1.mockRejectedValue(customError);

      const result = await handler.relayRedemptionToL1(
        mockAmount,
        mockSignedVaa,
        mockL2ChainName,
        mockL2TransactionHash,
      );

      expect(result).toBeNull();
      expect(logErrorContext).toHaveBeenCalledWith(
        expect.stringContaining('Error in relayRedemptionToL1'),
        expect.any(Error),
      );
    });

    it('should handle SDK cross-chain initialization returning null', async () => {
      handler = new L1RedemptionHandler(mockConfig);
      mockSdk.initializeCrossChain.mockResolvedValue(null);

      await handler.initialize();

      // Should not throw, handler should still be initialized
      expect((handler as any).sdk).toBeDefined();
    });
  });
});
