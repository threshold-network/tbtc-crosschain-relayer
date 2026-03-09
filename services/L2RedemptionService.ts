import { ethers } from 'ethers';
import type { ChainId } from '@wormhole-foundation/sdk';
import { encoding, serialize } from '@wormhole-foundation/sdk';
import { WormholeVaaService } from './WormholeVaaService.js';
import { l1RedemptionHandlerRegistry } from '../handlers/L1RedemptionHandlerRegistry.js';
import type { L1RedemptionHandler } from '../handlers/L1RedemptionHandler.js';
import logger, { createLoggerWithCorrelation, logErrorContext } from '../utils/Logger.js';
import {
  RedemptionStatus,
  type Redemption,
  type RedemptionRequestedEventData,
} from '../types/Redemption.type.js';
import { RedemptionStore } from '../utils/RedemptionStore.js';
import type { EvmChainConfig } from '../config/schemas/evm.chain.schema.js';
import { L2BitcoinRedeemerABI } from '../interfaces/L2BitcoinRedeemer.js';
import { L1RedemptionHandlerInterface } from '../interfaces/L1RedemptionHandler.interface.js';

export class L2RedemptionService {
  private l2Provider: ethers.providers.JsonRpcProvider;
  private l2BitcoinRedeemerContract?: ethers.Contract;
  private wormholeVaaService!: WormholeVaaService;
  private l1RedemptionHandler: L1RedemptionHandlerInterface | undefined;

  private l2WormholeChainId: number;
  private l2WormholeGatewayAddress: string; // Emitter address on L2 for VAA fetching
  private chainConfig: EvmChainConfig;

  private constructor(chainConfig: EvmChainConfig) {
    this.chainConfig = chainConfig;
    this.l2Provider = new ethers.providers.JsonRpcProvider(chainConfig.l2Rpc);

    if (chainConfig.l2BitcoinRedeemerAddress) {
      this.l2BitcoinRedeemerContract = new ethers.Contract(
        chainConfig.l2BitcoinRedeemerAddress,
        L2BitcoinRedeemerABI,
        this.l2Provider,
      );
      logger.info(
        `L2RedemptionService initialized for L2 contract ${chainConfig.l2BitcoinRedeemerAddress} on ${chainConfig.l2Rpc}. Listening for 'RedemptionRequested' event.`,
      );
    } else {
      logger.warn(
        `L2RedemptionService: l2BitcoinRedeemerAddress is not configured for chain ${chainConfig.chainName}. L2 redemption event listening will be disabled for this chain.`,
      );
    }

    this.l2WormholeChainId = chainConfig.l2WormholeChainId;
    this.l2WormholeGatewayAddress = chainConfig.l2WormholeGatewayAddress;
    this.l1RedemptionHandler = l1RedemptionHandlerRegistry.get(chainConfig.chainName);

    logger.info(
      `Wormhole VAA Service will be configured for L2 Wormhole Gateway: ${chainConfig.l2WormholeGatewayAddress} on chain ID: ${chainConfig.l2WormholeChainId}.`,
    );
  }

  // Async operations cannot be performed in the constructor, so we put them here
  private async initialize(chainConfig: EvmChainConfig): Promise<void> {
    this.wormholeVaaService = await WormholeVaaService.create(
      chainConfig.l2Rpc,
      chainConfig.network,
    );
  }

  public static async create(chainConfig: EvmChainConfig): Promise<L2RedemptionService> {
    const instance = new L2RedemptionService(chainConfig);
    await instance.initialize(chainConfig);
    return instance;
  }

