import { type Network, Wormhole, wormhole } from '@wormhole-foundation/sdk';

import solana from '@wormhole-foundation/sdk/solana';
import sui from '@wormhole-foundation/sdk/sui';
import evm from '@wormhole-foundation/sdk/evm';

import { BigNumber, ethers } from 'ethers';
import type { TransactionReceipt } from '@ethersproject/providers';
import { NonceManager } from '@ethersproject/experimental';

import type { ChainHandlerInterface } from '../interfaces/ChainHandler.interface.js';
import { NETWORK, CHAIN_TYPE } from '../config/schemas/common.schema.js';
import type { Deposit } from '../types/Deposit.type.js';
import logger, { createLoggerWithCorrelation, logErrorContext } from '../utils/Logger.js';
import { DepositStore } from '../utils/DepositStore.js';
import {
  updateToInitializedDeposit,
  updateToFinalizedDeposit,
  updateLastActivity,
  createFinalizedDepositFromOnChainData,
} from '../utils/Deposits.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
// Import both ABIs - EVM version expects address, generic version expects bytes32
import { L1BitcoinDepositorABI as L1BitcoinDepositorEVMABI } from '../interfaces/L1EVMBitcoinDepositor.js';
import { L1BitcoinDepositorABI as L1BitcoinDepositorGenericABI } from '../interfaces/L1BitcoinDepositor.js';
import { TBTCVaultABI } from '../interfaces/TBTCVault.js';
import { logDepositError } from '../utils/AuditLog.js';
import type { AnyChainConfig } from '../config/index.js';
import type { EvmChainConfig } from '../config/schemas/evm.chain.schema.js';

export const DEFAULT_DEPOSIT_RETRY_MS = 1000 * 60 * 5; // 5 minutes

export abstract class BaseChainHandler<T extends AnyChainConfig> implements ChainHandlerInterface {
  protected l1Provider: ethers.providers.JsonRpcProvider;
  protected l1Signer: ethers.Wallet;
  protected nonceManagerL1: NonceManager;
  protected l1BitcoinDepositor: ethers.Contract; // For sending L1 txs
  protected tbtcVault: ethers.Contract; // For sending L1 txs (though not used currently)
  protected l1BitcoinDepositorProvider: ethers.Contract; // For L1 reads/events
  protected tbtcVaultProvider: ethers.Contract; // For L1 events
  public config: T;
  protected wormhole: Wormhole<Network>;

  constructor(config: T) {
    this.config = config;
    logger.debug(`Constructing BaseChainHandler for ${this.config.chainName}`);
  }

