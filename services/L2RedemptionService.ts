import { ethers } from 'ethers';
import { ChainId } from '@wormhole-foundation/sdk';
import { WormholeVaaService } from './WormholeVaaService.js';
import { L1RedemptionHandler } from '../handlers/L1RedemptionHandler.js';
import logger, { logErrorContext } from '../utils/Logger.js';
import { L2BitcoinRedeemerABI } from '../interfaces/L2BitcoinRedeemer.js';
import {
  Redemption,
  RedemptionStatus,
  RedemptionRequestedEventData,
  BitcoinTxUtxo,
} from '../types/Redemption.type.js';
import { RedemptionStore } from '../utils/RedemptionStore.js';

export class L2RedemptionService {
  private l2Provider: ethers.providers.JsonRpcProvider;
  private l2RpcUrl: string;
  private l2BitcoinRedeemerContract: ethers.Contract;
  private wormholeVaaService: WormholeVaaService;
  private l1RedemptionHandler: L1RedemptionHandler;

  private l2WormholeChainId: number;
  private l2WormholeGatewayAddress: string; // Emitter address on L2 for VAA fetching

  constructor(
    l2RpcUrl: string,
    l2BitcoinRedeemerAddress: string,
    relayerL1PrivateKey: string,
    l1RpcUrl: string,
    l1BitcoinRedeemerAddress: string,
    l2WormholeChainId: number,
    l2WormholeGatewayAddress: string,
  ) {
    this.l2RpcUrl = l2RpcUrl;
    this.l2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
    this.l2BitcoinRedeemerContract = new ethers.Contract(
      l2BitcoinRedeemerAddress,
      L2BitcoinRedeemerABI,
      this.l2Provider,
    );

    this.l2WormholeChainId = l2WormholeChainId;
    this.l2WormholeGatewayAddress = l2WormholeGatewayAddress;

    this.l1RedemptionHandler = new L1RedemptionHandler(
      l1RpcUrl,
      l1BitcoinRedeemerAddress,
      relayerL1PrivateKey,
    );

    logger.info(
      `L2RedemptionService initialized for L2 contract ${l2BitcoinRedeemerAddress} on ${l2RpcUrl}. Listening for 'RedemptionRequested' event.`,
    );
    logger.info(
      `Wormhole VAA Service configured for L2 Wormhole Gateway: ${l2WormholeGatewayAddress} on chain ID: ${l2WormholeChainId}.`,
    );
    logger.info(
      `L1 Redemption Handler configured for L1BitcoinRedeemer: ${l1BitcoinRedeemerAddress} on ${l1RpcUrl}.`,
    );
  }

  public async initialize(): Promise<void> {
    this.wormholeVaaService = await WormholeVaaService.create(this.l2RpcUrl);
  }

