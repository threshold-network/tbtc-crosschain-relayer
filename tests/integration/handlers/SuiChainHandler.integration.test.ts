// Mock problematic modules first to prevent deep loading
jest.mock('@wormhole-foundation/sdk', () => ({
  wormhole: jest.fn(),
  Wormhole: {
    parseAddress: jest.fn().mockReturnValue('mock-address'),
  },
  signSendWait: jest.fn(),
  __esModule: true,
}));

jest.mock('@wormhole-foundation/sdk-sui', () => ({
  getSuiSigner: jest.fn().mockResolvedValue({
    chain: jest.fn().mockReturnValue('Sui'),
    address: jest.fn().mockReturnValue('0xsuiaddress'),
  }),
  __esModule: true,
}));

import { SuiChainHandler } from '../../../handlers/SuiChainHandler.js';
import {
  SuiChainConfigSchema,
  type SuiChainConfig,
} from '../../../config/schemas/sui.chain.schema.js';
import { CHAIN_TYPE, NETWORK } from '../../../config/schemas/common.schema.js';
import { DepositStore } from '../../../utils/DepositStore.js';
import { DepositStatus } from '../../../types/DepositStatus.enum.js';
import type { Deposit } from '../../../types/Deposit.type.js';
import { createTestDeposit } from '../../mocks/BlockchainMock.js';

// Test type definitions
interface MockSuiClient {
  getLatestCheckpointSequenceNumber: jest.Mock;
  subscribeEvent: jest.Mock;
  queryEvents: jest.Mock;
  signAndExecuteTransaction?: jest.Mock;
}

// Test constants
const MOCK_ADDRESSES = {
  L1_CONTRACT: '0x1234567890123456789012345678901234567890',
  VAULT: '0xabcdeabcdeabcdeabcdeabcdeabcdeabcdeabcde',
  SUI_CONTRACT:
    '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae::bitcoin_depositor',
  WORMHOLE_GATEWAY: '0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9',
  WORMHOLE_CORE: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  TOKEN_BRIDGE: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  WRAPPED_TBTC:
    '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba::wrapped_tbtc::WrappedTBTC',
} as const;

const MOCK_OBJECT_IDS = {
  RECEIVER_STATE: '0x1111111111111111111111111111111111111111111111111111111111111111',
  GATEWAY_STATE: '0x2222222222222222222222222222222222222222222222222222222222222222',
  CAPABILITIES: '0x3333333333333333333333333333333333333333333333333333333333333333',
  TREASURY: '0x4444444444444444444444444444444444444444444444444444444444444444',
  TOKEN_STATE: '0x5555555555555555555555555555555555555555555555555555555555555555',
} as const;

// Helper functions
function createMockSuiClient(overrides: Partial<MockSuiClient> = {}): MockSuiClient {
  return {
    getLatestCheckpointSequenceNumber: jest.fn().mockResolvedValue('0'),
    subscribeEvent: jest.fn().mockResolvedValue(() => jest.fn()),
    queryEvents: jest.fn().mockResolvedValue({ data: [], hasNextPage: false, nextCursor: null }),
    ...overrides,
  };
}

// Mock SUI SDK for integration tests with enhanced ESM support
jest.mock('@mysten/sui/client', () => ({
  SuiClient: jest.fn(),
  getFullnodeUrl: jest.fn().mockReturnValue('https://fullnode.testnet.sui.io'),
  __esModule: true,
}));

jest.mock('@mysten/sui/keypairs/ed25519', () => ({
  Ed25519Keypair: {
    fromSecretKey: jest.fn().mockReturnValue({
      getPublicKey: jest.fn().mockReturnValue({
        toSuiAddress: jest
          .fn()
          .mockReturnValue('0xmocksuiaddress1234567890abcdef1234567890abcdef1234567890abcdef12'),
      }),
    }),
  },
  __esModule: true,
}));

jest.mock('@mysten/sui/transactions', () => ({
  Transaction: jest.fn(),
  __esModule: true,
}));