  async initialize(): Promise<void> {
    logger.debug(`Initializing Base L1 components for ${this.config.chainName}`);

    // --- L1 Setup ---
    // Common L1 configuration checks
    if (
      !this.config.l1Rpc ||
      !this.config.l1BitcoinDepositorAddress ||
      !this.config.vaultAddress ||
      !this.config.network
    ) {
      throw new Error(
        `Missing required L1 RPC/Contract/Vault/Network configuration for ${this.config.chainName}`,
      );
    }

    // Initialize L1 provider first as it's needed by the signer
    logger.info(
      `Initializing L1 provider for ${this.config.chainName} with RPC: ${this.config.l1Rpc}`,
    );
    this.l1Provider = new ethers.providers.JsonRpcProvider(this.config.l1Rpc);

    // EVM-specific L1 setup (Signer)
    if (this.config.chainType === CHAIN_TYPE.EVM || this.config.chainType === CHAIN_TYPE.STARKNET) {
      const evmConfig = this.config as EvmChainConfig; // Starknet config is a superset of this for privateKey
      if (!('privateKey' in evmConfig) || !evmConfig.privateKey) {
        logger.warn(
          `L1 Signer and transaction-capable contracts not initialized for ${this.config.chainName}. This might be expected in read-only setups.`,
        );
      } else {
        this.l1Signer = new ethers.Wallet(evmConfig.privateKey, this.l1Provider);
        this.nonceManagerL1 = new NonceManager(this.l1Signer);

        // L1 Contracts for transactions (require signer) - only for EVM standard flow
        if (this.config.chainType === CHAIN_TYPE.EVM) {
          this.l1BitcoinDepositor = new ethers.Contract(
            this.config.l1BitcoinDepositorAddress,
            L1BitcoinDepositorEVMABI,
            this.nonceManagerL1,
          );
          this.tbtcVault = new ethers.Contract( // Keep for completeness, though not sending txs currently
            this.config.vaultAddress,
            TBTCVaultABI,
            this.l1Signer, // Use l1Signer here, not nonceManagerL1 unless needed
          );
        }
      }
    } else {
      // For other non-EVM chains, check if they need L1 signer
      // The L1 Bitcoin Depositor is always on EVM (Ethereum), so we need an L1 signer
      if ('privateKey' in this.config && this.config.privateKey) {
        logger.info(`Setting up L1 signer for non-EVM chain ${this.config.chainName}`);
        this.l1Signer = new ethers.Wallet(this.config.privateKey as string, this.l1Provider);
        this.nonceManagerL1 = new NonceManager(this.l1Signer);

        // L1 Contracts for transactions (require signer) - use generic ABI for non-EVM chains
        this.l1BitcoinDepositor = new ethers.Contract(
          this.config.l1BitcoinDepositorAddress,
          L1BitcoinDepositorGenericABI,
          this.nonceManagerL1,
        );
      } else {
        logger.warn(
          `L1 Signer and transaction-capable contracts not initialized for non-EVM chain ${this.config.chainName} in BaseChainHandler. This might be expected.`,
        );
      }
    }

    const ethereumNetwork =
      (this.config.network as NETWORK) === NETWORK.DEVNET
        ? NETWORK.TESTNET
        : (this.config.network as NETWORK);

    // Only include platforms that are actually needed
    const platforms: any[] = [evm];
    const chainConfigs: any = {};

    // Always add Ethereum config since we need to parse L1 transactions
    chainConfigs.Ethereum = {
      rpc: this.config.l1Rpc,
    };

    // Only add Solana if this is a Solana chain
    if (this.config.chainType === CHAIN_TYPE.SOLANA) {
      platforms.push(solana);
      chainConfigs.Solana = {
        rpc: this.config.l2Rpc,
      };
    }

    // Only add SUI if this is a SUI chain
    if (this.config.chainType === CHAIN_TYPE.SUI) {
      platforms.push(sui);
      chainConfigs.Sui = {
        rpc: this.config.l2Rpc,
      };
    }

    this.wormhole = await wormhole(ethereumNetwork, platforms, {
      chains: chainConfigs,
    });
    // this.l1Provider = new ethers.providers.JsonRpcProvider(this.config.l1Rpc); // Moved up

    // L1 Contracts for reading/listening (do not require signer)
    // Select ABI based on chain type
    const l1BitcoinDepositorABI =
      this.config.chainType === CHAIN_TYPE.EVM
        ? L1BitcoinDepositorEVMABI
        : L1BitcoinDepositorGenericABI;

    this.l1BitcoinDepositorProvider = new ethers.Contract(
      this.config.l1BitcoinDepositorAddress,
      l1BitcoinDepositorABI,
      this.l1Provider,
    );
    this.tbtcVaultProvider = new ethers.Contract(
      this.config.vaultAddress,
      TBTCVaultABI,
      this.l1Provider,
    );
    logger.debug(`Base L1 components initialized for ${this.config.chainName}`);

    // --- L2 Setup (delegated to subclasses) ---
    this.initializeL2();

    logger.debug(`Chain handler fully initialized for ${this.config.chainName}`);
  }

  async setupListeners(): Promise<void> {
    logger.debug(`Setting up L1 listeners for ${this.config.chainName}`);
    await this.setupL1Listeners();
    logger.debug(`Setting up L2 listeners (delegated) for ${this.config.chainName}`);
    await this.setupL2Listeners();
    logger.debug(`All event listeners setup complete for ${this.config.chainName}`);
  }