  public startListening(): void {
    if (!this.l2BitcoinRedeemerContract.interface.events['RedemptionRequested']) {
      logErrorContext(
        "L2 contract ABI does not seem to contain 'RedemptionRequested' event. Cannot listen for events.",
        new Error('Missing RedemptionRequested in ABI'),
      );
      return;
    }
    logger.info(
      `Starting to listen for 'RedemptionRequested' events from ${this.l2BitcoinRedeemerContract.address}`,
    );

    this.l2BitcoinRedeemerContract.on(
      'RedemptionRequested',
      async (
        walletPubKeyHash: string, // event.args[0] - bytes20
        mainUtxo: BitcoinTxUtxo, // event.args[1] - struct BitcoinTx.UTXO
        redeemerOutputScript: string, // event.args[2] - bytes
        amount: ethers.BigNumber, // event.args[3] - uint64
        rawEvent: ethers.Event, // The full event object from ethers.js
      ) => {
        const eventData: RedemptionRequestedEventData = {
          walletPubKeyHash,
          mainUtxo,
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
          event: eventData,
          vaaBytes: null,
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
        logger.info(`Redemption request persisted for L2 tx: ${redemptionId}`);
      },
    );

    this.l2Provider.on('error', (error) => {
      logErrorContext('L2 Provider emitted an error:', error);
    });
  }

  public stopListening(): void {
    logger.info(
      `Stopping 'RedemptionRequested' event listener for ${this.l2BitcoinRedeemerContract.address}.`,
    );
    this.l2BitcoinRedeemerContract.removeAllListeners('RedemptionRequested');
  }

  private async handleRedemptionRequest(eventData: RedemptionRequestedEventData): Promise<void> {
    logger.info(
      `Processing redemption request triggered by L2 tx: ${eventData.l2TransactionHash}. Data: ${JSON.stringify(eventData)}`,
    );

    try {
      const vaaDetails = await this.wormholeVaaService.fetchAndVerifyVaaForL2Event(
        eventData.l2TransactionHash,
        this.l2WormholeChainId as ChainId,
        this.l2WormholeGatewayAddress,
      );

      if (!vaaDetails || !vaaDetails.vaaBytes || !vaaDetails.parsedVaa) {
        logErrorContext(
          `Failed to fetch or verify VAA for L2 transaction ${eventData.l2TransactionHash}. Halting process for this event.`,
          new Error('VAA fetch or verification failed'),
        );
        return;
      }

      // Log details from the parsed VAA for better traceability
      logger.info(
        `Successfully fetched and verified VAA for L2 Tx: ${eventData.l2TransactionHash}. ` +
          `VAA Sequence: ${vaaDetails.parsedVaa.sequence}, ` +
          `Emitter: ${vaaDetails.parsedVaa.emitterAddress.toString()}, ` +
          `Consistency: ${vaaDetails.parsedVaa.consistencyLevel}.`,
      );

      // VAA is fetched and verified, now proceed to L1 submission.
      // The VAA itself (vaaDetails.vaaBytes) is not passed to submitRedemptionDataToL1
      // as per the current design where L1BitcoinRedeemer does not take VAA as direct input.
      // The VAA fetch and verification acts as a gate.
      const success = await this.l1RedemptionHandler.submitRedemptionDataToL1(
        eventData,
        vaaDetails.vaaBytes,
      );

      if (success) {
        logger.info(
          `Successfully submitted VAA to L1 and initiated redemption for L2 Tx: ${eventData.l2TransactionHash}.`,
        );
      } else {
        logErrorContext(
          `Failed to submit VAA to L1 or L1 redemption failed for L2 Tx: ${eventData.l2TransactionHash}.`,
          new Error('L1 submission/redemption failed'),
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logErrorContext(
        `Unhandled error during redemption request processing for L2 Tx: ${eventData.l2TransactionHash}. Error: ${err.message}`,
        err,
      );
    }
  }

  public static async processPendingRedemptions(
    wormholeVaaService: WormholeVaaService,
    l2WormholeChainId: number,
    l2WormholeGatewayAddress: string,
  ): Promise<void> {
    const pending = await RedemptionStore.getByStatus(RedemptionStatus.PENDING);
    const vaaFailed = await RedemptionStore.getByStatus(RedemptionStatus.VAA_FAILED);
    const toProcess = [...pending, ...vaaFailed];
    for (const redemption of toProcess) {
      try {
        const vaaDetails = await wormholeVaaService.fetchAndVerifyVaaForL2Event(
          redemption.id,
          l2WormholeChainId as ChainId,
          l2WormholeGatewayAddress,
        );
        if (vaaDetails && vaaDetails.vaaBytes) {
          redemption.vaaBytes = Buffer.from(vaaDetails.vaaBytes).toString('hex');
          redemption.vaaStatus = RedemptionStatus.VAA_FETCHED;
          redemption.status = RedemptionStatus.VAA_FETCHED;
          redemption.dates.vaaFetchedAt = Date.now();
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = null;
          redemption.logs?.push(`VAA fetched at ${new Date().toISOString()}`);
          await RedemptionStore.update(redemption);
          logger.info(`VAA fetched and redemption updated: ${redemption.id}`);
        } else {
          redemption.vaaStatus = RedemptionStatus.VAA_FAILED;
          redemption.status = RedemptionStatus.VAA_FAILED;
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = 'VAA fetch/verify failed';
          redemption.logs?.push(`VAA fetch failed at ${new Date().toISOString()}`);
          await RedemptionStore.update(redemption);
          logger.warn(`VAA fetch failed for redemption: ${redemption.id}`);
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
      }
    }
  }

  public static async processVaaFetchedRedemptions(
    l1RedemptionHandler: L1RedemptionHandler,
  ): Promise<void> {
    const vaaFetched = await RedemptionStore.getByStatus(RedemptionStatus.VAA_FETCHED);
    for (const redemption of vaaFetched) {
      try {
        if (!redemption.vaaBytes) {
          redemption.status = RedemptionStatus.FAILED;
          redemption.error = 'No VAA bytes present for L1 submission.';
          redemption.dates.lastActivityAt = Date.now();
          redemption.logs?.push(
            `L1 submission failed at ${new Date().toISOString()}: No VAA bytes.`,
          );
          await RedemptionStore.update(redemption);
          logger.error(`Redemption ${redemption.id} missing VAA bytes, cannot submit to L1.`);
          continue;
        }
        // Convert hex string to Uint8Array
        const vaaBytes = Buffer.from(redemption.vaaBytes, 'hex');
        const success = await l1RedemptionHandler.submitRedemptionDataToL1(
          redemption.event,
          vaaBytes,
        );
        if (success) {
          redemption.status = RedemptionStatus.COMPLETED;
          redemption.dates.completedAt = Date.now();
          redemption.dates.l1SubmittedAt = Date.now();
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = null;
          redemption.logs?.push(`L1 submission succeeded at ${new Date().toISOString()}`);
          // Optionally, set l1SubmissionTxHash if available from handler (not currently returned)
          await RedemptionStore.update(redemption);
          logger.info(
            `Redemption ${redemption.id} successfully submitted to L1 and marked COMPLETED.`,
          );
        } else {
          redemption.status = RedemptionStatus.FAILED;
          redemption.dates.lastActivityAt = Date.now();
          redemption.error = 'L1 submission failed (see logs for details)';
          redemption.logs?.push(`L1 submission failed at ${new Date().toISOString()}`);
          await RedemptionStore.update(redemption);
          logger.error(`Redemption ${redemption.id} failed L1 submission.`);
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
      }
    }
  }
}
