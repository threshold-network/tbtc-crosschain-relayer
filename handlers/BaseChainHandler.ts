import { Network, Wormhole, wormhole } from "@wormhole-foundation/sdk";

import solana from "@wormhole-foundation/sdk/solana";
import sui from "@wormhole-foundation/sdk/sui";
import evm from "@wormhole-foundation/sdk/evm";

import { BigNumber, ethers } from 'ethers';
import { TransactionReceipt } from "@ethersproject/providers"
import { NonceManager } from '@ethersproject/experimental';

import { ChainHandlerInterface } from '../interfaces/ChainHandler.interface';
import { ChainConfig, NETWORK } from '../types/ChainConfig.type';
import { Deposit } from '../types/Deposit.type';
import { LogError, LogMessage, LogWarning } from '../utils/Logs';
import {
  getJsonById,
  getAllJsonOperationsByStatus,
} from '../utils/JsonUtils';
import {
  // createDeposit, // Keep if used by L2 listeners implementations - moved to EVM handler for now
  updateToInitializedDeposit,
  updateToFinalizedDeposit,
  updateLastActivity,
  // getDepositId, // Keep if used by L2 listeners implementations - moved to EVM handler for now
} from '../utils/Deposits';
// import { getFundingTxHash } from '../utils/GetTransactionHash'; // Keep if used by L2 listeners implementations - moved to EVM handler for now
import { DepositStatus } from '../types/DepositStatus.enum';

import { L1BitcoinDepositorABI } from '../interfaces/L1BitcoinDepositor';
import { TBTCVaultABI } from '../interfaces/TBTCVault';
import { logDepositError } from '../utils/AuditLog';

export abstract class BaseChainHandler implements ChainHandlerInterface {
  protected l1Provider: ethers.providers.JsonRpcProvider;
  protected l1Signer: ethers.Wallet;
  protected nonceManagerL1: NonceManager;
  protected l1BitcoinDepositor: ethers.Contract; // For sending L1 txs
  protected tbtcVault: ethers.Contract; // For sending L1 txs (though not used currently)
  protected l1BitcoinDepositorProvider: ethers.Contract; // For L1 reads/events
  protected tbtcVaultProvider: ethers.Contract; // For L1 events
  protected config: ChainConfig;
  protected wormhole: Wormhole<Network>;

  protected readonly TIME_TO_RETRY = 1000 * 60 * 5; // 5 minutes

  constructor(config: ChainConfig) {
    this.config = config;
    LogMessage(`Constructing BaseChainHandler for ${this.config.chainName}`);
  }

  async initialize(): Promise<void> {
    LogMessage(`Initializing Base L1 components for ${this.config.chainName}`);

    // --- L1 Setup ---
    if (
      !this.config.l1Rpc ||
      !this.config.privateKey ||
      !this.config.l1ContractAddress ||
      !this.config.vaultAddress ||
      !this.config.network
    ) {
      throw new Error(
        `Missing required L1 configuration for ${this.config.chainName}`
      );
    }

    const ethereumNetwork = this.config.network === NETWORK.DEVNET
      ? NETWORK.TESTNET
      : this.config.network;

    this.wormhole = await wormhole(
      ethereumNetwork,
      [evm, solana, sui],
      {
        chains: {
          Solana: {
            rpc: this.config.l2Rpc,
          },
        },
      }
    )
    this.l1Provider = new ethers.providers.JsonRpcProvider(this.config.l1Rpc);
    this.l1Signer = new ethers.Wallet(this.config.privateKey, this.l1Provider);
    this.nonceManagerL1 = new NonceManager(this.l1Signer);

    // L1 Contracts for transactions
    this.l1BitcoinDepositor = new ethers.Contract(
      this.config.l1ContractAddress,
      L1BitcoinDepositorABI,
      this.nonceManagerL1
    );
    this.tbtcVault = new ethers.Contract( // Keep for completeness, though not sending txs currently
      this.config.vaultAddress,
      TBTCVaultABI,
      this.l1Signer // Use l1Signer here, not nonceManagerL1 unless needed
    );

    // L1 Contracts for reading/listening
    this.l1BitcoinDepositorProvider = new ethers.Contract(
      this.config.l1ContractAddress,
      L1BitcoinDepositorABI,
      this.l1Provider
    );
    this.tbtcVaultProvider = new ethers.Contract(
      this.config.vaultAddress,
      TBTCVaultABI,
      this.l1Provider
    );
    LogMessage(`Base L1 components initialized for ${this.config.chainName}`);

    // --- L2 Setup (delegated to subclasses) ---
    await this.initializeL2();

    LogMessage(`Chain handler fully initialized for ${this.config.chainName}`);
  }