  // --- L1 Listener Setup ---
  protected async setupL1Listeners(): Promise<void> {
    this.tbtcVaultProvider.on(
      'OptimisticMintingFinalized',
      async (_minter, depositKey, _depositor, _optimisticMintingDebt) => {
        try {
          const BigDepositKey = BigNumber.from(depositKey);
          const depositId = BigDepositKey.toString();
          const deposit: Deposit | null = await DepositStore.getById(depositId);
          if (deposit) {
            logger.debug(`Received OptimisticMintingFinalized event for Deposit ID: ${deposit.id}`);
            // Check if already finalized to avoid redundant calls/logs
            if (deposit.status !== DepositStatus.FINALIZED) {
              logger.debug(`Finalizing deposit ${deposit.id}...`);
              this.finalizeDeposit(deposit);
            } else {
              logger.debug(`Deposit ${deposit.id} already finalized locally. Ignoring event.`);
            }
          } else {
            // IMPORTANT: Automatic recovery disabled to prevent race conditions
            // When multiple chain handlers listen to the same L1 events, they race to recover
            // unknown deposits, potentially creating records with wrong chainId.
            //
            // Deposits should be created through:
            // 1. L2 event listeners (for normal flow)
            // 2. Backend notify endpoint (for gasless flow)
            //
            // If this warning appears frequently, check:
            // - L2 event listeners are working correctly
            // - Backend is properly retrying failed notifications
            logger.warn(
              `Received OptimisticMintingFinalized event for unknown Deposit Key: ${depositId}. ` +
              `Skipping automatic recovery. Deposit should be created via L2 event listener or backend notification. ` +
              `Chain: ${this.config.chainName}`,
            );
            logDepositError(
              depositId,
              `Unknown deposit detected on OptimisticMintingFinalized event. Waiting for L2 event or backend notification.`,
              { chainName: this.config.chainName },
            );
          }
        } catch (error: any) {
          logErrorContext(
            `Error in OptimisticMintingFinalized handler: ${error.message ?? error}`,
            error,
          );
          logDepositError(
            'unknown',
            `Error processing OptimisticMintingFinalized event for key ${depositKey?.toString()}`,
            error,
          );
        }
      },
    );
    logger.debug(
      `TBTCVault OptimisticMintingFinalized listener setup for ${this.config.chainName}`,
    );
  }

  // --- Core Deposit Logic (L1 Interactions) ---

  /**
   * Transform L1OutputEvent data for SUI chains to ensure proper 0x prefix formatting
   * @param l1OutputEvent - The L1OutputEvent data to transform
   * @param chainType - The chain type
   * @returns Transformed L1OutputEvent data
   */
  private transformL1OutputEventForChain(l1OutputEvent: any, chainType: CHAIN_TYPE): any {
    // For non-SUI chains, just normalize to strict ABI sizes without extra prefixing
    if (chainType !== CHAIN_TYPE.SUI) {
      return this.normalizeL1OutputEventForAbi(l1OutputEvent);
    }

    // Helper function to ensure 0x prefix
    const ensureHexPrefix = (value: string): string => {
      if (typeof value !== 'string') return value;
      return value.startsWith('0x') ? value : '0x' + value;
    };

    // Transform funding transaction fields
    const transformedFundingTx = {
      version: ensureHexPrefix(l1OutputEvent.fundingTx.version),
      inputVector: ensureHexPrefix(l1OutputEvent.fundingTx.inputVector),
      outputVector: ensureHexPrefix(l1OutputEvent.fundingTx.outputVector),
      locktime: ensureHexPrefix(l1OutputEvent.fundingTx.locktime),
    };

    // Transform reveal fields
    const transformedReveal = {
      fundingOutputIndex: l1OutputEvent.reveal.fundingOutputIndex,
      blindingFactor: ensureHexPrefix(l1OutputEvent.reveal.blindingFactor),
      walletPubKeyHash: ensureHexPrefix(l1OutputEvent.reveal.walletPubKeyHash),
      refundPubKeyHash: ensureHexPrefix(l1OutputEvent.reveal.refundPubKeyHash),
      refundLocktime: l1OutputEvent.reveal.refundLocktime, // Already has 0x from SUI parser
      vault: l1OutputEvent.reveal.vault,
    };

    return {
      fundingTx: transformedFundingTx,
      reveal: transformedReveal,
      l2DepositOwner: l1OutputEvent.l2DepositOwner,
    };
  }

  /**
   * Mirrors local deposit status to the status reported on L1 to avoid redundant actions.
   */
  protected async mirrorLocalStatusToL1(
    deposit: Deposit,
    l1Status: DepositStatus,
    reason?: string,
  ): Promise<void> {
    try {
      const now = Date.now();
      const updated = {
        ...deposit,
        status: l1Status,
        dates: {
          ...deposit.dates,
          initializationAt:
            l1Status === DepositStatus.INITIALIZED
              ? (deposit.dates.initializationAt ?? now)
              : deposit.dates.initializationAt,
          finalizationAt:
            l1Status === DepositStatus.FINALIZED
              ? (deposit.dates.finalizationAt ?? now)
              : deposit.dates.finalizationAt,
          lastActivityAt: now,
        },
        error: reason ?? null,
      } as Deposit;
      await DepositStore.update(updated);
      logger.info(
        `MIRROR | Local status -> ${DepositStatus[l1Status]} | ID: ${deposit.id} | Reason: ${reason ?? 'L1 status sync'}`,
      );
      createLoggerWithCorrelation({
        depositId: deposit.id,
        chainName: this.config.chainName,
        fromStatus: DepositStatus[deposit.status],
        toStatus: DepositStatus[l1Status],
        operation: 'deposit_mirrored_from_l1',
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
        finalizeTxHash: deposit.hashes?.eth?.finalizeTxHash ?? undefined,
      }).info(`Deposit state change: ${DepositStatus[deposit.status]} → ${DepositStatus[l1Status]} (mirrored from L1)`);
    } catch (e: any) {
      logErrorContext(`Failed to mirror local status to L1 for ${deposit.id}`, e, {
        depositId: deposit.id,
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
        finalizeTxHash: deposit.hashes?.eth?.finalizeTxHash ?? undefined,
      });
    }
  }

