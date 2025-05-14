import { ethers } from 'ethers';
import { NonceManager } from '@ethersproject/experimental';

import { ChainHandlerInterface } from '../interfaces/ChainHandler.interface';
import { ChainConfig } from '../types/ChainConfig.type';
import { Deposit } from '../types/Deposit.type';
import { FundingTransaction } from '../types/FundingTransaction.type';
import { LogError, LogMessage, LogWarning } from '../utils/Logs';
import {
  getJsonById,
  writeJson,
} from '../utils/JsonUtils';
import {
  createDeposit,
  getDepositId,
} from '../utils/Deposits';
import { getFundingTxHash } from '../utils/GetTransactionHash';

import { L2BitcoinDepositorABI } from '../interfaces/L2BitcoinDepositor';
import { logDepositError } from '../utils/AuditLog';

import { BaseChainHandler } from './BaseChainHandler';

export class EVMChainHandler
  extends BaseChainHandler
  implements ChainHandlerInterface
{
  protected l2Provider: ethers.providers.JsonRpcProvider | undefined;
  protected l2Signer: ethers.Wallet | undefined;
  protected nonceManagerL2: NonceManager | undefined;
  protected l2BitcoinDepositor: ethers.Contract | undefined;
  protected l2BitcoinDepositorProvider: ethers.Contract | undefined;

  constructor(config: ChainConfig) {
    super(config);
    LogMessage(`Constructing EVMChainHandler for ${this.config.chainName}`);
  }

  protected async initializeL2(): Promise<void> {
    LogMessage(`Initializing EVM L2 components for ${this.config.chainName}`);

    if (this.config.l2Rpc) {
      this.l2Provider = new ethers.providers.JsonRpcProvider(this.config.l2Rpc);
      LogMessage(`EVM L2 Provider created for ${this.config.chainName}`);

      if (this.config.privateKey) {
        this.l2Signer = new ethers.Wallet(
          this.config.privateKey,
          this.l2Provider
        );
        this.nonceManagerL2 = new NonceManager(this.l2Signer);
        LogMessage(
          `EVM L2 Signer and NonceManager created for ${this.config.chainName}`
        );
      }

      if (this.config.l2ContractAddress) {
        if (this.nonceManagerL2) {
          this.l2BitcoinDepositor = new ethers.Contract(
            this.config.l2ContractAddress,
            L2BitcoinDepositorABI,
            this.nonceManagerL2
          );
          LogMessage(
            `EVM L2 BitcoinDepositor contract (for txs) created for ${this.config.chainName}`
          );
        }

        this.l2BitcoinDepositorProvider = new ethers.Contract(
          this.config.l2ContractAddress,
          L2BitcoinDepositorABI,
          this.l2Provider
        );
        LogMessage(
          `EVM L2 BitcoinDepositorProvider contract (for events) created for ${this.config.chainName}`
        );
      } else {
        LogWarning(
          `EVM L2 Contract Address not configured for ${this.config.chainName}. L2 contract features disabled.`
        );
      }
    } else {
      LogWarning(
        `EVM L2 RPC not configured for ${this.config.chainName}. L2 features disabled.`
      );
    }
    LogMessage(
      `EVM L2 components initialization finished for ${this.config.chainName}`
    );
  }

  protected async setupL2Listeners(): Promise<void> {
    if (!this.config.useEndpoint && this.l2BitcoinDepositorProvider) {
      LogMessage(`Setting up EVM L2 listeners for ${this.config.chainName}`);

      this.l2BitcoinDepositorProvider.on(
        'DepositInitialized',
        async (
          fundingTx: FundingTransaction,
          reveal: any[],
          l2DepositOwner: string,
          l2Sender: string
        ) => {
          const fundingTxHash = getFundingTxHash(fundingTx);
          const depositId = getDepositId(fundingTxHash, reveal[0]);
          LogMessage(
            `Received L2 DepositInitialized event | ID: ${depositId} | Owner: ${l2DepositOwner}`
          );
          try {
            const existingDeposit = getJsonById(depositId);
            if (existingDeposit) {
              LogWarning(
                `L2 Listener | Deposit already exists locally | ID: ${depositId}. Ignoring event.`
              );
              return;
            }

            LogMessage(`L2 Listener | Creating new deposit | ID: ${depositId}`);
            const deposit: Deposit = createDeposit(
              fundingTx,
              reveal,
              l2DepositOwner,
              l2Sender
            );
            writeJson(deposit, deposit.id);

            LogMessage(
              `L2 Listener | Triggering L1 initializeDeposit | ID: ${deposit.id}`
            );
            await this.initializeDeposit(deposit);
          } catch (error: any) {
            LogError(
              `L2 Listener | Error in DepositInitialized handler | ID: ${depositId}: ${error.message}`,
              error
            );
            logDepositError(
              depositId,
              `Error processing L2 DepositInitialized event: ${error.message}`,
              error
            );
          }
        }
      );
      LogMessage(
        `EVM L2 DepositInitialized listener is active for ${this.config.chainName}`
      );
    } else if (this.config.useEndpoint) {
      LogMessage(
        `EVM L2 Listeners skipped for ${this.config.chainName} (using Endpoint).`
      );
    } else {
      LogWarning(
        `EVM L2 Listeners skipped for ${this.config.chainName} (L2 provider/contract not configured).`
      );
    }
  }

  async getLatestBlock(): Promise<number> {
    if (!this.l2Provider) {
      return 0;
    }
    try {
      const block = await this.l2Provider.getBlock('latest');
      return block.number;
    } catch (error) {
      LogError(
        `getLatestBlock | Error fetching latest block for ${this.config.chainName}: ${error}`,
        error as Error
      );
      return 0;
    }
  }

  async checkForPastDeposits(options: {
    pastTimeInMinutes: number;
    latestBlock: number;
  }): Promise<void> {
    if (this.config.useEndpoint || !this.l2BitcoinDepositorProvider) {
      return;
    }

    LogMessage(
      `Checking for past EVM L2 deposits for ${this.config.chainName} (last ${options.pastTimeInMinutes} min)`
    );
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const pastTime = currentTime - options.pastTimeInMinutes * 60;

      const { startBlock, endBlock } = await this._getBlocksByTimestampEVM(
        pastTime,
        options.latestBlock
      );

      if (startBlock < 0 || endBlock < startBlock) {
        LogWarning(
          `checkForPastDeposits | Invalid block range calculated: [${startBlock}, ${endBlock}]. Skipping check.`
        );
        return;
      }

      LogMessage(
        `checkForPastDeposits | Querying DepositInitialized events between blocks ${startBlock} and ${endBlock}`
      );

      const events = await this.l2BitcoinDepositorProvider.queryFilter(
        this.l2BitcoinDepositorProvider.filters.DepositInitialized(),
        startBlock,
        endBlock
      );

      if (events.length > 0) {
        LogMessage(
          `checkForPastDeposits | Found ${events.length} past DepositInitialized events for ${this.config.chainName}`
        );

        for (const event of events) {
          if (!event.args) {
            LogWarning(
              'checkForPastDeposits | Event args are undefined, skipping event'
            );
            continue;
          }

          const { fundingTx, reveal, l2DepositOwner, l2Sender } = event.args;
          const fundingTxHash = getFundingTxHash(
            fundingTx as FundingTransaction
          );
          const depositId = getDepositId(fundingTxHash, reveal[0]);

          const existingDeposit = getJsonById(depositId);

          if (!existingDeposit) {
            LogMessage(
              `checkForPastDeposits | Processing missed deposit event: ${depositId}`
            );

            const newDeposit = createDeposit(
              fundingTx as FundingTransaction,
              reveal,
              l2DepositOwner,
              l2Sender
            );
            writeJson(newDeposit, newDeposit.id);

            await this.initializeDeposit(newDeposit);
          }
        }
      } else {
        LogMessage(
          `checkForPastDeposits | No missed deposit events found for ${this.config.chainName}`
        );
      }
    } catch (error: any) {
      LogError(
        `checkForPastDeposits | Error checking past EVM deposits for ${this.config.chainName}: ${error.message}`,
        error
      );
      logDepositError(
        'past-check-evm',
        `Error checking past EVM deposits: ${error.message}`,
        error
      );
    }
  }

  private async _getBlocksByTimestampEVM(
    timestamp: number,
    latestBlock: number
  ): Promise<{
    startBlock: number;
    endBlock: number;
  }> {
    if (!this.l2Provider) {
      LogWarning(
        `_getBlocksByTimestampEVM | L2 Provider not available for ${this.config.chainName}. Returning default range.`
      );
      return {
        startBlock: this.config.l2StartBlock ?? 0,
        endBlock: this.config.l2StartBlock ?? 0,
      };
    }

    const START_BLOCK = this.config.l2StartBlock ?? 0;
    let startBlock = -1;
    let low = START_BLOCK;
    let high = latestBlock;
    let currentLatestBlock = latestBlock;

    if (high < low) {
      LogWarning(
        `_getBlocksByTimestampEVM | latestBlock (${high}) is lower than START_BLOCK (${low}). Using START_BLOCK for both.`
      );
      return { startBlock: START_BLOCK, endBlock: START_BLOCK };
    }

    LogMessage(
      `_getBlocksByTimestampEVM | Starting binary search for timestamp ${timestamp} between blocks ${low} and ${high}`
    );

    try {
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
      LogError(
        `_getBlocksByTimestampEVM | Error during binary search for ${this.config.chainName}: ${error}`,
        error as Error
      );
      startBlock = START_BLOCK;
      currentLatestBlock = latestBlock;
    }

    const endBlock = Math.max(startBlock, currentLatestBlock);

    LogMessage(
      `_getBlocksByTimestampEVM | Binary search result for ${this.config.chainName}: startBlock=${startBlock}, endBlock=${endBlock}`
    );
    return { startBlock, endBlock };
  }
}
