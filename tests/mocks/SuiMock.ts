import type { SuiEvent } from '@mysten/sui/client';
import { DepositStatus } from '../../types/DepositStatus.enum.js';
import type { Deposit } from '../../types/Deposit.type.js';
import { createTestDeposit } from './BlockchainMock.js';

/**
 * Mock SUI client for testing
 */
export class MockSuiClient {
  private events: SuiEvent[] = [];
  private checkpointSequence: number = 12345;
  private subscriptions: Map<string, (event: SuiEvent) => void> = new Map();

  constructor() {
    this.setupDefaultEvents();
  }

  private setupDefaultEvents(): void {
    // Add some default test events
    this.events = [
      {
        type: '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae::bitcoin_depositor::DepositInitialized',
        parsedJson: {
          deposit_key: 'mock-deposit-1',
          funding_tx_hash: '0xbitcoin1234567890123456789012345678901234567890123456789012345678',
          output_index: 0,
          depositor: '0xsui1234567890123456789012345678901234567890123456789012345678901234',
        },
        id: {
          txDigest: 'sui-tx-digest-1',
          eventSeq: '0',
        },
        packageId: '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae',
        sender: '0xsui1234567890123456789012345678901234567890123456789012345678901234',
        transactionModule: 'bitcoin_depositor',
        bcs: 'base64data',
        bcsEncoding: 'base64' as const,
        checkpoint: '12340',
      } as SuiEvent & { checkpoint: string },
      {
        type: '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae::bitcoin_depositor::DepositInitialized',
        parsedJson: {
          deposit_key: 'mock-deposit-2',
          funding_tx_hash: '0xbitcoin9876543210987654321098765432109876543210987654321098765432',
          output_index: 1,
          depositor: '0xsui9876543210987654321098765432109876543210987654321098765432109876',
        },
        id: {
          txDigest: 'sui-tx-digest-2',
          eventSeq: '1',
        },
        packageId: '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae',
        sender: '0xsui9876543210987654321098765432109876543210987654321098765432109876',
        transactionModule: 'bitcoin_depositor',
        bcs: 'base64data',
        bcsEncoding: 'base64' as const,
        checkpoint: '12341',
      } as SuiEvent & { checkpoint: string },
    ];
  }

  async getLatestCheckpointSequenceNumber(): Promise<string> {
    return this.checkpointSequence.toString();
  }

