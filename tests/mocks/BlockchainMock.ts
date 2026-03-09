import { ethers } from 'ethers';
import { EventEmitter } from 'events';

/**
 * Mock Ethereum provider for testing
 */
export class MockProvider extends EventEmitter {
  private blockNumber: number = 1000;
  private transactions: Map<string, any> = new Map();

  constructor() {
    super();
  }

  /**
   * Get the current block number
   */
  async getBlockNumber(): Promise<number> {
    return this.blockNumber;
  }

  /**
   * Get a block by number
   */
  async getBlock(blockNumber: number): Promise<any> {
    return {
      number: blockNumber,
      timestamp: Math.floor(Date.now() / 1000) - (this.blockNumber - blockNumber) * 15, // 15 seconds per block
      hash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
    };
  }

  /**
   * Get a transaction by hash
   */
  async getTransaction(hash: string): Promise<any> {
    if (this.transactions.has(hash)) {
      return this.transactions.get(hash);
    }
    return null;
  }

  /**
   * Get a transaction receipt
   */
  async getTransactionReceipt(hash: string): Promise<any> {
    if (this.transactions.has(hash)) {
      const tx = this.transactions.get(hash);
      return {
        ...tx,
        blockNumber: this.blockNumber - 5,
        status: 1, // Success
        logs: [],
      };
    }
    return null;
  }

  /**
   * Mock advancing blocks
   */
  async advanceBlocks(count: number): Promise<void> {
    this.blockNumber += count;
  }

  /**
   * Mock a transaction
   */
  mockTransaction(txHash: string, data: any): void {
    this.transactions.set(txHash, {
      hash: txHash,
      blockNumber: this.blockNumber,
      ...data,
    });
  }

  /**
   * Emit a mock event
   */
  emitEvent(eventName: string, ...args: any[]): void {
    this.emit(eventName, ...args);
  }
}

/**
 * Mock contract for testing
 */
export class MockContract extends EventEmitter {
  private address: string;
  private functions: Map<string, (...args: any[]) => any> = new Map();
  private provider: MockProvider;

  constructor(address: string, provider: MockProvider) {
    super();
    this.address = address;
    this.provider = provider;

    // Listen to provider events and re-emit them
    this.provider.on('*', (event: string, ...args: any[]) => {
      this.emit(event, ...args);
    });
  }

  /**
   * Mock a contract function
   */
  mockFunction(name: string, implementation: (...args: any[]) => any): void {
    this.functions.set(name, implementation);
  }

  /**
   * Call a contract function
   */
  async callFunction(name: string, ...args: any[]): Promise<any> {
    if (this.functions.has(name)) {
      const func = this.functions.get(name);
      return func!(...args);
    }
    throw new Error(`Function ${name} not mocked`);
  }

  /**
   * Mock the contract's methods
   */
  get(methodName: string, ...args: any[]): Promise<any> {
    return this.callFunction(methodName, ...args);
  }

  /**
   * Generate a mock transaction hash
   */
  generateTxHash(): string {
    return ethers.utils.hexlify(ethers.utils.randomBytes(32));
  }
}

/**
 * Create a test deposit object
 */
export function createTestDeposit(overrides: Partial<any> = {}): any {
  const depositId = overrides.id || ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const now = Date.now();

  return {
    id: depositId,
    fundingTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
    outputIndex: 0,
    hashes: {
      btc: {
        btcTxHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      },
      eth: {
        initializeTxHash: null,
        finalizeTxHash: null,
      },
    },
    receipt: {
      depositor: ethers.utils.hexlify(ethers.utils.randomBytes(20)),
      blindingFactor: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      walletPublicKeyHash: ethers.utils.hexlify(ethers.utils.randomBytes(20)),
      refundPublicKeyHash: ethers.utils.hexlify(ethers.utils.randomBytes(20)),
      refundLocktime: '1800000000',
      extraData: '0x',
    },
    owner: ethers.utils.hexlify(ethers.utils.randomBytes(20)),
    status: 'QUEUED',
    L1OutputEvent: {
      fundingTx: {
        txHash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        outputIndex: 0,
        value: ethers.utils.parseEther('0.1').toString(),
      },
      reveal: [
        ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        ethers.utils.hexlify(ethers.utils.randomBytes(20)),
        ethers.utils.hexlify(ethers.utils.randomBytes(32)),
      ],
      l2DepositOwner: ethers.utils.hexlify(ethers.utils.randomBytes(20)),
      l2Sender: ethers.utils.hexlify(ethers.utils.randomBytes(20)),
    },
    dates: {
      createdAt: now,
      initializationAt: null,
      finalizationAt: null,
      lastActivityAt: now,
    },
    error: null,
    ...overrides,
  };
}
