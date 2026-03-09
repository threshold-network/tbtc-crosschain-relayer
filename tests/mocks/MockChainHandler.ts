import type { TransactionReceipt } from '@ethersproject/providers';
import type { ChainHandlerInterface } from '../../interfaces/ChainHandler.interface.js';
import { DepositStatus } from '../../types/DepositStatus.enum.js';
import type { Deposit } from '../../types/Deposit.type.js';
import logger from '../../utils/Logger.js';
import { createTestDeposit } from './BlockchainMock.js';
import { BigNumber, ethers } from 'ethers';
import type { AnyChainConfig } from '../../config/index.js';
import { CHAIN_TYPE, NETWORK } from '../../config/schemas/common.schema.js';
import type { EvmChainConfig } from '../../config/schemas/evm.chain.schema.js';
import type { SolanaChainConfig } from '../../config/schemas/solana.chain.schema.js';
import type { SuiChainConfig } from '../../config/schemas/sui.chain.schema.js';
import type { StarknetChainConfig } from '../../config/schemas/starknet.chain.schema.js';

const mockReceipt = {
  to: '0x0000000000000000000000000000000000000000',
  from: '0x0000000000000000000000000000000000000000',
  contractAddress: '0x0000000000000000000000000000000000000000',
  transactionIndex: 0,
  gasUsed: BigNumber.from(21_000),
  logsBloom: '0x' + '0'.repeat(512),
  blockHash: '0x' + '0'.repeat(64),
  transactionHash: '0x' + '0'.repeat(64),
  logs: [],
  blockNumber: 1,
  cumulativeGasUsed: BigNumber.from(21_000),
  confirmations: 1,
  effectiveGasPrice: BigNumber.from(1),
  type: 2,
  status: 1,
  byzantium: true,
};

/**
 * Mock chain handler for testing
 */
export class MockChainHandler implements ChainHandlerInterface {
  public config: AnyChainConfig;
  private initialized: boolean = false;
  private deposits: Map<string, Deposit> = new Map();
  private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();
  private processingDelayMs: number = 100; // Simulate processing delay
  private services: any[] = []; // Mock services array
  private logger = logger; // Add logger property

  constructor(config: Partial<AnyChainConfig> = {}) {
    this.addTestDeposits();

    const determinedChainType = config?.chainType ?? CHAIN_TYPE.EVM;

    // Base properties common to all or having sensible defaults
    const baseProperties = {
      chainName: 'MockChain',
      network: NETWORK.TESTNET,
      useEndpoint: false,
      l1Rpc: 'http://localhost:8545',
      l2Rpc: 'http://localhost:8546',
      l2WsRpc: 'ws://localhost:8547',
      l1BitcoinDepositorAddress: ethers.constants.AddressZero,
      l2BitcoinDepositorAddress: ethers.constants.AddressZero,
      // Bitcoin Redeemer addresses removed - these contracts don't exist in tBTC v2
      l2WormholeGatewayAddress: ethers.constants.AddressZero,
      l2WormholeChainId: 0,
      vaultAddress: ethers.constants.AddressZero,
      blockExplorerUrl: '',
      tokenBridgeAddress: ethers.constants.AddressZero,
      wormholeRelayerAddress: ethers.constants.AddressZero,
      relayerFee: 0,
      maxRetries: 5,
      retryDelay: 5000,
      requestTimeout: 60000,
      pastEventsQueryLimit: 1000,
      startBlockOffset: 0,
      solanaCommitment: 'confirmed' as const,
      defaultGasLimit: 500000,
      ...config,
    };

    let finalConfig: AnyChainConfig;

    switch (determinedChainType) {
      case CHAIN_TYPE.EVM: {
        const evmConfig = {
          ...baseProperties,
          chainType: CHAIN_TYPE.EVM,
          privateKey:
            (config as EvmChainConfig).privateKey || ethers.Wallet.createRandom().privateKey,
          l2WsRpc: (config as EvmChainConfig).l2WsRpc || baseProperties.l2WsRpc,
          l2BitcoinDepositorAddress:
            (config as EvmChainConfig).l2BitcoinDepositorAddress ||
            baseProperties.l2BitcoinDepositorAddress,
          l2WormholeGatewayAddress:
            (config as EvmChainConfig).l2WormholeGatewayAddress ||
            baseProperties.l2WormholeGatewayAddress,
          l2WormholeChainId:
            (config as EvmChainConfig).l2WormholeChainId || baseProperties.l2WormholeChainId,
          l2BitcoinDepositorStartBlock: (config as EvmChainConfig).l2BitcoinDepositorStartBlock,
          endpointUrl: (config as EvmChainConfig).endpointUrl,
        };
        finalConfig = evmConfig as EvmChainConfig;
        break;
      }
      case CHAIN_TYPE.SOLANA: {
        const solanaConfig = {
          ...baseProperties,
          chainType: CHAIN_TYPE.SOLANA,
          solanaPrivateKey: (config as SolanaChainConfig).solanaPrivateKey || 'mockSolanaPrivKey',
          solanaCommitment: (config as SolanaChainConfig).solanaCommitment || 'confirmed',
        };
        finalConfig = solanaConfig as unknown as SolanaChainConfig;
        break;
      }
      case CHAIN_TYPE.SUI: {
        const suiConfig = {
          ...baseProperties,
          chainType: CHAIN_TYPE.SUI,
          suiPrivateKey: (config as SuiChainConfig).suiPrivateKey || 'mockSuiPrivKey',
          suiGasObjectId: (config as SuiChainConfig).suiGasObjectId,
        };
        finalConfig = suiConfig as unknown as SuiChainConfig;
        break;
      }
      case CHAIN_TYPE.STARKNET: {
        const starknetConfig = {
          ...baseProperties,
          chainType: CHAIN_TYPE.STARKNET,
        };
        finalConfig = starknetConfig as unknown as StarknetChainConfig;
        break;
      }
      default:
        logger.warn('MockChainHandler: Unknown chainType in config, defaulting to EVM.');
        finalConfig = {
          ...baseProperties,
          chainType: CHAIN_TYPE.EVM,
          privateKey: ethers.Wallet.createRandom().privateKey,
        } as EvmChainConfig;
    }

    this.config = finalConfig;

    // L2 Redemption functionality commented out since Bitcoin Redeemer contracts don't exist
    // if (config.enableL2Redemption) {
    //   const l2RedeemerAddress = `0x${'L2REDEEMER'.padEnd(40, '0')}`;
    //   this.services.push(
    //     new MockL2RedemptionService(config, l2RedeemerAddress, this.logger),
    //   );
    // }
  }