  /**
   * Ensures all fixed-size bytes fields strictly match the ABI sizes.
   * Applies to all chains to avoid INVALID_ARGUMENT errors from ABI encoding.
   */
  private normalizeL1OutputEventForAbi(l1OutputEvent: any): any {
    const zeroPad = (hex: string, sizeBytes: number): string => {
      if (typeof hex !== 'string') return hex;
      const prefixed = hex.startsWith('0x') ? hex : '0x' + hex;
      // ethers pads left to the requested byte length
      return ethers.utils.hexZeroPad(prefixed, sizeBytes);
    };

    const ensureBytes = (hex: string): string => {
      if (typeof hex !== 'string') return hex;
      let out = hex.startsWith('0x') ? hex : '0x' + hex;
      if (out.length % 2 !== 0) out = '0x0' + out.slice(2);
      return out;
    };

    const fundingTx = {
      version: zeroPad(l1OutputEvent.fundingTx.version, 4),
      inputVector: ensureBytes(l1OutputEvent.fundingTx.inputVector),
      outputVector: ensureBytes(l1OutputEvent.fundingTx.outputVector),
      locktime: zeroPad(l1OutputEvent.fundingTx.locktime, 4),
    };

    const reveal = {
      fundingOutputIndex: l1OutputEvent.reveal.fundingOutputIndex,
      blindingFactor: zeroPad(l1OutputEvent.reveal.blindingFactor, 8),
      walletPubKeyHash: zeroPad(l1OutputEvent.reveal.walletPubKeyHash, 20),
      refundPubKeyHash: zeroPad(l1OutputEvent.reveal.refundPubKeyHash, 20),
      refundLocktime: zeroPad(l1OutputEvent.reveal.refundLocktime, 4),
      vault: l1OutputEvent.reveal.vault,
    };

    // Handle the deposit owner based on chain type
    if (this.config.chainType === CHAIN_TYPE.EVM) {
      // For EVM chains, normalize as address
      const l2DepositOwner = ((): string => {
        try {
          return ethers.utils.getAddress(l1OutputEvent.l2DepositOwner);
        } catch {
          // If it's not a valid address, keep original to let callStatic surface a clear error
          return l1OutputEvent.l2DepositOwner;
        }
      })();
      return { fundingTx, reveal, l2DepositOwner };
    } else {
      // For non-EVM chains (Sui, Solana, StarkNet), use bytes32 destinationChainDepositOwner
      const destinationChainDepositOwner = zeroPad(l1OutputEvent.l2DepositOwner, 32);
      return { fundingTx, reveal, destinationChainDepositOwner };
    }
  }

  async initializeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    // Check if already processed locally to avoid redundant L1 calls
    if (
      deposit.status === DepositStatus.INITIALIZED ||
      deposit.status === DepositStatus.FINALIZED
    ) {
      logger.warn(
        `INITIALIZE | Deposit already processed locally | ID: ${deposit.id} | STATUS: ${DepositStatus[deposit.status]}`,
      );
      return;
    }
    if (!deposit.L1OutputEvent) {
      const errorMsg = 'Missing L1OutputEvent data for initialization';
      logErrorContext(
        `INITIALIZE | ERROR | Missing L1OutputEvent data | ID: ${deposit.id}`,
        new Error(errorMsg),
      );
      logDepositError(deposit.id, errorMsg, {
        error: errorMsg,
        context: 'Missing L1OutputEvent data',
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
      });
      updateToInitializedDeposit(deposit, undefined, 'Missing L1OutputEvent data'); // Mark as error
      return;
    }

