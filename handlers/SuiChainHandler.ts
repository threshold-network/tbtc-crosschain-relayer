import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/bcs';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import type { SuiEvent, SuiEventFilter } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Chain, ChainContext, TBTCBridge } from '@wormhole-foundation/sdk-connect';
import { ethers } from 'ethers';
import type { TransactionReceipt } from '@ethersproject/providers';

import { CHAIN_TYPE, NETWORK } from '../config/schemas/common.schema.js';
import type { SuiChainConfig } from '../config/schemas/sui.chain.schema.js';
import logger, { logErrorContext } from '../utils/Logger.js';
import { BaseChainHandler } from './BaseChainHandler.js';
import { type Deposit } from '../types/Deposit.type.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
import {
  updateToAwaitingWormholeVAA,
  updateToBridgedDeposit,
  createDeposit,
} from '../utils/Deposits.js';
import { DepositStore } from '../utils/DepositStore.js';
import { parseDepositInitializedEvent } from '../utils/SuiMoveEventParser.js';

const TOKENS_TRANSFERRED_SIG = ethers.utils.id(
  'TokensTransferredWithPayload(uint256,bytes32,uint64)',
);

/**
 * Chain handler for SUI blockchain integration.
 * Handles SUI L2 operations including deposit processing, event monitoring, and Wormhole bridging.
 */
export class SuiChainHandler extends BaseChainHandler<SuiChainConfig> {
  private suiClient: SuiClient | undefined;
  private keypair: Ed25519Keypair | undefined;
  private suiWormholeContext: ChainContext<'Mainnet' | 'Testnet' | 'Devnet', Chain>;

  constructor(config: SuiChainConfig) {
    super(config);
    logger.debug(`Constructing SuiChainHandler for ${this.config.chainName}`);
    if (config.chainType !== CHAIN_TYPE.SUI) {
      throw new Error(`Incorrect chain type ${config.chainType} provided to SuiChainHandler.`);
    }
  }