  /**
   * Add some test deposits for testing
   */
  private addTestDeposits(): void {
    // Add a queued deposit
    const queuedDeposit = createTestDeposit({
      status: 'QUEUED',
    }) as Deposit;
    this.deposits.set(queuedDeposit.id, queuedDeposit);

    // Add an initialized deposit
    const initializedDeposit = createTestDeposit({
      status: 'INITIALIZED',
      hashes: {
        btc: {
          btcTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        },
        eth: {
          initializeTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
          finalizeTxHash: null,
        },
      },
      dates: {
        createdAt: Date.now() - 3600 * 1000, // 1 hour ago
        initializationAt: Date.now() - 1800 * 1000, // 30 mins ago
        finalizationAt: null,
        lastActivityAt: Date.now() - 1800 * 1000, // 30 mins ago
      },
    }) as Deposit;
    this.deposits.set(initializedDeposit.id, initializedDeposit);

    // Add a finalized deposit
    const finalizedDeposit = createTestDeposit({
      status: 'FINALIZED',
      hashes: {
        btc: {
          btcTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        },
        eth: {
          initializeTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
          finalizeTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        },
      },
      dates: {
        createdAt: Date.now() - 7200 * 1000, // 2 hours ago
        initializationAt: Date.now() - 5400 * 1000, // 1.5 hours ago
        finalizationAt: Date.now() - 3600 * 1000, // 1 hour ago
        lastActivityAt: Date.now() - 3600 * 1000, // 1 hour ago
      },
    }) as Deposit;
    this.deposits.set(finalizedDeposit.id, finalizedDeposit);
  }

  /**
   * Initialize the chain handler
   */
  async initialize(): Promise<void> {
    logger.info('MockChainHandler: Initializing...');
    // Simulate async initialization
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info('MockChainHandler: Initialized.');
  }

  /**
   * Set up event listeners
   */
  async setupListeners(): Promise<void> {
    logger.info('MockChainHandler: Setting up listeners...');
    // Simulate listener setup
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info('MockChainHandler: Listeners set up.');
  }

  /**
   * Get the latest block
   */
  async getLatestBlock(): Promise<number> {
    logger.info('MockChainHandler: Getting latest block...');
    return Promise.resolve(12345); // Mock block number
  }

  /**
   * Check for past deposits
   */
  async checkForPastDeposits(options: {
    pastTimeInMinutes: number;
    latestBlock: number;
  }): Promise<void> {
    logger.info(
      `MockChainHandler: Checking for past deposits (last ${options.pastTimeInMinutes} min, latest block ${options.latestBlock})`,
    );
    // Simulate checking
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info('MockChainHandler: Past deposits check complete.');
  }