  async setupListeners(): Promise<void> {
    LogMessage(`Setting up Base L1 listeners for ${this.config.chainName}`);
    await this.setupL1Listeners();
    LogMessage(
      `Setting up L2 listeners (delegated) for ${this.config.chainName}`
    );
    await this.setupL2Listeners();
    LogMessage(
      `All event listeners setup complete for ${this.config.chainName}`
    );
  }

  // --- L1 Listener Setup ---
  protected async setupL1Listeners(): Promise<void> {
    this.tbtcVaultProvider.on(
      'OptimisticMintingFinalized',
      (minter, depositKey, depositor, optimisticMintingDebt) => {
        try {
          const BigDepositKey = BigNumber.from(depositKey);
          const depositId = BigDepositKey.toString();
          const deposit: Deposit | null = getJsonById(depositId);
          if (deposit) {
            LogMessage(
              `Received OptimisticMintingFinalized event for Deposit ID: ${deposit.id}`
            );
            // Check if already finalized to avoid redundant calls/logs
            if (deposit.status !== DepositStatus.FINALIZED) {
              this.finalizeDeposit(deposit); // Call finalizeDeposit to handle the process
            } else {
              LogMessage(
                `Deposit ${deposit.id} already finalized locally. Ignoring event.`
              );
            }
          } else {
            LogWarning(
              `Received OptimisticMintingFinalized event for unknown Deposit Key: ${depositId}`
            );
          }
        } catch (error: any) {
          LogError(
            `Error in OptimisticMintingFinalized handler: ${error.message ?? error}`,
            error
          );
          logDepositError(
            'unknown',
            `Error processing OptimisticMintingFinalized event for key ${depositKey?.toString()}`,
            error
          );
        }
      }
    );
    LogMessage(
      `TBTCVault OptimisticMintingFinalized listener setup for ${this.config.chainName}`
    );
  }

  // --- Core Deposit Logic (L1 Interactions) ---
  async initializeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    // Check if already processed locally to avoid redundant L1 calls
    if (
      deposit.status === DepositStatus.INITIALIZED ||
      deposit.status === DepositStatus.FINALIZED
    ) {
      LogWarning(
        `INITIALIZE | Deposit already processed locally | ID: ${deposit.id} | STATUS: ${DepositStatus[deposit.status]}`
      );
      return;
    }
    if (!deposit.L1OutputEvent) {
      const errorMsg = 'Missing L1OutputEvent data for initialization';
      LogError(
        `INITIALIZE | ERROR | Missing L1OutputEvent data | ID: ${deposit.id}`,
        new Error(errorMsg)
      );
      logDepositError(deposit.id, errorMsg, new Error(errorMsg));
      updateToInitializedDeposit(deposit, null, 'Missing L1OutputEvent data'); // Mark as error
      return;
    }