// Mock @mysten/bcs to prevent deep loading and transform errors
jest.mock('@mysten/bcs', () => ({
  fromBase64: jest.fn().mockReturnValue(new Uint8Array(32)),
  toBase64: jest.fn().mockReturnValue('base64-string'),
  BCS: jest.fn(),
  bcs: {
    bytes: jest.fn().mockReturnValue({
      serialize: jest.fn(),
      deserialize: jest.fn(),
      transform: jest.fn(),
    }),
    string: jest.fn().mockReturnValue({
      serialize: jest.fn(),
      deserialize: jest.fn(),
      transform: jest.fn(),
    }),
    u8: jest.fn().mockReturnValue({
      serialize: jest.fn(),
      deserialize: jest.fn(),
      transform: jest.fn(),
    }),
    u64: jest.fn().mockReturnValue({
      serialize: jest.fn(),
      deserialize: jest.fn(),
      transform: jest.fn(),
    }),
    vector: jest.fn().mockReturnValue({
      serialize: jest.fn(),
      deserialize: jest.fn(),
      transform: jest.fn(),
    }),
  },
  __esModule: true,
}));

jest.mock('@mysten/sui/cryptography', () => ({
  decodeSuiPrivateKey: jest.fn().mockReturnValue({
    schema: 'ED25519',
    secretKey: new Uint8Array(32),
  }),
  __esModule: true,
}));

// Mock the config module
jest.mock('../../../config/index.js', () => ({
  chainConfigs: {},
  getAvailableChainKeys: () => ['suiTestnet'],
}));

// Mock the SuiMoveEventParser
jest.mock('../../../utils/SuiMoveEventParser.js', () => ({
  parseDepositInitializedEvent: jest.fn().mockReturnValue({
    fundingTransaction: {
      version: 1,
      outputs: [{ value: '100000000' }],
    },
    reveal: {
      fundingOutputIndex: 0,
      blindingFactor: '0x' + '0'.repeat(64),
      walletPubKeyHash: '0x' + '0'.repeat(40),
      refundPubKeyHash: '0x' + '0'.repeat(40),
      refundLocktime: '0x00000000',
    },
    depositOwner: '0xdeposit-owner',
    sender: '0xsender',
    txDigest: 'sui-tx-digest',
  }),
}));

// Mock the Deposits utility module
jest.mock('../../../utils/Deposits.js', () => ({
  updateToAwaitingWormholeVAA: jest.fn().mockResolvedValue(undefined),
  updateToBridgedDeposit: jest.fn().mockResolvedValue(undefined),
  createDeposit: jest.fn().mockImplementation(() => ({
    id: `integration-test-deposit-${Date.now()}`,
    chainId: 'SuiTestnet',
    status: 'INITIALIZED',
    fundingTxHash: `0xfunding-${Date.now()}`,
    outputIndex: 0,
    hashes: {
      btc: { btcTxHash: `0xbtc-${Date.now()}` },
      eth: { initializeTxHash: null, finalizeTxHash: null },
      solana: { initializeTxHash: null, finalizeTxHash: null },
      sui: { initializeTxHash: null, finalizeTxHash: null },
      starknet: { initializeTxHash: null, finalizeTxHash: null },
    },
  })),
}));