  async subscribeEvent(params: {
    filter: any; // Use any to avoid complex type matching for tests
    onMessage: (event: SuiEvent) => void;
  }): Promise<() => void> {
    const moveModule = (params.filter as any).MoveModule;
    const subscriptionId = `${moveModule?.package}-${moveModule?.module}`;
    this.subscriptions.set(subscriptionId, params.onMessage);

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(subscriptionId);
    };
  }

  async queryEvents(params: {
    query: any; // Use any to avoid complex type matching for tests
    cursor?: string | null;
    limit?: number;
    order?: 'ascending' | 'descending';
  }): Promise<{
    data: SuiEvent[];
    hasNextPage: boolean;
    nextCursor: string | null;
  }> {
    const limit = params.limit || 50;
    const startIndex = params.cursor ? parseInt(params.cursor) : 0;

    // Filter events based on the query
    let filteredEvents = this.events;
    const moveModule = (params.query as any).MoveModule;
    if (moveModule) {
      filteredEvents = this.events.filter(
        (event) =>
          event.type.includes(moveModule.package!) && event.type.includes(moveModule.module!),
      );
    }

    // Apply ordering
    if (params.order === 'ascending') {
      filteredEvents.sort(
        (a, b) => parseInt((a as any).checkpoint) - parseInt((b as any).checkpoint),
      );
    } else {
      filteredEvents.sort(
        (a, b) => parseInt((b as any).checkpoint) - parseInt((a as any).checkpoint),
      );
    }

    // Paginate
    const endIndex = Math.min(startIndex + limit, filteredEvents.length);
    const data = filteredEvents.slice(startIndex, endIndex);
    const hasNextPage = endIndex < filteredEvents.length;
    const nextCursor = hasNextPage ? endIndex.toString() : null;

    return {
      data,
      hasNextPage,
      nextCursor,
    };
  }

  async signAndExecuteTransaction(_params: {
    signer: any;
    transaction: any;
    options?: any;
  }): Promise<{
    digest: string;
    effects?: {
      status?: {
        status: 'success' | 'failure';
        error?: string;
      };
    };
    events?: SuiEvent[];
    objectChanges?: any[];
  }> {
    // Simulate successful transaction execution
    return {
      digest: `mock-sui-tx-${Date.now()}`,
      effects: {
        status: { status: 'success' },
      },
      events: [],
      objectChanges: [],
    };
  }

  // Test utilities
  addEvent(event: SuiEvent): void {
    this.events.push(event);
  }

  setCheckpointSequence(sequence: number): void {
    this.checkpointSequence = sequence;
  }

  simulateEvent(packageId: string, module: string, eventData: any): void {
    const event = {
      type: `${packageId}::${module}::DepositInitialized`,
      parsedJson: eventData,
      id: {
        txDigest: `mock-tx-${Date.now()}`,
        eventSeq: '0',
      },
      packageId,
      sender: '0xmocksender',
      transactionModule: module,
      bcs: 'base64data',
      bcsEncoding: 'base64' as const,
      checkpoint: this.checkpointSequence.toString(),
    } as SuiEvent & { checkpoint: string };

    this.addEvent(event);

    // Notify subscriptions
    this.subscriptions.forEach((callback, subscriptionId) => {
      if (subscriptionId.includes(packageId) && subscriptionId.includes(module)) {
        callback(event);
      }
    });
  }

  simulateTransactionFailure(): void {
    this.signAndExecuteTransaction = jest.fn().mockResolvedValue({
      digest: 'failed-tx-digest',
      effects: {
        status: {
          status: 'failure',
          error: 'Insufficient gas',
        },
      },
    });
  }

  reset(): void {
    this.events = [];
    this.subscriptions.clear();
    this.checkpointSequence = 12345;
    this.setupDefaultEvents();
  }
}

/**
 * Mock SUI keypair for testing
 */
export class MockSuiKeypair {
  public publicKey: string;

  constructor(publicKey: string = 'mock-sui-public-key') {
    this.publicKey = publicKey;
  }

  signData(data: Uint8Array): string {
    return `mock-signature-${data.length}`;
  }

  getPublicKey(): string {
    return this.publicKey;
  }
}

/**
 * Mock SUI transaction builder
 */
export class MockSuiTransaction {
  private calls: any[] = [];
  private gasPayment: any[] = [];

  moveCall(params: { target: string; arguments: any[]; typeArguments?: string[] }): void {
    this.calls.push({
      type: 'moveCall',
      target: params.target,
      arguments: params.arguments,
      typeArguments: params.typeArguments,
    });
  }

  setGasPayment(payment: any[]): void {
    this.gasPayment = payment;
  }

  object(objectId: string): string {
    return `object(${objectId})`;
  }

  pure(value: any): string {
    return `pure(${JSON.stringify(value)})`;
  }

  // Test utilities
  getCalls(): any[] {
    return this.calls;
  }

  getGasPayment(): any[] {
    return this.gasPayment;
  }

  reset(): void {
    this.calls = [];
    this.gasPayment = [];
  }
}

/**
 * Create mock SUI deposit events for testing
 */