  public async startListening(): Promise<void> {
    if (!this.l2BitcoinRedeemerContract) {
      logger.info(
        `Skipping 'RedemptionRequestedOnL2' event listening for chain ${this.chainConfig.chainName} as l2BitcoinRedeemerAddress is not configured.`,
      );
      return;
    }
    logger.info(
      `Starting to listen for 'RedemptionRequestedOnL2' events from ${this.l2BitcoinRedeemerContract.address}`,
    );

    this.l2BitcoinRedeemerContract.on(
      'RedemptionRequestedOnL2',
      async (
        amount: ethers.BigNumber,
        redeemerOutputScript: string,
        _nonce: number,
        rawEvent: ethers.Event,
      ) => {
        const eventData: RedemptionRequestedEventData = {
          redeemerOutputScript,
          amount,
          l2TransactionHash: rawEvent.transactionHash,
        };

        const redemptionId = eventData.l2TransactionHash;
        const existing = await RedemptionStore.getById(redemptionId);
        if (existing) {
          logger.info(`Redemption already exists for L2 tx: ${redemptionId}, skipping.`);
          return;
        }

        const now = Date.now();
        const redemption: Redemption = {
          id: redemptionId,
          chainId: this.chainConfig.chainName,
          event: eventData,
          serializedVaaBytes: null,
          vaaStatus: RedemptionStatus.PENDING,
          l1SubmissionTxHash: null,
          status: RedemptionStatus.PENDING,
          error: null,
          dates: {
            createdAt: now,
            vaaFetchedAt: null,
            l1SubmittedAt: null,
            completedAt: null,
            lastActivityAt: now,
          },
          logs: [`Redemption created at ${new Date(now).toISOString()}`],
        };
        await RedemptionStore.create(redemption);
        createLoggerWithCorrelation({
          redemptionId,
          chainName: this.chainConfig.chainName,
          fromStatus: 'CREATED',
          toStatus: 'PENDING',
          operation: 'redemption_created',
          l2TxHash: eventData.l2TransactionHash,
        }).info('Redemption state change: CREATED → PENDING');
      },
    );

    this.l2Provider.on('error', (error) => {
      logErrorContext('L2 Provider emitted an error:', error);
    });
  }

  public stopListening(): void {
    if (!this.l2BitcoinRedeemerContract) {
      logger.info(
        `Skipping stopListening for 'RedemptionRequestedOnL2' events for chain ${this.chainConfig.chainName} as l2BitcoinRedeemerAddress is not configured.`,
      );
      return;
    }
    logger.info(
      `Stopping 'RedemptionRequestedOnL2' event listener for ${this.l2BitcoinRedeemerContract.address}.`,
    );
    this.l2BitcoinRedeemerContract.removeAllListeners('RedemptionRequestedOnL2');
  }

  public async processPendingRedemptions(): Promise<void> {
    const pending = await RedemptionStore.getByStatus(
      RedemptionStatus.PENDING,
      this.chainConfig.chainName,
    );
    const vaaFailed = await RedemptionStore.getByStatus(
      RedemptionStatus.VAA_FAILED,
      this.chainConfig.chainName,
    );
    const toProcess = [...pending, ...vaaFailed];
    for (const redemption of toProcess) {
      try {
        const vaaResult = await this.wormholeVaaService.fetchVaaForRedemption(
          redemption.id,
          this.l2WormholeChainId as ChainId,
        );

        if (vaaResult) {
          redemption.serializedVaaBytes = vaaResult.serializedVaa;
          redemption.vaaStatus = RedemptionStatus.VAA_FETCHED;
          redemption.status = RedemptionStatus.VAA_FETCHED;
          redemption.dates.vaaFetchedAt = Date.now();
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = null;
          redemption.logs?.push(`VAA fetched and serialized at ${new Date().toISOString()}`);
          await RedemptionStore.update(redemption);
          createLoggerWithCorrelation({
            redemptionId: redemption.id,
            chainName: this.chainConfig.chainName,
            fromStatus: 'PENDING',
            toStatus: 'VAA_FETCHED',
            operation: 'redemption_vaa_fetched',
            l2TxHash: redemption.event.l2TransactionHash,
          }).info('Redemption state change: PENDING → VAA_FETCHED');
        } else {
          redemption.vaaStatus = RedemptionStatus.VAA_FAILED;
          redemption.status = RedemptionStatus.VAA_FAILED;
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = 'VAA fetch/verify failed';
          redemption.logs?.push(`VAA fetch failed at ${new Date().toISOString()}`);
          await RedemptionStore.update(redemption);
          logger.warn(`VAA fetch failed for redemption: ${redemption.id}`);
          createLoggerWithCorrelation({
            redemptionId: redemption.id,
            chainName: this.chainConfig.chainName,
            fromStatus: 'PENDING',
            toStatus: 'VAA_FAILED',
            operation: 'redemption_vaa_failed',
            l2TxHash: redemption.event.l2TransactionHash,
          }).info('Redemption state change: PENDING → VAA_FAILED');
        }
      } catch (error: any) {
        redemption.vaaStatus = RedemptionStatus.VAA_FAILED;
        redemption.status = RedemptionStatus.VAA_FAILED;
        redemption.dates.lastActivityAt = Date.now();
        redemption.error = error?.message || String(error);
        redemption.logs?.push(
          `VAA fetch error at ${new Date().toISOString()}: ${redemption.error}`,
        );
        await RedemptionStore.update(redemption);
        logger.error(`Error fetching VAA for redemption ${redemption.id}: ${redemption.error}`);
        createLoggerWithCorrelation({
          redemptionId: redemption.id,
          chainName: this.chainConfig.chainName,
          fromStatus: 'PENDING',
          toStatus: 'VAA_FAILED',
          operation: 'redemption_vaa_failed',
          l2TxHash: redemption.event.l2TransactionHash,
        }).info('Redemption state change: PENDING → VAA_FAILED');
      }
    }
  }

