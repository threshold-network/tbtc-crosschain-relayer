import { TransactionReceipt } from "@ethersproject/providers"
import { ChainHandlerInterface } from '../../interfaces/ChainHandler.interface';
import { DepositStatus } from '../../types/DepositStatus.enum';
import { Deposit } from '../../types/Deposit.type';
import { LogMessage } from '../../utils/Logs';
import { createTestDeposit } from './BlockchainMock';
import { BigNumber, ethers } from 'ethers';

/**
 * Mock chain handler for testing
 */
export class MockChainHandler implements ChainHandlerInterface {
  private initialized: boolean = false;
  private deposits: Map<string, Deposit> = new Map();
  private listeners: Map<string, Function[]> = new Map();
  private processingDelayMs: number = 100; // Simulate processing delay

  constructor(config?: any) {
    // Initialize with test deposits
    this.addTestDeposits();
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
    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Set up event listeners
   */
  async setupListeners(): Promise<void> {
    LogMessage('Mock chain handler: Setting up listeners');
    return Promise.resolve();
  }

  /**
   * Get the latest block
   */
  async getLatestBlock(): Promise<number> {
    return Promise.resolve(1000);
  }

  /**
   * Check for past deposits
   */
  async checkForPastDeposits(options: {
    pastTimeInMinutes: number;
    latestBlock: number;
  }): Promise<void> {
    LogMessage(
      `Mock chain handler: Checking for past deposits (${options.pastTimeInMinutes} minutes)`
    );
    return Promise.resolve();
  }

  /**
   * Initialize a deposit
   */
  async initializeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    LogMessage(`Mock chain handler: Initializing deposit ${deposit.id}`);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, this.processingDelayMs));

    // Update deposit status
    if (deposit.status === DepositStatus.QUEUED) {
      const updatedDeposit = {
        ...deposit,
        status: DepositStatus.INITIALIZED,
        hashes: {
          ...deposit.hashes,
          eth: {
            ...deposit.hashes.eth,
            initializeTxHash: ethers.utils.hexlify(
              ethers.utils.randomBytes(32)
            ),
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
    }

    return {
      to: "0x0000000000000000000000000000000000000000",
      from: "0x0000000000000000000000000000000000000000",
      contractAddress: "0x0000000000000000000000000000000000000000",
      transactionIndex: 0,
      gasUsed: BigNumber.from(21_000),
      logsBloom: "0x" + "0".repeat(512),
      blockHash: "0x" + "0".repeat(64),
      transactionHash: "0x" + "0".repeat(64),
      logs: [],
      blockNumber: 1,
      cumulativeGasUsed: BigNumber.from(21_000),
      confirmations: 1,
      effectiveGasPrice: BigNumber.from(1),
      type: 2,
      status: 1,
      byzantium: true
    };
  }

  /**
   * Finalize a deposit
   */
  async finalizeDeposit(deposit: Deposit): Promise<void> {
    LogMessage(`Mock chain handler: Finalizing deposit ${deposit.id}`);

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, this.processingDelayMs));

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
    }

    return Promise.resolve();
  }

  /**
   * Process deposits for initialization
   */
  async processInitializeDeposits(): Promise<void> {
    LogMessage('Mock chain handler: Processing deposits for initialization');

    // Find queued deposits and initialize them
    for (const [id, deposit] of this.deposits.entries()) {
      if (deposit.status === DepositStatus.QUEUED) {
        await this.initializeDeposit(deposit);
      }
    }

    return Promise.resolve();
  }

  /**
   * Process deposits for finalization
   */
  async processFinalizeDeposits(): Promise<void> {
    LogMessage('Mock chain handler: Processing deposits for finalization');

    // Find initialized deposits and finalize them
    for (const [id, deposit] of this.deposits.entries()) {
      if (deposit.status === DepositStatus.INITIALIZED) {
        await this.finalizeDeposit(deposit);
      }
    }

    return Promise.resolve();
  }

  /**
   * Check deposit status
   */
  async checkDepositStatus(depositId: string): Promise<DepositStatus | null> {
    const deposit = this.deposits.get(depositId);

    if (!deposit) {
      return null;
    }

    return deposit.status;
  }

  /**
   * Add a new test deposit
   */
  addDeposit(deposit: Deposit): void {
    this.deposits.set(deposit.id, deposit);
  }

  /**
   * Get a deposit by ID
   */
  getDeposit(depositId: string): Deposit | undefined {
    return this.deposits.get(depositId);
  }

  /**
   * Get all deposits
   */
  getAllDeposits(): Deposit[] {
    return Array.from(this.deposits.values());
  }

  /**
   * Register event listener
   */
  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      return;
    }

    const listeners = this.listeners.get(event)!;
    const index = listeners.indexOf(listener);

    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit event
   */
  private emitEvent(event: string, ...args: any[]): void {
    if (!this.listeners.has(event)) {
      return;
    }

    const listeners = this.listeners.get(event)!;

    for (const listener of listeners) {
      listener(...args);
    }
  }

  /**
   * Set processing delay
   */
  setProcessingDelay(delayMs: number): void {
    this.processingDelayMs = delayMs;
  }

  /**
   * Indicates whether the mock handler supports checking for past deposits.
   * For testing, we can make this configurable or default to true/false.
   * Let's default to true for now, assuming tests might need it.
   */
  supportsPastDepositCheck(): boolean {
    // Return true by default for the mock, can be overridden in specific tests if needed.
    return true;
  }
}