  protected override async initializeL2(): Promise<void> {
    logger.debug(`Initializing Sui L2 components for ${this.config.chainName}`);

    if (!this.config.l2Rpc) {
      logger.warn(`Sui L2 RPC not configured for ${this.config.chainName}. L2 features disabled.`);
      return;
    }

    try {
      // Initialize SUI client
      this.suiClient = new SuiClient({ url: this.config.l2Rpc });

      // Initialize keypair - support both base64 and Bech32 formats
      if (this.config.suiPrivateKey.startsWith('suiprivkey1')) {
        // Handle Bech32-encoded private key
        const decoded = decodeSuiPrivateKey(this.config.suiPrivateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
      } else {
        // Handle base64-encoded private key
        const privateKeyBytes = fromBase64(this.config.suiPrivateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
      }

      // Get SUI Wormhole context for cross-chain operations
      this.suiWormholeContext = this.wormhole.getChain('Sui' as Chain);

      logger.info(`Sui L2 client initialized for ${this.config.chainName}`);
      logger.info(`SUI address: ${this.keypair.getPublicKey().toSuiAddress()}`);
    } catch (error: any) {
      logErrorContext(`Failed to initialize Sui L2 client for ${this.config.chainName}`, error);
      throw error;
    }
  }

  private pollingInterval: NodeJS.Timeout | null = null;
  private lastEventCursor: string | null = null;

  protected override async setupL2Listeners(): Promise<void> {
    logger.info(
      `Setting up L2 listeners for ${this.config.chainName}, useEndpoint: ${this.config.useEndpoint}, suiClient: ${!!this.suiClient}`,
    );

    if (this.config.useEndpoint || !this.suiClient) {
      logger.info(
        `Sui L2 Listeners skipped for ${this.config.chainName} (using Endpoint: ${this.config.useEndpoint} or client not initialized: ${!this.suiClient}).`,
      );
      return;
    }

    try {
      // SUI doesn't support WebSocket subscriptions, so we use polling
      const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds

      const eventFilter: SuiEventFilter = {
        MoveModule: {
          package: this.config.l2PackageId,
          module: 'BitcoinDepositor',
        },
      };

      // Start polling for events
      this.pollingInterval = setInterval(async () => {
        try {
          logger.debug(
            `Polling SUI events for ${this.config.chainName}, cursor: ${this.lastEventCursor || 'null'}`,
            {
              eventFilter: eventFilter,
              l2PackageId: this.config.l2PackageId,
              l2ContractAddress: this.config.l2BitcoinDepositorAddress,
            },
          );

          const response = await this.suiClient!.queryEvents({
            query: eventFilter,
            cursor: this.lastEventCursor as any,
            limit: 50,
            order: 'ascending',
          });

          logger.debug(
            `SUI event query response for ${this.config.chainName}: ${response.data.length} events, hasNextPage: ${response.hasNextPage}`,
            {
              cursor: this.lastEventCursor,
              nextCursor: response.nextCursor,
              hasNextPage: response.hasNextPage,
              responseDataLength: response.data?.length || 0,
              responseKeys: Object.keys(response || {}),
            },
          );

          if (response.data.length > 0) {
            logger.info(
              `Found ${response.data.length} new SUI events for ${this.config.chainName}`,
            );

            for (const event of response.data) {
              await this.handleSuiDepositEvent(event);
            }

            // Update cursor after processing events to avoid reprocessing the same events
            // This should be done whenever we have a nextCursor, regardless of hasNextPage
            if (response.nextCursor) {
              this.lastEventCursor = response.nextCursor as any;
              logger.debug(
                `Updated SUI event cursor for ${this.config.chainName}: ${this.lastEventCursor}`,
              );
            }
          }
        } catch (error: any) {
          logErrorContext(`Error polling SUI events for ${this.config.chainName}`, error);
        }
      }, POLLING_INTERVAL_MS);

      logger.info(
        `Sui L2 event polling started for ${this.config.chainName} (interval: ${POLLING_INTERVAL_MS}ms)`,
      );
    } catch (error: any) {
      logErrorContext(`Failed to setup Sui L2 listeners for ${this.config.chainName}`, error);
      throw error;
    }
  }

  // Add cleanup method to stop polling
  async cleanup(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info(`Stopped SUI event polling for ${this.config.chainName}`);
    }
  }

  override async getLatestBlock(): Promise<number> {
    if (this.config.useEndpoint || !this.suiClient) {
      return 0;
    }

    try {
      const checkpoint = await this.suiClient.getLatestCheckpointSequenceNumber();
      return Number(checkpoint);
    } catch (error: any) {
      logErrorContext(`Failed to get latest checkpoint for ${this.config.chainName}`, error);
      return 0;
    }
  }

  override async checkForPastDeposits(options: {
    pastTimeInMinutes: number;
    latestBlock: number;
  }): Promise<void> {
    if (this.config.useEndpoint || !this.suiClient) {
      return;
    }

    try {
      const eventFilter: SuiEventFilter = {
        MoveModule: {
          package: this.config.l2PackageId,
          module: 'BitcoinDepositor',
        },
      };

      logger.debug(`checkForPastDeposits filter for ${this.config.chainName}:`, {
        package: this.config.l2PackageId,
        module: 'BitcoinDepositor',
      });

      // Query events in batches
      let cursor = null;
      let hasNextPage = true;
      let totalEvents = 0;

      while (hasNextPage) {
        const response: any = await this.suiClient.queryEvents({
          query: eventFilter,
          cursor,
          limit: 50,
          order: 'descending',
        });

        logger.debug(
          `checkForPastDeposits batch for ${this.config.chainName}: ${response.data.length} events`,
        );
        totalEvents += response.data.length;

        for (const eventData of response.data) {
          await this.handleSuiDepositEvent(eventData, true); // true = isPastEvent
        }

        hasNextPage = response.hasNextPage;
        cursor = response.nextCursor;
      }

      logger.debug(
        `checkForPastDeposits completed for ${this.config.chainName}: ${totalEvents} total events processed`,
      );

      logger.debug(
        `Checked past deposits for ${this.config.chainName}: ${options.pastTimeInMinutes} minutes`,
      );
    } catch (error: any) {
      logErrorContext(`Failed to check past deposits for ${this.config.chainName}`, error);
    }
  }

  override supportsPastDepositCheck(): boolean {
    return !!(this.config.l2Rpc && !this.config.useEndpoint);
  }

  /**
   * Override finalizeDeposit to:
   *  1) finalize on L1 (super call)
   *  2) parse Wormhole transferSequence from logs
   *  3) update deposit to AWAITING_WORMHOLE_VAA
   */
  override async finalizeDeposit(deposit: Deposit): Promise<TransactionReceipt | undefined> {
    const finalizedDepositReceipt = await super.finalizeDeposit(deposit);

    if (!finalizedDepositReceipt) {
      return;
    }

    logger.info(`Processing Sui deposit finalization for ${deposit.id}...`);

    const l1Receipt = finalizedDepositReceipt;
    if (!l1Receipt) {
      logger.warn(`No finalize receipt found for deposit ${deposit.id}; cannot parse logs.`);
      return finalizedDepositReceipt;
    }

    // More robust event finding logic
    let transferSequence: string | null = null;
    let eventTxHash: string | null = null;

    try {
      const logs = l1Receipt.logs || [];

      // Method 1: Try parsing all logs regardless of topics
      for (const log of logs) {
        try {
          // Try to parse the log with our interface
          const parsedLog = this.l1BitcoinDepositorProvider.interface.parseLog(log);

          // Check if this is the TokensTransferredWithPayload event
          if (
            parsedLog.name === 'TokensTransferredWithPayload' &&
            parsedLog.args.transferSequence
          ) {
            transferSequence = parsedLog.args.transferSequence.toString();
            eventTxHash = l1Receipt.transactionHash;
            logger.info(
              `Found transfer sequence ${transferSequence} in parsed log for deposit ${deposit.id}`,
            );
            break;
          }
        } catch (parseError) {
          // This log doesn't match our interface
        }
      }

      // Method 2: If not found, check by event signature in any topic position
      if (!transferSequence) {
        for (const log of logs) {
          // Check if any topic contains our event signature
          if (log.topics.some((topic) => topic === TOKENS_TRANSFERRED_SIG)) {
            try {
              const parsedLog = this.l1BitcoinDepositorProvider.interface.parseLog(log);
              if (parsedLog.args.transferSequence) {
                transferSequence = parsedLog.args.transferSequence.toString();
                eventTxHash = l1Receipt.transactionHash;
                logger.info(
                  `Found transfer sequence ${transferSequence} by signature search for deposit ${deposit.id}`,
                );
                break;
              }
            } catch (error) {
              logger.debug(`Failed to parse log with matching signature: ${error}`);
            }
          }
        }
      }

      // Method 3: If still not found, filter logs by contract address
      if (!transferSequence) {
        const contractLogs = logs.filter(
          (log) =>
            log.address.toLowerCase() === this.config.l1BitcoinDepositorAddress.toLowerCase(),
        );

        for (const log of contractLogs) {
          try {
            const parsedLog = this.l1BitcoinDepositorProvider.interface.parseLog(log);
            if (
              parsedLog.name === 'TokensTransferredWithPayload' &&
              parsedLog.args.transferSequence
            ) {
              transferSequence = parsedLog.args.transferSequence.toString();
              eventTxHash = l1Receipt.transactionHash;
              logger.info(
                `Found transfer sequence ${transferSequence} by contract address filter for deposit ${deposit.id}`,
              );
              break;
            }
          } catch (error) {
            // Skip logs that don't parse as TokensTransferredWithPayload
          }
        }
      }
    } catch (error: any) {
      logErrorContext(`Error parsing L1 logs for deposit ${deposit.id}`, error);
    }

    // If still not found in the same transaction, implement the recovery logic
    if (!transferSequence) {
      logger.warn(
        `Transfer sequence not found in finalization transaction for deposit ${deposit.id}`,
      );

      // Try to find it immediately in subsequent blocks
      try {
        const searchResult = await this.searchForTransferSequence(
          deposit,
          l1Receipt.blockNumber,
          5,
        );
        if (searchResult) {
          transferSequence = searchResult.sequence;
          eventTxHash = searchResult.txHash;
        }
      } catch (searchError) {
        logErrorContext(`Failed to search for transfer sequence`, searchError);
      }
    }

    if (transferSequence && eventTxHash) {
      await updateToAwaitingWormholeVAA(eventTxHash, deposit, transferSequence);
      logger.info(
        `Deposit ${deposit.id} now awaiting Wormhole VAA with sequence ${transferSequence}`,
      );
    } else {
      logger.warn(
        `Could not find transfer sequence for deposit ${deposit.id}. It will be retried in the hourly recovery task.`,
      );
    }

    return finalizedDepositReceipt;
  }

  /**
   * Processes SUI DepositInitialized Move events from the BitcoinDepositor contract.
   *
   * **Event Processing Strategy:**
   * This method uses the `parseDepositInitializedEvent` utility function for robust
   * binary data parsing rather than direct event casting. This approach is preferred because:
   *
   * - ✅ **Handles Binary Data Correctly**: SUI Move events contain vector<u8> fields that
   *   can be serialized as either `number[]` arrays or hex strings depending on the RPC endpoint
   * - ✅ **Type Safety**: Provides comprehensive validation and type conversion
   * - ✅ **Error Resilience**: Includes specific error handling for Bitcoin parsing failures
   * - ✅ **Address Conversion**: Properly converts binary address data to SUI hex format
   *
   * **Move Event Structure:**
   * ```move
   * public struct DepositInitialized has copy, drop {
   *     funding_tx: vector<u8>,      // Bitcoin transaction bytes
   *     deposit_reveal: vector<u8>,  // Reveal data (112 bytes)
   *     deposit_owner: vector<u8>,   // L2 deposit owner address
   *     sender: vector<u8>,          // L2 transaction sender address
   * }
   * ```
   *
   * **Processing Flow:**
   * 1. Parse binary event fields using utility function
   * 2. Create deposit object from parsed Bitcoin data
   * 3. Check for existing deposits to prevent duplicates
   * 4. Save to database and log successful processing
   *
   * @param event - SUI Move event containing DepositInitialized data
   * @param _isPastEvent - Whether this is a historical event (unused but kept for interface compatibility)
   */
  private async handleSuiDepositEvent(event: SuiEvent, _isPastEvent = false): Promise<void> {
    try {
      logger.debug(
        `handleSuiDepositEvent called for ${this.config.chainName}, event type: ${event.type}`,
      );

      // Use the utility function to parse the event data
      const parsedEvent = parseDepositInitializedEvent(event, this.config.chainName);

      if (!parsedEvent) {
        // Event parsing failed or event is not a DepositInitialized event
        logger.debug(`Event parsing returned null for ${this.config.chainName}`);
        return;
      }

      logger.info(`Successfully parsed SUI deposit event for ${this.config.chainName}`);

      // For SUI, we need to set the correct vault address since it's not included in the event
      // Update the reveal object with the correct vault address from the config
      const revealWithVault = {
        ...parsedEvent.reveal,
        vault: this.config.vaultAddress,
      };

      logger.info(`Setting vault address for SUI deposit: ${this.config.vaultAddress}`);

      // Create deposit using the parsed event data
      // Note: The 0x prefix handling is done in BaseChainHandler.initializeDeposit for SUI chains
      logger.debug('Creating deposit from parsed SUI event', {
        fundingTxVersion: parsedEvent.fundingTransaction.version,
        fundingOutputIndex: parsedEvent.reveal.fundingOutputIndex,
        depositOwner: parsedEvent.depositOwner,
        sender: parsedEvent.sender,
        chainName: this.config.chainName,
      });

      const deposit = createDeposit(
        parsedEvent.fundingTransaction,
        revealWithVault,
        parsedEvent.depositOwner,
        parsedEvent.sender,
        this.config.chainName,
      );

      logger.debug(`Created deposit object for SUI event:`, {
        depositId: deposit.id,
        depositOwner: parsedEvent.depositOwner,
        sender: parsedEvent.sender,
        fundingOutputIndex: parsedEvent.reveal.fundingOutputIndex,
        chainName: this.config.chainName,
        status: deposit.status,
        fundingTxHash: deposit.fundingTxHash,
        outputIndex: deposit.outputIndex,
      });

      // Check if deposit already exists to prevent duplicates
      const existingDeposit = await DepositStore.getById(deposit.id);
      if (existingDeposit) {
        logger.debug(
          `Deposit ${deposit.id} already exists for ${this.config.chainName}. Skipping creation.`,
        );
        return;
      }

      // Save deposit to database
      await DepositStore.create(deposit);

      logger.info(`SUI deposit successfully created and saved: ${deposit.id}`, {
        depositOwner: deposit.L1OutputEvent.l2DepositOwner,
        sender: deposit.L1OutputEvent.l2Sender,
        fundingOutputIndex: deposit.outputIndex,
        chainName: this.config.chainName,
        status: deposit.status,
        fundingTxHash: deposit.fundingTxHash,
      });
    } catch (error: any) {
      logErrorContext(`Error handling SUI deposit event for ${this.config.chainName}`, error);
    }
  }

  /**
   * Fetch VAA from Wormhole API using sequence number
   * @param sequence - The transfer sequence number
   * @returns Base64 encoded VAA bytes or null if not available
   */
  private async fetchVAAFromAPI(sequence: string): Promise<string | null> {
    try {
      // Get the correct emitter chain and address based on network
      const emitterChain = this.config.network === NETWORK.MAINNET ? '2' : '10002'; // Ethereum mainnet or Sepolia

      // The emitter is the Token Bridge contract on L1 (Ethereum)
      // Wormhole Token Bridge addresses:
      // Mainnet: 0x3ee18B2214AFF97000D974cf647E7C347E8fa585
      // Sepolia: 0xDB5492265f6038831E89f495670fF909aDe94bd9
      const tokenBridgeAddress =
        this.config.network === NETWORK.MAINNET
          ? '0x3ee18B2214AFF97000D974cf647E7C347E8fa585'
          : '0xDB5492265f6038831E89f495670fF909aDe94bd9';
      const emitterAddress = tokenBridgeAddress.slice(2).toLowerCase().padStart(64, '0');

      const vaaId = `${emitterChain}/${emitterAddress}/${sequence}`;
      logger.debug(`Fetching VAA with ID: ${vaaId}`);

      // Wormhole API endpoint
      const wormholeApi =
        this.config.network === NETWORK.MAINNET
          ? 'https://api.wormholescan.io'
          : 'https://api.testnet.wormholescan.io';

      const maxAttempts = 20; // 10 minutes with 30 second intervals
      let attempts = 0;

      while (attempts < maxAttempts) {
        try {
          const response = await fetch(`${wormholeApi}/api/v1/vaas/${vaaId}`);

          if (response.ok) {
            const data = await response.json();
            if (data && data.data && data.data.vaa) {
              logger.info(`VAA found for sequence ${sequence}!`);
              return data.data.vaa;
            }
          } else if (response.status === 404) {
            logger.debug(
              `VAA not ready yet for sequence ${sequence} (attempt ${attempts + 1}/${maxAttempts})`,
            );
          } else {
            logger.warn(`Unexpected response status ${response.status} when fetching VAA`);
          }
        } catch (error: any) {
          logger.warn(`Error fetching VAA: ${error.message}`);
        }

        attempts++;
        if (attempts < maxAttempts) {
          logger.debug(`Waiting 30 seconds before retry...`);
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }
      }

      return null;
    } catch (error: any) {
      logErrorContext(`Error in fetchVAAFromAPI for sequence ${sequence}`, error);
      return null;
    }
  }

  public async bridgeSuiDeposit(deposit: Deposit): Promise<void> {
    if (!this.suiClient || !this.keypair) {
      logger.warn(`Sui connection not initialized. Cannot bridge deposit ${deposit.id}.`);
      return;
    }

    if (deposit.status !== DepositStatus.AWAITING_WORMHOLE_VAA) return;

    try {
      if (!deposit.wormholeInfo?.transferSequence) {
        logger.warn(`No transfer sequence for deposit ${deposit.id}`);
        return;
      }

      logger.info(`Bridging deposit ${deposit.id} on Sui...`);
      logger.info(
        `Using sequence ${deposit.wormholeInfo.transferSequence} from L1 tx ${deposit.wormholeInfo.txHash}`,
      );

      // Fetch VAA using Wormhole API directly
      const vaaBytes = await this.fetchVAAFromAPI(deposit.wormholeInfo.transferSequence);

      if (!vaaBytes) {
        logger.warn(
          `VAA not yet available for deposit ${deposit.id}, sequence ${deposit.wormholeInfo.transferSequence}`,
        );
        return;
      }

      logger.info(`VAA found for deposit ${deposit.id}. Posting VAA to Sui...`);

      // Convert base64 VAA to array format for Sui Move call
      const vaaArray = Array.from(Buffer.from(vaaBytes, 'base64')) as number[];

      // Validate VAA array before using it in the transaction
      if (vaaArray.length === 0) {
        logger.error(
          `VAA array is empty for deposit ${deposit.id}. Cannot proceed with transaction.`,
        );
        throw new Error(`Invalid VAA data: array is empty`);
      }

      logger.debug(`Prepared VAA for Sui transaction`, {
        depositId: deposit.id,
        vaaLength: vaaArray.length,
        transferSequence: deposit.wormholeInfo.transferSequence,
      });

      // Create Sui transaction
      const tx = new Transaction();

      try {
        // Call receiveWormholeMessages directly on the BitcoinDepositor contract
        tx.moveCall({
          target: `${this.config.l2PackageId}::BitcoinDepositor::receiveWormholeMessages`,
          arguments: [
            tx.object(this.config.receiverStateId),
            tx.object(this.config.gatewayStateId),
            tx.object(this.config.capabilitiesId),
            tx.object(this.config.treasuryId),
            tx.object(this.config.wormholeCoreId),
            tx.object(this.config.tokenBridgeId),
            tx.object(this.config.tokenStateId),
            tx.pure.vector('u8', vaaArray),
            tx.object('0x6'), // Clock object
          ],
          typeArguments: [this.config.wrappedTbtcType],
        });

        logger.debug(`Constructed Sui transaction for receiveWormholeMessages`, {
          depositId: deposit.id,
          packageId: this.config.l2PackageId,
          receiverStateId: this.config.receiverStateId,
          gatewayStateId: this.config.gatewayStateId,
          capabilitiesId: this.config.capabilitiesId,
          treasuryId: this.config.treasuryId,
          wormholeCoreId: this.config.wormholeCoreId,
          tokenBridgeId: this.config.tokenBridgeId,
          tokenStateId: this.config.tokenStateId,
          wrappedTbtcType: this.config.wrappedTbtcType,
        });

        // Sign and execute transaction
        const result = await this.suiClient.signAndExecuteTransaction({
          transaction: tx,
          signer: this.keypair,
          options: {
            showEffects: true,
            showEvents: true,
          },
        });

        // Validate transaction execution
        if (result.effects?.status?.status !== 'success') {
          const errorMessage = result.effects?.status?.error || 'Unknown transaction error';
          throw new Error(`Transaction failed: ${errorMessage}`);
        }

        if (!result.digest) {
          throw new Error('Transaction executed but no digest returned');
        }

        logger.info(`Successfully submitted VAA to BitcoinDepositor. TX: ${result.digest}`, {
          depositId: deposit.id,
          transactionDigest: result.digest,
          transferSequence: deposit.wormholeInfo.transferSequence,
          gasUsed: result.effects?.gasUsed || 'unknown',
        });

        // Log transaction events for debugging
        if (result.events && result.events.length > 0) {
          logger.debug(`Transaction events for deposit ${deposit.id}:`, {
            eventCount: result.events.length,
            events: result.events.map((event) => ({
              type: event.type,
              sender: event.sender,
            })),
          });
        }

        // Update deposit status to BRIDGED
        await updateToBridgedDeposit(deposit, result.digest);

        logger.info(`Sui bridging completed successfully for deposit ${deposit.id}`);
      } catch (transactionError: any) {
        logger.error(`Failed to execute Sui transaction for deposit ${deposit.id}`, {
          error: transactionError.message,
          depositId: deposit.id,
          transferSequence: deposit.wormholeInfo.transferSequence,
          packageId: this.config.l2PackageId,
        });
        throw transactionError;
      }
    } catch (error: any) {
      const reason = error.message || 'Unknown bridging error';
      logger.warn(`Wormhole bridging failed for deposit ${deposit.id}: ${reason}`, {
        depositId: deposit.id,
        transferSequence: deposit.wormholeInfo?.transferSequence,
        errorType: error.constructor.name,
        errorMessage: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Process all deposits that are in the AWAITING_WORMHOLE_VAA status.
   * This function will attempt to bridge the deposits using the Wormhole protocol.
   */
  public async processWormholeBridging(): Promise<void> {
    if (this.config.chainType !== CHAIN_TYPE.SUI) return; // Only for Sui chains

    const bridgingDeposits = await DepositStore.getByStatus(
      DepositStatus.AWAITING_WORMHOLE_VAA,
      this.config.chainName,
    );
    if (bridgingDeposits.length === 0) return;

    for (const deposit of bridgingDeposits) {
      if (!deposit.wormholeInfo || !deposit.wormholeInfo.transferSequence) {
        logger.warn(`Deposit ${deposit.id} is missing transferSequence. Skipping.`);
        continue;
      }
      await this.bridgeSuiDeposit(deposit);
    }
  }

  /**
   * Recover deposits that are stuck in FINALIZED status by searching for their
   * TokensTransferredWithPayload events in recent blocks
   */
  public async recoverStuckFinalizedDeposits(deposits: Deposit[]): Promise<void> {
    if (!deposits || deposits.length === 0) return;

    logger.info(
      `Attempting to recover ${deposits.length} stuck finalized deposits for ${this.config.chainName}`,
    );

    // Filter to only deposits that have been finalized for more than 5 minutes
    const now = Date.now();
    const RECOVERY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

    const stuckDeposits = deposits.filter((deposit) => {
      if (!deposit.dates.finalizationAt) return false;
      const timeSinceFinalized = now - deposit.dates.finalizationAt;
      return timeSinceFinalized > RECOVERY_DELAY_MS;
    });

    if (stuckDeposits.length === 0) {
      logger.debug(`No deposits have been finalized long enough for recovery`);
      return;
    }

    logger.info(`Found ${stuckDeposits.length} deposits finalized more than 5 minutes ago`);

    for (const deposit of stuckDeposits) {
      try {
        logger.info(`Attempting recovery for deposit ${deposit.id}`);

        // First, we need to find which block to start searching from
        let searchStartBlock: number;

        if (deposit.hashes?.eth?.finalizeTxHash) {
          // If we have the finalization tx hash, use it to get the block number
          const finalizeTxReceipt = await this.l1Provider.getTransactionReceipt(
            deposit.hashes.eth.finalizeTxHash,
          );
          if (!finalizeTxReceipt) {
            logger.warn(`Could not get finalization receipt for deposit ${deposit.id}`);
            continue;
          }
          searchStartBlock = finalizeTxReceipt.blockNumber;
        } else {
          // If no finalization tx hash, estimate the block based on finalization timestamp
          logger.info(
            `Deposit ${deposit.id} missing finalization tx hash, estimating search block...`,
          );

          const currentBlock = await this.l1Provider.getBlockNumber();
          const currentTimestamp = (await this.l1Provider.getBlock(currentBlock)).timestamp;

          // We know finalizationAt exists because we filtered for it earlier
          const finalizationTimestamp = Math.floor(deposit.dates.finalizationAt! / 1000);
          const secondsAgo = currentTimestamp - finalizationTimestamp;
          const blocksAgo = Math.floor(secondsAgo / 12); // ~12 second block time on Ethereum
          searchStartBlock = Math.max(1, currentBlock - blocksAgo);

          logger.info(
            `Estimated search start block: ${searchStartBlock} for deposit ${deposit.id}`,
          );
        }

        // Search for transfer sequence starting from the determined block
        const searchResult = await this.searchForTransferSequence(deposit, searchStartBlock);

        if (searchResult) {
          logger.info(
            `Found transfer sequence ${searchResult.sequence} for deposit ${deposit.id} in recovery`,
          );
          await updateToAwaitingWormholeVAA(searchResult.txHash, deposit, searchResult.sequence);
          logger.info(
            `Successfully recovered deposit ${deposit.id} - updated to AWAITING_WORMHOLE_VAA`,
          );
        } else {
          // Search a wider range if initial search failed
          const widerSearchResult = await this.searchForTransferSequence(
            deposit,
            searchStartBlock - 10,
            30,
          );
          if (widerSearchResult) {
            logger.info(
              `Found transfer sequence ${widerSearchResult.sequence} for deposit ${deposit.id} in wider search`,
            );
            await updateToAwaitingWormholeVAA(
              widerSearchResult.txHash,
              deposit,
              widerSearchResult.sequence,
            );
            logger.info(`Successfully recovered deposit ${deposit.id} with wider search`);
          } else {
            logger.warn(
              `Could not find transfer sequence for deposit ${deposit.id} even with wider search`,
            );
          }
        }
      } catch (error) {
        logErrorContext(`Error recovering deposit ${deposit.id}`, error);
      }
    }
  }

  /**
   * Enhanced search for transfer sequence with configurable block range
   */
  private async searchForTransferSequence(
    deposit: Deposit,
    startBlock: number,
    searchBlocks: number = 15,
  ): Promise<{ sequence: string; txHash: string } | null> {
    try {
      const endBlock = Math.min(startBlock + searchBlocks, await this.l1Provider.getBlockNumber());

      logger.debug(
        `Searching for TokensTransferredWithPayload events in blocks ${startBlock}-${endBlock} for deposit ${deposit.id}`,
      );

      // Search for TokensTransferredWithPayload events by topic signature
      // This catches events from any contract, not just L1BitcoinDepositor
      const logs = await this.l1Provider.getLogs({
        topics: [TOKENS_TRANSFERRED_SIG],
        fromBlock: startBlock,
        toBlock: endBlock,
      });

      logger.info(
        `Found ${logs.length} TokensTransferredWithPayload events in blocks ${startBlock}-${endBlock}`,
      );

      // Log each event found for debugging
      logs.forEach((log, index) => {
        logger.debug(
          `Event ${index}: from ${log.address} in block ${log.blockNumber}, tx: ${log.transactionHash}`,
        );
      });

      // Filter to find events from L1BitcoinDepositor
      const l1BitcoinDepositorAddress = this.config.l1BitcoinDepositorAddress.toLowerCase();

      for (const log of logs) {
        try {
          // Check if this event is from L1BitcoinDepositor
          if (log.address.toLowerCase() === l1BitcoinDepositorAddress) {
            const parsedLog = this.l1BitcoinDepositorProvider.interface.parseLog(log);

            if (parsedLog.args.transferSequence) {
              logger.info(
                `Found transfer sequence ${parsedLog.args.transferSequence} from L1BitcoinDepositor in tx ${log.transactionHash}`,
              );

              return {
                sequence: parsedLog.args.transferSequence.toString(),
                txHash: log.transactionHash,
              };
            }
          }
        } catch (error) {
          logger.debug(`Failed to parse log: ${error}`);
        }
      }

      logger.debug(
        `No transfer sequence found from L1BitcoinDepositor in blocks ${startBlock}-${endBlock} for deposit ${deposit.id}`,
      );
      return null;
    } catch (error: any) {
      logErrorContext(`Error searching for transfer sequence`, error);
      return null;
    }
  }
}