    try {
      LogMessage(`INITIALIZE | Pre-call checking... | ID: ${deposit.id}`);
      // Pre-call check against L1BitcoinDepositor using the provider instance
      await this.l1BitcoinDepositorProvider.callStatic.initializeDeposit(
        deposit.L1OutputEvent.fundingTx,
        deposit.L1OutputEvent.reveal,
        deposit.L1OutputEvent.l2DepositOwner
      );
      LogMessage(`INITIALIZE | Pre-call successful | ID: ${deposit.id}`);

      const currentNonce =
        await this.nonceManagerL1.getTransactionCount('latest');
      LogMessage(
        `INITIALIZE | Sending transaction with nonce ${currentNonce} | ID: ${deposit.id}`
      );

      // Send transaction using L1BitcoinDepositor with nonce manager
      const tx = await this.l1BitcoinDepositor.initializeDeposit(
        deposit.L1OutputEvent.fundingTx,
        deposit.L1OutputEvent.reveal,
        deposit.L1OutputEvent.l2DepositOwner,
        { nonce: currentNonce }
      );

      LogMessage(
        `INITIALIZE | Waiting to be mined | ID: ${deposit.id} | TxHash: ${tx.hash}`
      );
      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      LogMessage(
        `INITIALIZE | Transaction mined | ID: ${deposit.id} | TxHash: ${receipt.transactionHash} | Block: ${receipt.blockNumber}`
      );

      // Update the deposit status in the JSON storage upon successful mining
      updateToInitializedDeposit(deposit, receipt, undefined); // Pass receipt for txHash etc.

      return receipt; // Return the receipt for further processing if needed
    } catch (error: any) {
      // Error Handling - Check if it's a specific revert reason or common issue
      const reason =
        error.reason ??
        error.error?.message ??
        error.message ??
        'Unknown error';
      LogError(
        `INITIALIZE | ERROR | ID: ${deposit.id} | Reason: ${reason}`,
        error
      );
      logDepositError(
        deposit.id,
        `Failed to initialize deposit: ${reason}`,
        error
      );
      // Update status to reflect error, preventing immediate retries unless logic changes
      updateToInitializedDeposit(deposit, null, `Error: ${reason}`);
    }
  }

  async finalizeDeposit(deposit: Deposit): Promise<void | { receipt: ethers.ContractReceipt | null; }> {
    // Check if already finalized locally
    if (deposit.status === DepositStatus.FINALIZED) {
      LogWarning(
        `FINALIZE | Deposit already finalized locally | ID: ${deposit.id}`
      );
      return;
    }
    // Ensure it was initialized or mark as error if called prematurely
    if (deposit.status !== DepositStatus.INITIALIZED) {
      const errorMsg = `Attempted to finalize non-initialized deposit (Status: ${DepositStatus[deposit.status]})`;
      LogError(
        `FINALIZE | ERROR | Attempted to finalize non-initialized deposit | ID: ${deposit.id} | STATUS: ${DepositStatus[deposit.status]}`,
        new Error(errorMsg)
      );
      logDepositError(
        deposit.id,
        errorMsg,
        new Error('Invalid status for finalize')
      );
      // Optionally mark with error? updateToFinalizedDeposit(deposit, null, 'Invalid status for finalize')? Or just let process loop retry?
      // For now, just return, assuming the process loop or event handler called this correctly.
      return;
    }

    try {
      LogMessage(`FINALIZE | Quoting fee... | ID: ${deposit.id}`);
      // Use provider instance for read-only quote
      const value = (
        await this.l1BitcoinDepositorProvider.quoteFinalizeDeposit()
      ).toString();
      LogMessage(`FINALIZE | Fee quoted: ${value} wei | ID: ${deposit.id}`);

      LogMessage(`FINALIZE | Pre-call checking... | ID: ${deposit.id}`);
      // Use provider instance for callStatic
      await this.l1BitcoinDepositorProvider.callStatic.finalizeDeposit(
        deposit.id,
        {
          value: value,
        }
      );
      LogMessage(`FINALIZE | Pre-call successful | ID: ${deposit.id}`);

      const currentNonce =
        await this.nonceManagerL1.getTransactionCount('latest');
      LogMessage(
        `FINALIZE | Sending transaction with nonce ${currentNonce} | ID: ${deposit.id}`
      );

      // Use signer contract instance with nonce manager for the actual transaction
      const tx = await this.l1BitcoinDepositor.finalizeDeposit(deposit.id, {
        value: value,
        nonce: currentNonce,
      });

      LogMessage(
        `FINALIZE | Waiting to be mined | ID: ${deposit.id} | TxHash: ${tx.hash}`
      );
      const receipt = await tx.wait();
      LogMessage(
        `FINALIZE | Transaction mined | ID: ${deposit.id} | TxHash: ${receipt.transactionHash} | Block: ${receipt.blockNumber}`
      );

      // Update status upon successful mining
      updateToFinalizedDeposit(deposit, receipt); // Pass only deposit and receipt on success

      return { receipt }
    } catch (error: any) {
      const reason =
        error.reason ??
        error.error?.message ??
        error.message ??
        'Unknown error';

      // Specific handling for the "Deposit not finalized by the bridge" case
      if (reason.includes('Deposit not finalized by the bridge')) {
        LogWarning(
          `FINALIZE | WAITING (Bridge Delay) | ID: ${deposit.id} | Reason: ${reason}`
        );
        // Don't mark as error, just update activity to allow retry after TIME_TO_RETRY
        updateLastActivity(deposit);
      } else {
        // Handle other errors
        LogError(
          `FINALIZE | ERROR | ID: ${deposit.id} | Reason: ${reason}`,
          error
        );
        logDepositError(
          deposit.id,
          `Failed to finalize deposit: ${reason}`,
          error
        );
        // Mark as error to potentially prevent immediate retries depending on cleanup logic
        updateToFinalizedDeposit(deposit, null, `Error: ${reason}`);
      }
    }
  }

  async checkDepositStatus(depositId: string): Promise<DepositStatus | null> {
    try {
      // Use the L1 provider contract to check status
      const status: number =
        await this.l1BitcoinDepositorProvider.deposits(depositId);
      // Ensure the status is a valid enum value before returning
      if (Object.values(DepositStatus).includes(status as DepositStatus)) {
        // LogMessage(`Checked L1 Status for ID ${depositId}: ${DepositStatus[status]}`); // Verbose
        return status as DepositStatus;
      } else {
        LogWarning(
          `L1BitcoinDepositor returned invalid status (${status}) for deposit ID: ${depositId}`
        );
        return null; // Indicate invalid status received
      }
    } catch (error: any) {
      // Check if the error indicates the deposit doesn't exist (e.g., contract reverts)
      // This depends heavily on the specific contract behavior for invalid IDs.
      // For now, assume any error means status is uncertain.
      const reason =
        error.reason ?? error.message ?? 'Unknown error fetching status';
      LogError(
        `Error fetching L1 deposit status for ID ${depositId}: ${reason}`,
        error
      );
      return null; // Indicate status couldn't be reliably fetched
    }
  }

  // --- Batch Processing Logic ---
  async processInitializeDeposits(): Promise<void> {
    try {
      const queuedDeposits: Array<Deposit> = await getAllJsonOperationsByStatus(
        DepositStatus.QUEUED
      );
      if (queuedDeposits.length === 0) return; // Nothing to do

      // Filter deposits: Process only those older than TIME_TO_RETRY or without lastActivityAt
      const depositsToProcess = this.filterDepositsActivityTime(queuedDeposits);
      if (depositsToProcess.length === 0) return; // None are old enough to retry

      LogMessage(
        `INITIALIZE | Processing batch of ${depositsToProcess.length} queued deposits (older than ${this.TIME_TO_RETRY / 60000} min or new)`
      );

      for (const deposit of depositsToProcess) {
        const updatedDeposit = updateLastActivity(deposit); // Update activity time *before* potential async operations

        // Check L1 contract status *before* attempting initialization
        const contractStatus = await this.checkDepositStatus(updatedDeposit.id);
        // LogMessage(`INITIALIZE | Checked L1 Status for ID ${updatedDeposit.id}: ${DepositStatus[contractStatus ?? -1] ?? 'Unknown/Error'}`); // Verbose

        switch (contractStatus) {
          case DepositStatus.INITIALIZED:
            LogWarning(
              `INITIALIZE | Deposit already initialized on L1 (local status was QUEUED) | ID: ${updatedDeposit.id}`
            );
            // Update local status to match L1
            updateToInitializedDeposit(
              updatedDeposit,
              null,
              'Deposit found initialized on L1'
            );
            break;

          case DepositStatus.QUEUED:
          case null: // Includes case where deposit ID doesn't exist on L1 yet (expected for QUEUED) or fetch failed
            // Attempt to initialize (the method handles internal checks/errors)
            LogMessage(
              `INITIALIZE | Attempting initialization for ID: ${updatedDeposit.id}`
            );
            await this.initializeDeposit(updatedDeposit);
            break;

          case DepositStatus.FINALIZED:
            LogWarning(
              `INITIALIZE | Deposit already finalized on L1 (local status was QUEUED) | ID: ${updatedDeposit.id}`
            );
            // Update local status to match L1
            updateToFinalizedDeposit(
              updatedDeposit,
              null,
              'Deposit found finalized on L1'
            );
            break;

          default:
            // This case should ideally not be reached if checkDepositStatus filters invalid numbers
            LogWarning(
              `INITIALIZE | Unhandled L1 deposit status (${contractStatus}) for ID: ${updatedDeposit.id}`
            );
            break;
        }
      }
    } catch (error) {
      LogError('Error in processInitializeDeposits batch:', error as Error);
      logDepositError(
        'batch-initialize',
        'Error processing initialize batch',
        error
      );
    }
  }

  async processFinalizeDeposits(): Promise<void> {
    try {
      const initializedDeposits: Array<Deposit> =
        await getAllJsonOperationsByStatus(DepositStatus.INITIALIZED);
      if (initializedDeposits.length === 0) return;

      // Filter deposits: Process only those older than TIME_TO_RETRY or without lastActivityAt
      // Also filter out those marked with an error during initialization if desired
      const depositsToProcess = this.filterDepositsActivityTime(
        initializedDeposits
      ).filter((d) => !d.error); // Only process non-errored initializations

      if (depositsToProcess.length === 0) return;

      LogMessage(
        `FINALIZE | Processing batch of ${depositsToProcess.length} initialized deposits (older than ${this.TIME_TO_RETRY / 60000} min or new, no init error)`
      );

      for (const deposit of depositsToProcess) {
        const updatedDeposit = updateLastActivity(deposit); // Update activity time

        // Check L1 contract status *before* attempting finalization
        const contractStatus = await this.checkDepositStatus(updatedDeposit.id);
        // LogMessage(`FINALIZE | Checked L1 Status for ID ${updatedDeposit.id}: ${DepositStatus[contractStatus ?? -1] ?? 'Unknown/Error'}`); // Verbose

        switch (contractStatus) {
          case DepositStatus.INITIALIZED:
            // Attempt to finalize (method handles internal checks/errors like bridge delay)
            LogMessage(
              `FINALIZE | Attempting finalization for ID: ${updatedDeposit.id}`
            );
            await this.finalizeDeposit(updatedDeposit);
            break;

          case DepositStatus.FINALIZED:
            LogWarning(
              `FINALIZE | Deposit already finalized on L1 (local status was INITIALIZED) | ID: ${updatedDeposit.id}`
            );
            // Update local status to match L1
            updateToFinalizedDeposit(
              updatedDeposit,
              null,
              'Deposit found finalized on L1'
            );
            break;

          // Should not happen if local state is INITIALIZED, but handle defensively
          case DepositStatus.QUEUED:
            LogWarning(
              `FINALIZE | Deposit found as QUEUED on L1 unexpectedly (local status was INITIALIZED) | ID: ${updatedDeposit.id}`
            );
            // Revert local state? Log and let processInitializeDeposits handle it?
            // For now, just log. processInitializeDeposits should eventually correct it.
            break;
          case null:
            const errorMsg = `Could not fetch L1 status or deposit not found on L1 (local status was INITIALIZED) | ID: ${updatedDeposit.id}`;
            LogError(errorMsg, new Error(errorMsg));
            // Keep local status as INITIALIZED and let retry happen after TIME_TO_RETRY.
            break;
          default:
            LogWarning(
              `FINALIZE | Unhandled L1 deposit status (${contractStatus}) for ID: ${updatedDeposit.id}`
            );
            break;
        }
      }
    } catch (error) {
      LogError('Error in processFinalizeDeposits batch:', error as Error);
      logDepositError(
        'batch-finalize',
        'Error processing finalize batch',
        error
      );
    }
  }

  // --- Abstract Methods for Subclasses ---

  /**
   * Initialize L2-specific components like providers, signers, and contracts.
   * Should be implemented by subclasses (e.g., EVMChainHandler, StarknetChainHandler).
   */
  protected abstract initializeL2(): Promise<void>;

  /**
   * Set up L2-specific event listeners (e.g., for DepositInitialized events).
   * Implementation should check config.useEndpoint and only setup if false and applicable.
   * Should be implemented by subclasses.
   */
  protected abstract setupL2Listeners(): Promise<void>;

  /**
   * Get the latest block number (or equivalent concept like slot/sequence number) from the L2 chain.
   * Return 0 or throw error if not applicable (e.g., useEndpoint is true or chain doesn't support).
   * Should be implemented by subclasses.
   */
  abstract getLatestBlock(): Promise<number>;

  /**
   * Check for past L2 deposit events that might have been missed during downtime.
   * Implementation should check config.useEndpoint and only run if false and applicable.
   * Should be implemented by subclasses.
   */
  abstract checkForPastDeposits(options: {
    pastTimeInMinutes: number;
    latestBlock: number; // Represents block/slot/sequence number
  }): Promise<void>;

  /**
   * Helper to determine if this handler supports checking for past L2 deposits based on its configuration.
   * Defaults to true if L2 is configured and endpoint is not used, override in subclasses for specific logic.
   */
  supportsPastDepositCheck(): boolean {
    // True only if L2 is configured (implying L2 watcher capability) AND endpoint is not used.
    const supports = !!(
      this.config.l2Rpc &&
      this.config.l2ContractAddress &&
      !this.config.useEndpoint
    );
    // LogMessage(`Base supportsPastDepositCheck: ${supports} (L2Rpc: ${!!this.config.l2Rpc}, L2Contract: ${!!this.config.l2ContractAddress}, UseEndpoint: ${this.config.useEndpoint})`); // Verbose
    return supports;
  }

  // --- Helper Methods ---
  protected filterDepositsActivityTime(
    deposits: Array<Deposit>
  ): Array<Deposit> {
    const now = Date.now();
    return deposits.filter((deposit) => {
      // If lastActivityAt doesn't exist yet (e.g., freshly created via listener/endpoint), process immediately
      if (!deposit.dates.lastActivityAt) return true;
      // Otherwise, process only if enough time has passed since last activity
      return now - deposit.dates.lastActivityAt > this.TIME_TO_RETRY;
    });
  }
}
