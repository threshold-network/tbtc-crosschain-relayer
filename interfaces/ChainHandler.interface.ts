import type { TransactionReceipt } from '@ethersproject/providers';
import type { Deposit } from '../types/Deposit.type.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
import type { AnyChainConfig } from '../config/index.js';

/**
 * Interface for chain-specific handlers that define common functionality
 * across different blockchain implementations.
 */
export interface ChainHandlerInterface {
  config: AnyChainConfig;

  /**
   * Initialize the chain handler with necessary connections and contracts
   */
  initialize(): Promise<void>;

  /**
   * Set up blockchain event listeners
   */
  setupListeners(): Promise<void>;

  /**
   * Initialize a deposit on the L1 chain
   * @param deposit The deposit to initialize
   */
  initializeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined>;

  /**
   * Finalize a deposit on the L1 chain
   * @param deposit The deposit to finalize
   */
  finalizeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined>;

  /**
   * Check the status of a deposit on the chain.
   * For most handlers, this accepts a depositId (string).
   * For StarknetChainHandler, this accepts a Deposit object (for correct depositKey computation).
   * @param depositOrId The deposit ID (string) or Deposit object (Starknet).
   * @returns The current status as a numeric enum value, or null if not found.
   */
  checkDepositStatus(depositOrId: string | Deposit): Promise<DepositStatus | null>;

  /**
   * Get the latest block number from the chain
   */
  getLatestBlock(): Promise<number>;

  /**
   * Process deposits that should be initialized
   */
  processInitializeDeposits(): Promise<void>;

  /**
   * Process deposits that should be finalized
   */
  processFinalizeDeposits(): Promise<void>;

  /**
   * Check for past deposits that might have been missed
   * @param options Options for checking past deposits
   */
  checkForPastDeposits(options: { pastTimeInMinutes: number; latestBlock: number }): Promise<void>;

  /**
   * Indicates whether the handler supports checking for past L2 deposits.
   * Typically true if L2 listeners are used, false if using an endpoint.
   *
   * @returns {boolean} True if past deposit checking is supported, false otherwise.
   */
  supportsPastDepositCheck(): boolean;

  /**
   * Process all deposits that are in the AWAITING_WORMHOLE_VAA status.
   * This function will attempt to bridge the deposits using the Wormhole protocol.
   * @returns {Promise<void>} A promise that resolves when the bridging process is complete.
   */
  processWormholeBridging?(): Promise<void>;
}