export function createMockSuiDepositEvent(
  overrides: Partial<{
    depositKey: string;
    fundingTxHash: string;
    outputIndex: number;
    depositor: string;
    txDigest: string;
    checkpoint: string;
  }>,
): SuiEvent {
  const defaults = {
    depositKey: `mock-deposit-${Date.now()}`,
    fundingTxHash: '0xmockfundingtx1234567890123456789012345678901234567890123456789012',
    outputIndex: 0,
    depositor: '0xmockdepositor1234567890123456789012345678901234567890123456789012',
    txDigest: `mock-tx-digest-${Date.now()}`,
    checkpoint: Date.now().toString(),
  };

  const eventData = { ...defaults, ...overrides };

  return {
    type: '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae::bitcoin_depositor::DepositInitialized',
    parsedJson: {
      deposit_key: eventData.depositKey,
      funding_tx_hash: eventData.fundingTxHash,
      output_index: eventData.outputIndex,
      depositor: eventData.depositor,
    },
    id: {
      txDigest: eventData.txDigest,
      eventSeq: '0',
    },
    packageId: '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae',
    sender: eventData.depositor,
    transactionModule: 'bitcoin_depositor',
    bcs: 'base64data',
    bcsEncoding: 'base64' as const,
    checkpoint: eventData.checkpoint,
  } as SuiEvent & { checkpoint: string };
}

/**
 * Create mock SUI deposits for testing
 */
export function createMockSuiDeposit(overrides: Partial<Deposit> = {}): Deposit {
  const baseDeposit = createTestDeposit({
    status: DepositStatus.QUEUED,
    chainId: 'SuiTestnet',
    hashes: {
      btc: { btcTxHash: null },
      eth: { initializeTxHash: null, finalizeTxHash: null },
      solana: { bridgeTxHash: null },
      sui: {
        l2InitializeTxHash: 'sui-init-tx-hash',
        l2BridgeTxHash: null,
      },
    },
    wormholeInfo: {
      txHash: null,
      transferSequence: null,
      bridgingAttempted: false,
    },
  });

  return {
    ...baseDeposit,
    ...overrides,
  } as Deposit;
}

/**
 * Mock Wormhole context for SUI testing
 */
export class MockSuiWormholeContext {
  async getTBTCBridge(): Promise<{
    redeem: (sender: any, vaa: any) => any[];
  }> {
    return {
      redeem: jest
        .fn()
        .mockReturnValue([
          { type: 'mock-unsigned-transaction-1' },
          { type: 'mock-unsigned-transaction-2' },
        ]),
    };
  }

  async parseTransaction(_txHash: string): Promise<
    Array<{
      chain: string;
      emitter: string;
      sequence: bigint;
    }>
  > {
    return [
      {
        chain: 'Ethereum',
        emitter: '0x1234567890123456789012345678901234567890',
        sequence: BigInt(123),
      },
    ];
  }
}

/**
 * Mock VAA for testing
 */
export function createMockVAA(
  overrides: Partial<{
    binary: Uint8Array;
    sequence: number;
    emitterChain: number;
    emitterAddress: string;
  }> = {},
): any {
  const defaults = {
    binary: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    sequence: 123,
    emitterChain: 2, // Ethereum
    emitterAddress: '0x1234567890123456789012345678901234567890',
  };

  return { ...defaults, ...overrides };
}

/**
 * SUI test utilities
 */
export const SuiTestUtils = {
  /**
   * Generate a valid base64 encoded private key for testing
   */
  generateMockPrivateKey(): string {
    // Generate 32 bytes of mock data and base64 encode it
    const mockBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      mockBytes[i] = i + 1; // Simple pattern for testing
    }
    return Buffer.from(mockBytes).toString('base64');
  },

  /**
   * Generate a mock SUI object ID
   */
  generateMockObjectId(): string {
    return (
      '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    );
  },

  /**
   * Generate a mock SUI transaction digest
   */
  generateMockTxDigest(): string {
    return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  },

  /**
   * Create a mock SUI package address
   */
  generateMockPackageId(): string {
    return (
      '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    );
  },
};

// Export commonly used mocks
export const mockSuiClient = new MockSuiClient();
export const mockSuiKeypair = new MockSuiKeypair();
export const mockSuiTransaction = new MockSuiTransaction();
export const mockSuiWormholeContext = new MockSuiWormholeContext();