describe('SuiChainHandler Integration Tests', () => {
  let handler: SuiChainHandler;
  let mockConfig: SuiChainConfig;

  beforeAll(() => {
    // Setup test configuration
    mockConfig = SuiChainConfigSchema.parse({
      chainName: 'SuiTestnet',
      network: NETWORK.TESTNET,
      l1Confirmations: 3,
      l1Rpc: 'http://localhost:8545',
      l2Rpc: 'https://fullnode.testnet.sui.io',
      l2WsRpc: 'wss://fullnode.testnet.sui.io',
      l1BitcoinDepositorAddress: MOCK_ADDRESSES.L1_CONTRACT,
      vaultAddress: MOCK_ADDRESSES.VAULT,
      l1BitcoinDepositorStartBlock: 1,
      l2BitcoinDepositorStartBlock: 0,
      enableL2Redemption: false,
      useEndpoint: false,
      chainType: CHAIN_TYPE.SUI,
      suiPrivateKey: 'dGVzdC1zdWktcHJpdmF0ZS1rZXktZm9yLXRlc3Rpbmc=',
      suiGasObjectId: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      l2BitcoinDepositorAddress: MOCK_ADDRESSES.SUI_CONTRACT,
      // l2WormholeGatewayAddress and l2WormholeChainId removed - not used in Sui chains
      // (replaced by gatewayStateId and native Wormhole SDK integration)
      // Required Sui-specific Wormhole and Bridge Object IDs
      wormholeCoreId: MOCK_ADDRESSES.WORMHOLE_CORE,
      tokenBridgeId: MOCK_ADDRESSES.TOKEN_BRIDGE,
      wrappedTbtcType: MOCK_ADDRESSES.WRAPPED_TBTC,
      receiverStateId: MOCK_OBJECT_IDS.RECEIVER_STATE,
      gatewayStateId: MOCK_OBJECT_IDS.GATEWAY_STATE,
      capabilitiesId: MOCK_OBJECT_IDS.CAPABILITIES,
      treasuryId: MOCK_OBJECT_IDS.TREASURY,
      tokenStateId: MOCK_OBJECT_IDS.TOKEN_STATE,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new SuiChainHandler(mockConfig);

    // Mock the wormhole property for integration tests
    (handler as any).wormhole = {
      getChain: jest.fn().mockReturnValue({
        getTBTCBridge: jest.fn().mockResolvedValue({
          redeem: jest.fn().mockReturnValue([]),
        }),
        parseTransaction: jest.fn().mockResolvedValue([
          {
            chain: 'Ethereum',
            emitter: '0x123',
            sequence: BigInt(1),
          },
        ]),
      }),
      getVaa: jest.fn().mockResolvedValue({
        binary: new Uint8Array([1, 2, 3, 4]),
      }),
    };
  });

  describe('Chain Handler Lifecycle', () => {
    it('should initialize and setup listeners successfully', async () => {
      const mockSuiClient = createMockSuiClient({
        getLatestCheckpointSequenceNumber: jest.fn().mockResolvedValue('12345'),
      });

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      const ed25519Module = await import('@mysten/sui/keypairs/ed25519');
      (ed25519Module.Ed25519Keypair.fromSecretKey as jest.Mock).mockReturnValue({
        getPublicKey: jest.fn().mockReturnValue({
          toSuiAddress: jest
            .fn()
            .mockReturnValue('0xmocksuiaddress1234567890abcdef1234567890abcdef1234567890abcdef12'),
        }),
      });

      // Initialize L2 components
      await (handler as any).initializeL2();

      // Verify SUI client was created
      expect((handler as any).suiClient).toBeDefined();
      expect((handler as any).keypair).toBeDefined();

      // Setup listeners
      await (handler as any).setupL2Listeners();

      // Verify polling interval was set
      expect((handler as any).pollingInterval).toBeDefined();
      expect((handler as any).pollingInterval).not.toBeNull();
    });

    it('should handle checkpoint-based block management', async () => {
      const mockSuiClient = createMockSuiClient({
        getLatestCheckpointSequenceNumber: jest.fn().mockResolvedValue('54321'),
      });

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      await (handler as any).initializeL2();

      const latestBlock = await handler.getLatestBlock();

      expect(latestBlock).toBe(54321);
      expect(mockSuiClient.getLatestCheckpointSequenceNumber).toHaveBeenCalled();
    });

    it('should support past deposit checking when properly configured', () => {
      expect(handler.supportsPastDepositCheck()).toBe(true);

      const endpointConfig = { ...mockConfig, useEndpoint: true };
      const endpointHandler = new SuiChainHandler(endpointConfig);
      expect(endpointHandler.supportsPastDepositCheck()).toBe(false);

      const noRpcConfig = { ...mockConfig };
      (noRpcConfig as any).l2Rpc = undefined;
      const noRpcHandler = new SuiChainHandler(noRpcConfig as any);
      expect(noRpcHandler.supportsPastDepositCheck()).toBe(false);
    });
  });

  describe('Deposit Processing Integration', () => {
    let testDeposit: Deposit;

    beforeEach(() => {
      testDeposit = createTestDeposit({
        status: DepositStatus.AWAITING_WORMHOLE_VAA,
        chainId: 'SuiTestnet',
        wormholeInfo: {
          txHash: '0xtest-tx-hash',
          transferSequence: '123',
          bridgingAttempted: false,
        },
      }) as Deposit;
    });

    it('should process Wormhole bridging workflow', async () => {
      // Mock DepositStore
      jest.spyOn(DepositStore, 'getByStatus').mockResolvedValue([testDeposit]);

      // Mock SUI client setup
      const mockSuiClient = {
        signAndExecuteTransaction: jest.fn().mockResolvedValue({
          digest: 'mock-transaction-digest',
          effects: { status: { status: 'success' } },
        }),
      };

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      const ed25519Module = await import('@mysten/sui/keypairs/ed25519');
      (ed25519Module.Ed25519Keypair.fromSecretKey as jest.Mock).mockReturnValue({
        getPublicKey: jest.fn().mockReturnValue({
          toSuiAddress: jest
            .fn()
            .mockReturnValue('0xmocksuiaddress1234567890abcdef1234567890abcdef1234567890abcdef12'),
        }),
      });

      await (handler as any).initializeL2();

      // Process Wormhole bridging
      await handler.processWormholeBridging();

      // Verify DepositStore was queried for awaiting deposits
      expect(DepositStore.getByStatus).toHaveBeenCalledWith(
        DepositStatus.AWAITING_WORMHOLE_VAA,
        'SuiTestnet',
      );

      // Verify Wormhole context was used
      expect((handler as any).wormhole.getChain).toHaveBeenCalledWith('Sui');
    });

    it('should handle deposit finalization with Wormhole sequence extraction', async () => {
      // Import ethers to get the correct topic signature
      const ethersModule = await import('ethers');
      const TOKENS_TRANSFERRED_SIG = ethersModule.utils.id(
        'TokensTransferredWithPayload(uint256,bytes32,uint64)',
      );

      // Mock parent finalizeDeposit
      const mockReceipt = {
        transactionHash: '0xfinalize-hash',
        logs: [
          {
            topics: [TOKENS_TRANSFERRED_SIG], // Use the correct topic signature
            data: '0x' + '0'.repeat(128), // Mock log data
          },
        ],
      };

      jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'finalizeDeposit')
        .mockResolvedValue(mockReceipt);

      // Mock L1 contract interface - need to ensure parseLog is called successfully
      (handler as any).l1BitcoinDepositorProvider = {
        interface: {
          parseLog: jest.fn().mockReturnValue({
            args: { transferSequence: { toString: () => '456' } },
          }),
        },
      };

      const result = await handler.finalizeDeposit(testDeposit);

      expect(result).toBe(mockReceipt);

      // Import the mocked module to access the mock function
      const { updateToAwaitingWormholeVAA } = require('../../../utils/Deposits.js');
      expect(updateToAwaitingWormholeVAA).toHaveBeenCalledWith(
        '0xfinalize-hash',
        testDeposit,
        '456',
      );
    });
  });

  describe('Event Processing Integration', () => {
    it('should process SUI Move events correctly', async () => {
      // Mock Bitcoin funding transaction bytes (minimal valid transaction)
      const mockFundingTxBytes = [
        ...new Uint8Array([1, 0, 0, 0]), // version (4 bytes)
        1, // input count (1 byte)
        ...new Uint8Array(32), // previous output hash (32 bytes)
        ...new Uint8Array([255, 255, 255, 255]), // previous output index (4 bytes)
        0, // script length (1 byte)
        ...new Uint8Array([255, 255, 255, 255]), // sequence (4 bytes)
        1, // output count (1 byte)
        ...new Uint8Array(8), // value (8 bytes)
        25, // script length (1 byte)
        118,
        169,
        20, // OP_DUP OP_HASH160 <20 bytes>
        ...Array.from({ length: 20 }, (_, i) => (i % 10) + 1), // 20 bytes of address
        136,
        172, // OP_EQUALVERIFY OP_CHECKSIG
        ...new Uint8Array(4), // locktime (4 bytes)
      ];

      // Mock Bitcoin reveal bytes (112 bytes total as expected by parseReveal)
      const mockRevealBytes = [
        ...new Uint8Array(4), // funding output index (4 bytes)
        ...Array.from({ length: 32 }, (_, i) => i + 1), // blindingFactor (32 bytes)
        ...Array.from({ length: 20 }, (_, i) => (i % 10) + 1), // wallet pubkey hash (20 bytes)
        ...Array.from({ length: 20 }, (_, i) => (i % 10) + 11), // refund pubkey hash (20 bytes)
        ...new Uint8Array(4), // refund locktime (4 bytes)
        ...Array.from({ length: 32 }, (_, i) => i + 1), // vault (32 bytes)
      ];

      // Convert SUI addresses to binary format (as they would come from Move events)
      const depositOwnerBytes = Array.from(Buffer.from('sui-depositor-address'.padEnd(32, '0')));
      const senderBytes = Array.from(Buffer.from('sui-sender-address'.padEnd(32, '0')));

      const mockEvent = {
        type: `${MOCK_ADDRESSES.SUI_CONTRACT}::DepositInitialized`,
        parsedJson: {
          funding_tx: mockFundingTxBytes,
          deposit_reveal: mockRevealBytes,
          deposit_owner: depositOwnerBytes,
          sender: senderBytes,
        },
        id: {
          txDigest: 'sui-transaction-digest',
        },
        checkpoint: 67890,
      };

      // Mock DepositStore methods
      jest.spyOn(DepositStore, 'getById').mockResolvedValue(null);
      jest.spyOn(DepositStore, 'create').mockResolvedValue(undefined);

      await (handler as any).initializeL2();

      await (handler as any).handleSuiDepositEvent(mockEvent);

      // Verify the event was processed
      expect(DepositStore.getById).toHaveBeenCalled();
      expect(DepositStore.create).toHaveBeenCalled();
    });

    it('should query past events with pagination', async () => {
      const mockEventsPage1 = {
        data: [
          {
            type: `${MOCK_ADDRESSES.SUI_CONTRACT}::DepositInitialized`,
            parsedJson: { deposit_key: 'past-deposit-1' },
          },
        ],
        hasNextPage: true,
        nextCursor: 'cursor-1',
      };

      const mockEventsPage2 = {
        data: [
          {
            type: `${MOCK_ADDRESSES.SUI_CONTRACT}::DepositInitialized`,
            parsedJson: { deposit_key: 'past-deposit-2' },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      };

      const mockSuiClient = {
        queryEvents: jest
          .fn()
          .mockResolvedValueOnce(mockEventsPage1)
          .mockResolvedValueOnce(mockEventsPage2),
      };

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      await (handler as any).initializeL2();

      const options = { pastTimeInMinutes: 120, latestBlock: 10000 };
      await handler.checkForPastDeposits(options);

      // Verify pagination worked correctly
      expect(mockSuiClient.queryEvents).toHaveBeenCalledTimes(2);
      expect(mockSuiClient.queryEvents).toHaveBeenNthCalledWith(1, {
        query: {
          MoveModule: {
            package: mockConfig.l2PackageId,
            module: 'BitcoinDepositor',
          },
        },
        cursor: null,
        limit: 50,
        order: 'descending',
      });
      expect(mockSuiClient.queryEvents).toHaveBeenNthCalledWith(2, {
        query: {
          MoveModule: {
            package: mockConfig.l2PackageId,
            module: 'BitcoinDepositor',
          },
        },
        cursor: 'cursor-1',
        limit: 50,
        order: 'descending',
      });
    });
  });

  describe('Error Recovery Integration', () => {
    it('should handle SUI RPC failures gracefully', async () => {
      const { SuiClient } = require('@mysten/sui/client');
      SuiClient.mockImplementation(() => {
        throw new Error('SUI RPC unreachable');
      });

      await expect((handler as any).initializeL2()).rejects.toThrow('SUI RPC unreachable');
    });

    it('should recover from checkpoint query failures', async () => {
      const mockSuiClient = {
        getLatestCheckpointSequenceNumber: jest
          .fn()
          .mockRejectedValue(new Error('Checkpoint query failed')),
      };

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      await (handler as any).initializeL2();

      const latestBlock = await handler.getLatestBlock();

      expect(latestBlock).toBe(0);
      expect(mockSuiClient.getLatestCheckpointSequenceNumber).toHaveBeenCalled();
    });

    it('should handle event subscription failures', async () => {
      const mockSuiClient = {
        subscribeEvent: jest.fn().mockRejectedValue(new Error('WebSocket connection failed')),
      };

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      const ed25519Module = await import('@mysten/sui/keypairs/ed25519');
      (ed25519Module.Ed25519Keypair.fromSecretKey as jest.Mock).mockReturnValue({
        getPublicKey: jest.fn().mockReturnValue({
          toSuiAddress: jest
            .fn()
            .mockReturnValue('0xmocksuiaddress1234567890abcdef1234567890abcdef1234567890abcdef12'),
        }),
      });

      // Mock wormhole to avoid initialization issues
      (handler as any).wormhole = {
        getChain: jest.fn().mockReturnValue({
          getTBTCBridge: jest.fn().mockResolvedValue({
            redeem: jest.fn().mockReturnValue([]),
          }),
        }),
      };

      await (handler as any).initializeL2();

      // Since SUI uses polling, not WebSocket, setupL2Listeners won't throw
      // Instead, we verify that it sets up polling interval correctly
      await (handler as any).setupL2Listeners();
      expect((handler as any).pollingInterval).toBeDefined();
    });
  });

  describe('Configuration Validation Integration', () => {
    it('should validate SUI-specific configuration requirements', async () => {
      // Test that invalid private key fails during initialization, not construction
      const invalidConfig = { ...mockConfig, suiPrivateKey: 'invalid-key' };
      const handlerWithInvalidKey = new SuiChainHandler(invalidConfig);

      await expect((handlerWithInvalidKey as any).initializeL2()).rejects.toThrow();

      expect(() => {
        const invalidConfig = { ...mockConfig, chainType: CHAIN_TYPE.EVM };
        new SuiChainHandler(invalidConfig as any);
      }).toThrow('Incorrect chain type Evm provided to SuiChainHandler');
    });

    it('should handle optional gas object configuration', () => {
      const configWithoutGasObject = { ...mockConfig, suiGasObjectId: undefined };
      const handlerWithoutGasObject = new SuiChainHandler(configWithoutGasObject);

      expect(handlerWithoutGasObject.config.suiGasObjectId).toBeUndefined();

      const configWithGasObject = { ...mockConfig, suiGasObjectId: '0xgasobjectid' };
      const handlerWithGasObject = new SuiChainHandler(configWithGasObject);

      expect(handlerWithGasObject.config.suiGasObjectId).toBe('0xgasobjectid');
    });
  });

  describe('Wormhole Integration End-to-End', () => {
    it('should complete full Wormhole workflow simulation', async () => {
      // Setup complete workflow mocks
      const mockSuiClient = {
        getLatestCheckpointSequenceNumber: jest.fn().mockResolvedValue('100000'),
        subscribeEvent: jest.fn().mockResolvedValue(() => jest.fn()),
        signAndExecuteTransaction: jest.fn().mockResolvedValue({
          digest: 'wormhole-bridge-digest',
          effects: { status: { status: 'success' } },
        }),
      };

      const suiClientModule = await import('@mysten/sui/client');
      (suiClientModule.SuiClient as jest.Mock).mockImplementation(() => mockSuiClient);

      const ed25519Module = await import('@mysten/sui/keypairs/ed25519');
      (ed25519Module.Ed25519Keypair.fromSecretKey as jest.Mock).mockReturnValue({
        getPublicKey: jest.fn().mockReturnValue({
          toSuiAddress: jest
            .fn()
            .mockReturnValue('0xmocksuiaddress1234567890abcdef1234567890abcdef1234567890abcdef12'),
        }),
      });

      // Mock complete Wormhole workflow
      (handler as any).wormhole.getVaa.mockResolvedValue({
        binary: new Uint8Array([1, 2, 3, 4, 5]),
      });

      await (handler as any).initializeL2();

      // Mock fetchVAAFromAPI to return a VAA
      (handler as any).fetchVAAFromAPI = jest.fn().mockResolvedValue('base64-encoded-vaa-data');

      // Test the complete workflow
      const testDeposit = {
        id: 'end-to-end-test',
        status: DepositStatus.AWAITING_WORMHOLE_VAA,
        wormholeInfo: {
          txHash: '0xe2e-test-hash',
          transferSequence: '999',
          bridgingAttempted: false,
        },
      } as Deposit;

      await (handler as any).bridgeSuiDeposit(testDeposit);

      // Verify Wormhole components were called
      expect((handler as any).wormhole.getChain).toHaveBeenCalledWith('Sui');
      expect((handler as any).fetchVAAFromAPI).toHaveBeenCalledWith('999');
    });
  });
});