  /**
   * Initialize a deposit
   */
  async initializeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    logger.info(`Mock chain handler: Initializing deposit ${deposit.id}`);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, this.processingDelayMs));
    logger.info(`MockChainHandler: Deposit ${deposit.id} initialized.`);

    // Update deposit status
    if (deposit.status === DepositStatus.QUEUED) {
      const updatedDeposit = {
        ...deposit,
        status: DepositStatus.INITIALIZED,
        hashes: {
          ...deposit.hashes,
          eth: {
            ...deposit.hashes.eth,
            initializeTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
          },
        },
        dates: {
          ...deposit.dates,
          initializationAt: Date.now(),
          lastActivityAt: Date.now(),
        },
      } as Deposit;

      this.deposits.set(deposit.id, updatedDeposit);

      // Emit initialized event if listeners are set up
      this.emitEvent('DepositInitialized', deposit.id);
      return mockReceipt;
    }
  }

  /**
   * Finalize a deposit
   */
  async finalizeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    logger.info(`Mock chain handler: Finalizing deposit ${deposit.id}`);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, this.processingDelayMs));
    logger.info(`MockChainHandler: Deposit ${deposit.id} finalized.`);

    // Update deposit status
    if (deposit.status === DepositStatus.INITIALIZED) {
      const updatedDeposit = {
        ...deposit,
        status: DepositStatus.FINALIZED,
        hashes: {
          ...deposit.hashes,
          eth: {
            ...deposit.hashes.eth,
            finalizeTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
          },
        },
        dates: {
          ...deposit.dates,
          finalizationAt: Date.now(),
          lastActivityAt: Date.now(),
        },
      } as Deposit;
      this.deposits.set(deposit.id, updatedDeposit);

      // Emit finalized event if listeners are set up
      this.emitEvent('DepositFinalized', deposit.id);
      return mockReceipt;
    }
  }

  /**
   * Process deposits for initialization
   */
  async processInitializeDeposits(): Promise<void> {
    logger.info('MockChainHandler: Processing initialize deposits...');
    for (const deposit of this.deposits.values()) {
      if (deposit.status === DepositStatus.QUEUED) {
        await this.initializeDeposit(deposit);
      }
    }
    logger.info('MockChainHandler: Initialize deposits processing complete.');
  }

  /**
   * Process deposits for finalization
   */
  async processFinalizeDeposits(): Promise<void> {
    logger.info('MockChainHandler: Processing finalize deposits...');
    for (const deposit of this.deposits.values()) {
      if (deposit.status === DepositStatus.INITIALIZED) {
        await this.finalizeDeposit(deposit);
      }
    }
    logger.info('MockChainHandler: Finalize deposits processing complete.');
  }

  /**
   * Check deposit status (mock).
   * Accepts a depositId (string) or a Deposit object for compatibility with the main interface.
   * @param depositOrId - The deposit ID (string) or Deposit object.
   * @returns The deposit status or null if not found.
   */
  async checkDepositStatus(depositOrId: string | Deposit): Promise<DepositStatus | null> {
    let depositId: string;
    if (typeof depositOrId === 'string') {
      depositId = depositOrId;
      logger.info(`MockChainHandler: Checking status for depositId string: ${depositId}`);
    } else if (depositOrId && typeof depositOrId === 'object' && 'id' in depositOrId) {
      depositId = depositOrId.id;
      logger.info(`MockChainHandler: Checking status for Deposit object with id: ${depositId}`);
    } else {
      logger.warn('MockChainHandler: Received invalid argument to checkDepositStatus');
      return null;
    }
    const deposit = this.deposits.get(depositId);
    return deposit ? deposit.status : null;
  }

  /**
   * Add a new test deposit
   */
  addDeposit(deposit: Deposit): void {
    logger.info(`MockChainHandler: Adding deposit ${deposit.id}`);
    this.deposits.set(deposit.id, deposit);
  }

  /**
   * Get a deposit by ID
   */
  getDeposit(depositId: string): Deposit | undefined {
    logger.info(`MockChainHandler: Getting deposit ${depositId}`);
    return this.deposits.get(depositId);
  }

  /**
   * Get all deposits
   */
  getAllDeposits(): Deposit[] {
    logger.info('MockChainHandler: Getting all deposits');
    return Array.from(this.deposits.values());
  }

  /**
   * Register event listener
   */
  on(event: string, listener: (...args: any[]) => void): void {
    logger.info(`MockChainHandler: Registering listener for event ${event}`);
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(listener);
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: (...args: any[]) => void): void {
    logger.info(`MockChainHandler: Unregistering listener for event ${event}`);
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emitEvent(event: string, ...args: any[]): void {
    logger.info(`MockChainHandler: Emitting event ${event} with args:`, args);
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          logger.error(`Error in listener for event ${event}:`, error);
        }
      });
    }
  }

  /**
   * Set processing delay
   */
  setProcessingDelay(delayMs: number): void {
    logger.info(`MockChainHandler: Setting processing delay to ${delayMs}ms`);
    this.processingDelayMs = delayMs;
  }

  /**
   * Indicates whether the mock handler supports checking for past deposits.
   * For testing, we can make this configurable or default to true/false.
   * Let's default to true for now, assuming tests might need it.
   */
  supportsPastDepositCheck(): boolean {
    logger.info('MockChainHandler: supportsPastDepositCheck called');
    return true; // Mock supports this
  }
}