  public async processVaaFetchedRedemptions(): Promise<void> {
    const vaaFetched = await RedemptionStore.getByStatus(
      RedemptionStatus.VAA_FETCHED,
      this.chainConfig.chainName,
    );
    for (const redemption of vaaFetched) {
      try {
        if (!this.l1RedemptionHandler) {
          logger.error('L1RedemptionHandler is not available. Skipping L1 submission.');
          continue;
        }
        if (!redemption.serializedVaaBytes) {
          redemption.status = RedemptionStatus.VAA_FAILED;
          redemption.error = 'No VAA bytes present for L1 submission.';
          redemption.dates.lastActivityAt = Date.now();
          redemption.logs?.push(
            `L1 submission failed at ${new Date().toISOString()}: No VAA bytes.`,
          );
          await RedemptionStore.update(redemption);
          logger.error(`Redemption ${redemption.id} missing VAA bytes, cannot submit to L1.`);
          createLoggerWithCorrelation({
            redemptionId: redemption.id,
            chainName: this.chainConfig.chainName,
            fromStatus: 'VAA_FETCHED',
            toStatus: 'VAA_FAILED',
            operation: 'redemption_vaa_missing',
            l2TxHash: redemption.event.l2TransactionHash,
          }).info('Redemption state change: VAA_FETCHED → VAA_FAILED (no VAA bytes)');
          continue;
        }
        const vaaBytes = redemption.serializedVaaBytes;
        // Re-hydrate amount to an ethers BigNumber (it may have been de-serialized from JSON)
        const amountBn = ethers.BigNumber.from(
          (redemption.event.amount as any)?._hex ?? (redemption.event.amount as any),
        );
        const l1TxHash = await this.l1RedemptionHandler.relayRedemptionToL1(
          amountBn,
          vaaBytes,
          this.chainConfig.chainName,
          redemption.id,
        );
        if (l1TxHash) {
          redemption.status = RedemptionStatus.COMPLETED;
          redemption.l1SubmissionTxHash = l1TxHash;
          redemption.dates.completedAt = Date.now();
          redemption.dates.l1SubmittedAt = Date.now();
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = null;
          redemption.logs?.push(
            `L1 submission succeeded at ${new Date().toISOString()} (tx: ${l1TxHash})`,
          );
          await RedemptionStore.update(redemption);
          createLoggerWithCorrelation({
            redemptionId: redemption.id,
            chainName: this.chainConfig.chainName,
            fromStatus: 'VAA_FETCHED',
            toStatus: 'COMPLETED',
            operation: 'redemption_completed',
            l2TxHash: redemption.event.l2TransactionHash,
            l1TxHash,
          }).info('Redemption state change: VAA_FETCHED → COMPLETED');
        } else {
          redemption.status = RedemptionStatus.FAILED;
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = 'L1 submission failed (see logs for details)';
          redemption.logs?.push(`L1 submission failed at ${new Date().toISOString()}`);
          await RedemptionStore.update(redemption);
          logger.error(`Redemption ${redemption.id} failed L1 submission.`);
          createLoggerWithCorrelation({
            redemptionId: redemption.id,
            chainName: this.chainConfig.chainName,
            fromStatus: 'VAA_FETCHED',
            toStatus: 'FAILED',
            operation: 'redemption_failed',
            l2TxHash: redemption.event.l2TransactionHash,
          }).info('Redemption state change: VAA_FETCHED → FAILED');
        }
      } catch (error: any) {
        redemption.status = RedemptionStatus.FAILED;
        redemption.dates.lastActivityAt = Date.now();
        redemption.error = error?.message || String(error);
        redemption.logs?.push(
          `L1 submission error at ${new Date().toISOString()}: ${redemption.error}`,
        );
        await RedemptionStore.update(redemption);
        logger.error(`Error submitting redemption ${redemption.id} to L1: ${redemption.error}`);
        createLoggerWithCorrelation({
          redemptionId: redemption.id,
          chainName: this.chainConfig.chainName,
          fromStatus: 'VAA_FETCHED',
          toStatus: 'FAILED',
          operation: 'redemption_failed',
          l2TxHash: redemption.event.l2TransactionHash,
        }).info('Redemption state change: VAA_FETCHED → FAILED');
      }
    }
  }