    try {
      // Pre-check against L1 contract status to avoid unnecessary callStatic/init tx
      const preStatus = await this.checkDepositStatus(deposit.id);
      if (preStatus === DepositStatus.INITIALIZED) {
        logger.warn(
          `INITIALIZE | Deposit already initialized on L1 (pre-check) | ID: ${deposit.id}`,
        );
        await this.mirrorLocalStatusToL1(
          deposit,
          DepositStatus.INITIALIZED,
          'Deposit found initialized on L1',
        );
        return;
      }
      if (preStatus === DepositStatus.FINALIZED) {
        logger.warn(`INITIALIZE | Deposit already finalized on L1 (pre-check) | ID: ${deposit.id}`);
        await this.mirrorLocalStatusToL1(
          deposit,
          DepositStatus.FINALIZED,
          'Deposit found finalized on L1',
        );
        return;
      }

      // Transform the L1OutputEvent data for SUI chains to ensure proper formatting
      const transformedL1OutputEvent = this.transformL1OutputEventForChain(
        deposit.L1OutputEvent,
        this.config.chainType,
      );

      logger.debug(`INITIALIZE | Pre-call checking... | ID: ${deposit.id}`);
      // Pre-call check against L1BitcoinDepositor using the provider instance
      await this.l1BitcoinDepositorProvider.callStatic.initializeDeposit(
        transformedL1OutputEvent.fundingTx,
        transformedL1OutputEvent.reveal,
        transformedL1OutputEvent.l2DepositOwner,
      );
      logger.debug(`INITIALIZE | Pre-call successful | ID: ${deposit.id}`);

      const currentNonce = await this.nonceManagerL1.getTransactionCount('latest');
      logger.debug(
        `INITIALIZE | Sending transaction with nonce ${currentNonce} | ID: ${deposit.id}`,
      );

      // Send transaction using L1BitcoinDepositor with nonce manager
      const tx = await this.l1BitcoinDepositor.initializeDeposit(
        transformedL1OutputEvent.fundingTx,
        transformedL1OutputEvent.reveal,
        transformedL1OutputEvent.l2DepositOwner,
        { nonce: currentNonce },
      );

      logger.debug(`INITIALIZE | Waiting to be mined | ID: ${deposit.id} | TxHash: ${tx.hash}`);
      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      logger.debug(
        `INITIALIZE | Transaction mined | ID: ${deposit.id} | TxHash: ${receipt.transactionHash} | Block: ${receipt.blockNumber}`,
      );

      // Update the deposit status in the JSON storage upon successful mining
      updateToInitializedDeposit(deposit, receipt, undefined); // Pass receipt for txHash etc.

      // Explicit success log (with correlation IDs for SigNoz)
      createLoggerWithCorrelation({
        depositId: deposit.id,
        chainName: this.config.chainName,
        operation: 'initializeDeposit',
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: receipt.transactionHash,
        blockNumber: String(receipt.blockNumber),
      }).info(
        `INITIALIZE | SUCCESS | ID: ${deposit.id} | TxHash: ${receipt.transactionHash} | Block: ${receipt.blockNumber}`,
      );

      return receipt; // Return the receipt for further processing if needed
    } catch (error: any) {
      // Error Handling - Check if it's a specific revert reason or common issue
      const reason = error.reason ?? error.error?.message ?? error.message ?? 'Unknown error';

      // If the deposit was already revealed, mirror local status to avoid retries
      if (reason.includes('Deposit already revealed')) {
        await this.mirrorLocalStatusToL1(deposit, DepositStatus.INITIALIZED, reason);
        return;
      }

      // Log as error only if we confirmed L1 did not progress
      logErrorContext(`INITIALIZE | ERROR | ID: ${deposit.id} | Reason: ${reason}`, error, {
        depositId: deposit.id,
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
      });
      logDepositError(deposit.id, `Failed to initialize deposit: ${reason}`, {
        error: reason,
        originalError: error.message,
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
      });
      // Update status to reflect error, preventing immediate retries unless logic changes
      updateToInitializedDeposit(deposit, undefined, `Error: ${reason}`);
    }
  }

  async finalizeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    // Check if already finalized locally
    if (deposit.status === DepositStatus.FINALIZED) {
      logger.warn(`FINALIZE | Deposit already finalized locally | ID: ${deposit.id}`);
      return;
    }
    // Ensure it was initialized or mark as error if called prematurely
    if (deposit.status !== DepositStatus.INITIALIZED) {
      const errorMsg = `Attempted to finalize non-initialized deposit (Status: ${DepositStatus[deposit.status]})`;
      logErrorContext(
        `FINALIZE | ERROR | Attempted to finalize non-initialized deposit | ID: ${deposit.id} | STATUS: ${DepositStatus[deposit.status]}`,
        new Error(errorMsg),
      );
      logDepositError(deposit.id, errorMsg, {
        error: errorMsg,
        context: 'Invalid status for finalize',
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
      });
      // Optionally mark with error? updateToFinalizedDeposit(deposit, null, 'Invalid status for finalize')? Or just let process loop retry?
      // For now, just return, assuming the process loop or event handler called this correctly.
      return;
    }

    try {
      logger.debug(`FINALIZE | Quoting fee... | ID: ${deposit.id}`);
      // Use provider instance for read-only quote
      const value = (await this.l1BitcoinDepositorProvider.quoteFinalizeDeposit()).toString();
      logger.debug(`FINALIZE | Fee quoted: ${value} wei | ID: ${deposit.id}`);

      logger.debug(`FINALIZE | Pre-call checking... | ID: ${deposit.id}`);
      // Use provider instance for callStatic
      await this.l1BitcoinDepositorProvider.callStatic.finalizeDeposit(deposit.id, {
        value: value,
      });
      logger.debug(`FINALIZE | Pre-call successful for finalizeDeposit | ID: ${deposit.id}`);

      const currentNonce = await this.nonceManagerL1.getTransactionCount('latest');
      logger.debug(
        `FINALIZE | Sending L1 finalize transaction with nonce ${currentNonce} | ID: ${deposit.id}`,
      );

      // Use signer contract instance with nonce manager for the actual transaction
      const tx = await this.l1BitcoinDepositor.finalizeDeposit(deposit.id, {
        value: value,
        nonce: currentNonce,
      });

      logger.debug(
        `FINALIZE | L1 finalize transaction sent | ID: ${deposit.id} | TxHash: ${tx.hash}`,
      );
      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      logger.debug(
        `FINALIZE | L1 finalize transaction mined | ID: ${deposit.id} | TxHash: ${receipt.transactionHash} | Block: ${receipt.blockNumber}`,
      );

      // Update status upon successful mining
      updateToFinalizedDeposit(deposit, receipt, undefined); // Pass only deposit and receipt on success

      // Explicit success log (with correlation IDs for SigNoz)
      createLoggerWithCorrelation({
        depositId: deposit.id,
        chainName: this.config.chainName,
        operation: 'finalizeDeposit',
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
        finalizeTxHash: receipt.transactionHash,
        blockNumber: String(receipt.blockNumber),
      }).info(
        `FINALIZE | SUCCESS | ID: ${deposit.id} | TxHash: ${receipt.transactionHash} | Block: ${receipt.blockNumber}`,
      );

      return receipt;
    } catch (error: any) {
      const reason = error.reason ?? error.error?.message ?? error.message ?? 'Unknown error';

      // Specific handling for the "Deposit not finalized by the bridge" case
      if (reason.includes('Deposit not finalized by the bridge')) {
        logger.warn(`FINALIZE | WAITING (Bridge Delay) | ID: ${deposit.id} | Reason: ${reason}`);
        // Don't mark as error, just update activity to allow retry after TIME_TO_RETRY
        await updateLastActivity(deposit);
        return;
      }

      // If generic failure, re-check L1 status – it might have finalized already
      try {
        const postStatus = await this.checkDepositStatus(deposit.id);
        if (postStatus === DepositStatus.FINALIZED) {
          logger.warn(
            `FINALIZE | Tx failed but L1 shows FINALIZED (race/duplicate) | ID: ${deposit.id}`,
          );
          await this.mirrorLocalStatusToL1(deposit, DepositStatus.FINALIZED, reason);
          return;
        }
      } catch {}

      // Handle other errors only if L1 did not progress
      logErrorContext(`FINALIZE | ERROR | ID: ${deposit.id} | Reason: ${reason}`, error, {
        depositId: deposit.id,
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
      });
      logDepositError(deposit.id, `Failed to finalize deposit: ${reason}`, {
        error: reason,
        originalError: error.message,
        chainName: this.config.chainName,
        fundingTxHash: deposit.fundingTxHash ?? undefined,
        initializeTxHash: deposit.hashes?.eth?.initializeTxHash ?? undefined,
      });
      // Mark as error to potentially prevent immediate retries depending on cleanup logic
      updateToFinalizedDeposit(deposit, undefined, `Error: ${reason}`);
    }
  }

  async checkDepositStatus(depositOrId: string | Deposit): Promise<DepositStatus | null> {
    try {
      // Use the L1 provider contract to check status
      // For EVM chains, depositOrId is a string depositId
      // For Starknet, this method is overridden in the subclass
      const status: number = await this.l1BitcoinDepositorProvider.deposits(depositOrId);
      // Ensure the status is a valid enum value before returning
      if (Object.values(DepositStatus).includes(status as DepositStatus)) {
        return status as DepositStatus;
      } else {
        logger.warn(
          `L1BitcoinDepositor returned invalid status (${status}) for deposit key: ${depositOrId}`,
        );
        return null; // Indicate invalid status received
      }
    } catch (error: any) {
      // Handle errors such as contract revert, possibly deposit not found
      const reason = error.reason ?? error.message ?? 'Unknown error fetching status';
      logErrorContext(`Error fetching L1 deposit status for key ${depositOrId}: ${reason}`, error);
      return null; // Indicate status couldn't be reliably fetched
    }
  }

  // --- Batch Processing Logic ---
  async processInitializeDeposits(): Promise<void> {
    logger.debug(`PROCESS INITIALIZE | Running for chain ${this.config.chainName}`);
    const depositsToInitialize = await DepositStore.getByStatus(
      DepositStatus.QUEUED,
      this.config.chainName,
    );
    logger.debug(
      `PROCESS INITIALIZE | Found ${depositsToInitialize.length} QUEUED deposits for ${this.config.chainName}`,
    );

    const filteredDeposits = this.filterDepositsActivityTime(depositsToInitialize);
    logger.debug(
      `PROCESS INITIALIZE | After filtering: ${filteredDeposits.length} deposits for ${this.config.chainName}`,
    );

    if (filteredDeposits.length === 0) {
      if (depositsToInitialize.length > 0) {
        logger.debug(
          `PROCESS INITIALIZE | ${depositsToInitialize.length} deposits were filtered out by activity time for ${this.config.chainName}`,
        );
      }
      return;
    }

    logger.debug(
      `PROCESS_INIT | Initializing ${filteredDeposits.length} deposits for chain ${this.config.chainName}`,
    );

    for (const deposit of filteredDeposits) {
      const updatedDeposit = await updateLastActivity(deposit); // Update activity time *before* potential async operations

      // Check L1 contract status *before* attempting initialization
      const contractStatus = await this.checkDepositStatus(updatedDeposit.id);
      // logger.info(`INITIALIZE | Checked L1 Status for ID ${updatedDeposit.id}: ${DepositStatus[contractStatus ?? -1] ?? 'Unknown/Error'}`); // Verbose

      switch (contractStatus) {
        case DepositStatus.INITIALIZED:
          logger.warn(
            `INITIALIZE | Deposit already initialized on L1 (local status was QUEUED) | ID: ${updatedDeposit.id}`,
          );
          // Update local status to match L1
          await this.mirrorLocalStatusToL1(
            updatedDeposit,
            DepositStatus.INITIALIZED,
            'Deposit found initialized on L1',
          );
          break;

        case DepositStatus.QUEUED:
        case null: // Includes case where deposit ID doesn't exist on L1 yet (expected for QUEUED) or fetch failed
          // Attempt to initialize (the method handles internal checks/errors)
          logger.debug(`INITIALIZE | Attempting initialization for ID: ${updatedDeposit.id}`);
          await this.initializeDeposit(updatedDeposit);
          break;

        case DepositStatus.FINALIZED:
          logger.warn(
            `INITIALIZE | Deposit already finalized on L1 (local status was QUEUED) | ID: ${updatedDeposit.id}`,
          );
          // Update local status to match L1
          await this.mirrorLocalStatusToL1(
            updatedDeposit,
            DepositStatus.FINALIZED,
            'Deposit found finalized on L1',
          );
          break;

        default:
          // This case should ideally not be reached if checkDepositStatus filters invalid numbers
          logger.warn(
            `INITIALIZE | Unhandled L1 deposit status (${contractStatus}) for ID: ${updatedDeposit.id}`,
          );
          break;
      }
    }
  }

  async processFinalizeDeposits(): Promise<void> {
    logger.debug(`PROCESS FINALIZE | Running for chain ${this.config.chainName}`);
    const depositsToFinalize = await DepositStore.getByStatus(
      DepositStatus.INITIALIZED,
      this.config.chainName,
    );
    const filteredDeposits = this.filterDepositsActivityTime(depositsToFinalize);

    if (filteredDeposits.length === 0) {
      return;
    }

    logger.debug(
      `PROCESS_FINALIZE | Finalizing ${filteredDeposits.length} deposits for chain ${this.config.chainName}`,
    );

    for (const deposit of filteredDeposits) {
      const updatedDeposit = await updateLastActivity(deposit); // Update activity time

      // Check L1 contract status *before* attempting finalization
      const contractStatus = await this.checkDepositStatus(updatedDeposit.id);
      // logger.info(`FINALIZE | Checked L1 Status for ID ${updatedDeposit.id}: ${DepositStatus[contractStatus ?? -1] ?? 'Unknown/Error'}`); // Verbose

      switch (contractStatus) {
        case DepositStatus.INITIALIZED:
          // Attempt to finalize (method handles internal checks/errors like bridge delay)
          logger.debug(`FINALIZE | Attempting finalization for ID: ${updatedDeposit.id}`);
          await this.finalizeDeposit(updatedDeposit);
          break;

        case DepositStatus.FINALIZED:
          logger.warn(
            `FINALIZE | Deposit already finalized on L1 (local status was INITIALIZED) | ID: ${updatedDeposit.id}`,
          );
          // Update local status to match L1
          updateToFinalizedDeposit(updatedDeposit, undefined, 'Deposit found finalized on L1');
          break;

        // Should not happen if local state is INITIALIZED, but handle defensively
        case DepositStatus.QUEUED:
          logger.warn(
            `FINALIZE | Deposit found as QUEUED on L1 unexpectedly (local status was INITIALIZED) | ID: ${updatedDeposit.id}`,
          );
          // Revert local state? Log and let processInitializeDeposits handle it?
          // For now, just log. processInitializeDeposits should eventually correct it.
          break;
        case null:
          const errorMsg = `Could not fetch L1 status or deposit not found on L1 (local status was INITIALIZED) | ID: ${updatedDeposit.id}`;
          logErrorContext(errorMsg, new Error(errorMsg));
          // Keep local status as INITIALIZED and let retry happen after TIME_TO_RETRY.
          break;
        default:
          logger.warn(
            `FINALIZE | Unhandled L1 deposit status (${contractStatus}) for ID: ${updatedDeposit.id}`,
          );
          break;
      }
    }
  }

  // --- Abstract Methods for Subclasses ---

  /**
   * Initialize L2-specific components like providers, signers, and contracts.
   * Should be implemented by subclasses (e.g., EVMChainHandler, StarknetChainHandler).
   */
  protected abstract initializeL2(): void;

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
  /**
   * Determines if this chain handler supports checking for past deposits.
   *
   * This method exists to allow gradual feature rollout and backward compatibility.
   * Currently, past deposit checking is supported when not using endpoint mode,
   * as endpoint mode relies on external API calls rather than direct L2 monitoring.
   *
   * @returns true if past deposit checking is supported, false otherwise
   *
   * @future Consider removing this and always run full-configuration with support of all features.
   * In the future, all chain handlers should support past deposit checking when L2 is configured.
   */
  supportsPastDepositCheck(): boolean {
    // Past deposit checking is supported when not in endpoint mode
    // Endpoint mode relies on external API calls and doesn't maintain internal deposit state
    return !this.config.useEndpoint;
  }

  protected filterDepositsActivityTime(deposits: Array<Deposit>): Array<Deposit> {
    const now = Date.now();
    return deposits.filter((deposit) => {
      // If lastActivityAt doesn't exist yet (e.g., freshly created via listener/endpoint), process immediately
      if (!deposit.dates.lastActivityAt || !deposit.dates.createdAt) {
        logger.debug(
          `FILTER | Deposit ${deposit.id} has no activity dates, processing immediately`,
        );
        return true;
      }

      // If the deposit was just created (last activity is the creation time), process immediately.
      // We check if they are within a small threshold to account for ms differences during creation.
      const timeDiff = Math.abs(deposit.dates.lastActivityAt - deposit.dates.createdAt);
      if (timeDiff < 1000) {
        logger.debug(
          `FILTER | Deposit ${deposit.id} was just created (diff: ${timeDiff}ms), processing immediately`,
        );
        return true;
      }

      // For deposits that are freshly created but have been updated once (common with SUI deposits),
      // allow immediate processing if they were created recently and are still in early stages
      const timeSinceCreation = now - deposit.dates.createdAt;
      if (timeSinceCreation < 10 * 60 * 1000) {
        // 10 minutes
        // Process immediately if deposit is in early stages (QUEUED or INITIALIZED)
        if (deposit.status === 0 || deposit.status === 1) {
          // QUEUED or INITIALIZED
          logger.debug(
            `FILTER | Deposit ${deposit.id} is in early stage (status: ${deposit.status}) and created recently (${timeSinceCreation}ms ago), processing immediately`,
          );
          return true;
        }
      }

      // Otherwise, process only if enough time has passed since last activity
      const timeSinceLastActivity = now - deposit.dates.lastActivityAt;
      const shouldProcess = timeSinceLastActivity > DEFAULT_DEPOSIT_RETRY_MS;
      logger.debug(
        `FILTER | Deposit ${deposit.id} time since last activity: ${timeSinceLastActivity}ms, retry threshold: ${DEFAULT_DEPOSIT_RETRY_MS}ms, should process: ${shouldProcess}`,
      );
      return shouldProcess;
    });
  }
}
