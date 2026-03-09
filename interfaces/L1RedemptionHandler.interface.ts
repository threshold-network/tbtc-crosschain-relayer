import type { AnyChainConfig } from '../config/index.js';
import { BigNumber } from 'ethers';

/**
 * Interface for chain-specific handlers that define common functionality
 * across different blockchain implementations.
 */
export interface L1RedemptionHandlerInterface {
  config: AnyChainConfig;

  /**
   * Initialize the L1 redemption handler with necessary connections and contracts
   */
  initialize(): Promise<void>;

  /**
   * Relay a redemption to the L1 chain
   */
  relayRedemptionToL1(
    amount: BigNumber,
    signedVaa: Uint8Array,
    l2ChainName: string,
    l2TransactionHash: string,
  ): Promise<string | null>;
}