  public async getLatestBlock(): Promise<number> {
    try {
      const blockNumber = await this.l2Provider.getBlockNumber();
      return blockNumber;
    } catch (error) {
      logErrorContext(`Error getting latest block for ${this.chainConfig.chainName}:`, error);
      return 0;
    }
  }

  private async _getBlocksByTimestampEVM(
    timestamp: number,
    latestBlock: number,
  ): Promise<{
    startBlock: number;
    endBlock: number;
  }> {
    if (!this.l2Provider) {
      logger.warn(
        `_getBlocksByTimestampEVM | L2 Provider not available for ${this.chainConfig.chainName}. Returning default range.`,
      );
      return {
        startBlock: this.chainConfig.l2BitcoinRedeemerStartBlock ?? 0,
        endBlock: latestBlock ?? 0,
      };
    }

    const START_BLOCK = (this.chainConfig.l2BitcoinRedeemerStartBlock as number | undefined) ?? 0;
    let startBlock = -1;
    let low = START_BLOCK;
    let high = latestBlock;
    let currentLatestBlock = latestBlock;

    if (high < low) {
      logger.warn(
        `_getBlocksByTimestampEVM | latestBlock (${high}) is less than START_BLOCK (${low}). Returning START_BLOCK for both range ends.`,
      );
      return { startBlock: START_BLOCK, endBlock: START_BLOCK };
    }

    logger.debug(
      `_getBlocksByTimestampEVM | Starting binary search for timestamp ${timestamp} between blocks ${low} and ${high}`,
    );

    try {
      // Binary search for the block with the closest timestamp to the given timestamp
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        const blockData = await this.l2Provider.getBlock(mid);

        if (!blockData) {
          high = mid - 1;
          continue;
        }

        if (blockData.timestamp === timestamp) {
          startBlock = mid;
          break;
        } else if (blockData.timestamp < timestamp) {
          startBlock = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (startBlock === -1) {
        startBlock = START_BLOCK;
      }

      if (startBlock > currentLatestBlock) {
        startBlock = currentLatestBlock;
      }
    } catch (error) {
      logErrorContext(
        `_getBlocksByTimestampEVM | Error during binary search for ${this.chainConfig.chainName}: ${error}`,
        error,
      );
      startBlock = START_BLOCK;
      currentLatestBlock = latestBlock;
    }

    const endBlock = Math.max(startBlock, currentLatestBlock);

    logger.debug(
      `_getBlocksByTimestampEVM | Binary search result for ${this.chainConfig.chainName}: startBlock=${startBlock}, endBlock=${endBlock}`,
    );
    return { startBlock, endBlock };
  }

  public async checkForPastRedemptions(options: {
    pastTimeInMinutes: number;
    latestBlock: number;
  }): Promise<void> {
    if (!this.l2BitcoinRedeemerContract) {
      logger.info(
        `Skipping checkForPastRedemptions for ${this.chainConfig.chainName} as l2BitcoinRedeemerAddress is not configured.`,
      );
      return;
    }

    logger.debug(
      `Checking for past redemptions for ${this.chainConfig.chainName} (last ${options.pastTimeInMinutes} min)`,
    );

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const pastTime = currentTime - options.pastTimeInMinutes * 60;

      const { startBlock, endBlock } = await this._getBlocksByTimestampEVM(
        pastTime,
        options.latestBlock,
      );

      if (startBlock < 0 || endBlock < startBlock) {
        logger.warn(
          `checkForPastRedemptions | Invalid block range calculated: [${startBlock}, ${endBlock}]. Skipping check.`,
        );
        return;
      }

      logger.debug(
        `checkForPastRedemptions | Querying RedemptionRequestedOnL2 events between blocks ${startBlock} and ${endBlock}`,
      );

      const events = await this.l2BitcoinRedeemerContract.queryFilter(
        this.l2BitcoinRedeemerContract.filters.RedemptionRequestedOnL2(),
        startBlock,
        endBlock,
      );

      if (events.length > 0) {
        logger.debug(
          `checkForPastRedemptions | Found ${events.length} past RedemptionRequestedOnL2 events for ${this.chainConfig.chainName}`,
        );

        for (const event of events) {
          if (!event.args) {
            logger.warn('checkForPastRedemptions | Event args are undefined, skipping event');
            continue;
          }

          const { amount, redeemerOutputScript, nonce } = event.args;
          const eventData: RedemptionRequestedEventData = {
            redeemerOutputScript,
            amount,
            l2TransactionHash: event.transactionHash,
          };

          const redemptionId = eventData.l2TransactionHash;
          const existing = await RedemptionStore.getById(redemptionId);
          if (existing) {
            logger.debug(
              `checkForPastRedemptions | Redemption already exists for L2 tx: ${redemptionId}, skipping.`,
            );
            continue;
          }

          logger.debug(
            `checkForPastRedemptions | Processing missed redemption event: ${redemptionId}`,
          );

          const now = Date.now();
          const redemption: Redemption = {
            id: redemptionId,
            chainId: this.chainConfig.chainName,
            event: eventData,
            serializedVaaBytes: null,
            vaaStatus: RedemptionStatus.PENDING,
            l1SubmissionTxHash: null,
            status: RedemptionStatus.PENDING,
            error: null,
            dates: {
              createdAt: now,
              vaaFetchedAt: null,
              l1SubmittedAt: null,
              completedAt: null,
              lastActivityAt: now,
            },
            logs: [`Redemption created from past event check at ${new Date(now).toISOString()}`],
          };
          await RedemptionStore.create(redemption);
          createLoggerWithCorrelation({
            redemptionId,
            chainName: this.chainConfig.chainName,
            fromStatus: 'RECOVERED',
            toStatus: 'PENDING',
            operation: 'redemption_created_from_past',
            l2TxHash: eventData.l2TransactionHash,
          }).info('Redemption state change: RECOVERED → PENDING (from past event check)');
        }
      } else {
        logger.debug(
          `checkForPastRedemptions | No missed redemption events found for ${this.chainConfig.chainName}`,
        );
      }
    } catch (error: any) {
      logErrorContext(
        `checkForPastRedemptions | Error checking past redemptions for ${this.chainConfig.chainName}: ${error.message}`,
        error,
        { chainName: this.chainConfig.chainName },
      );
    }
  }
}
