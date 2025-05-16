import cron from 'node-cron';

import { LogMessage, LogError, LogWarning } from '../utils/Logs';
import { ChainHandlerFactory } from '../handlers/ChainHandlerFactory';
import { ChainConfig, CHAIN_TYPE, NETWORK } from '../types/ChainConfig.type';
import { cleanQueuedDeposits, cleanFinalizedDeposits, cleanBridgedDeposits } from './CleanupDeposits';

// ---------------------------------------------------------------
// Environment Variables and Configuration
// ---------------------------------------------------------------
const chainConfig: ChainConfig = {
  chainType: process.env.CHAIN_TYPE as CHAIN_TYPE,
  network: process.env.NETWORK as NETWORK,
  chainName: process.env.CHAIN_NAME || 'Default Chain',
  l1Rpc: process.env.L1_RPC || '',
  l2Rpc: process.env.L2_RPC || '',
  l2WsRpc: process.env.L2_WS_RPC || '',
  l1ContractAddress: process.env.L1_BITCOIN_DEPOSITOR || '',
  l2ContractAddress: process.env.L2_BITCOIN_DEPOSITOR || '',
  vaultAddress: process.env.TBTC_VAULT || '',
  privateKey: process.env.PRIVATE_KEY || '',
  useEndpoint: process.env.USE_ENDPOINT === 'true',
  endpointUrl: process.env.ENDPOINT_URL,
  l2StartBlock: process.env.L2_START_BLOCK
    ? parseInt(process.env.L2_START_BLOCK)
    : undefined,
  solanaSignerKeyBase: process.env.SOLANA_KEY_BASE,
};

// Create the appropriate chain handler
export const chainHandler = ChainHandlerFactory.createHandler(chainConfig);

// Constants
// export const TIME_TO_RETRY = 1000 * 60 * 5; // Moved to BaseChainHandler

// ---------------------------------------------------------------
// Cron Jobs
// ---------------------------------------------------------------

/**
 * @name startCronJobs
 * @description Starts the cron jobs for finalizing and initializing deposits.
 */
export const startCronJobs = () => {
  // CRONJOBS
  LogMessage('Starting cron job setup...');

  // Every minute - process deposits
  cron.schedule('* * * * *', async () => {
    try {
      await chainHandler.processWormholeBridging?.();
      await chainHandler.processFinalizeDeposits();
      await chainHandler.processInitializeDeposits();
    } catch (error) {
      LogError('Error in deposit processing cron job:', error as Error);
    }
  });

  // Every 60 minutes - check for past deposits
  cron.schedule('*/60 * * * *', async () => {
    try {
      if (chainHandler.supportsPastDepositCheck()) {
        const latestBlock = await chainHandler.getLatestBlock();
        if (latestBlock > 0) {
          LogMessage(
            `Running checkForPastDeposits (Latest Block/Slot: ${latestBlock})`
          );
          await chainHandler.checkForPastDeposits({
            pastTimeInMinutes: 60,
            latestBlock: latestBlock,
          });
        } else {
          LogWarning(
            `Skipping checkForPastDeposits - Invalid latestBlock received: ${latestBlock}`
          );
        }
      } else {
        LogMessage(
          'Skipping checkForPastDeposits - Handler does not support it (e.g., using endpoint).'
        );
      }
    } catch (error) {
      LogError('Error in past deposits cron job:', error as Error);
    }
  });

  // Every 10 minutes - cleanup
  cron.schedule('*/10 * * * *', async () => {
    try {
      await cleanQueuedDeposits();
      await cleanFinalizedDeposits();
      await cleanBridgedDeposits();
    } catch (error) {
      LogError('Error in cleanup cron job:', error as Error);
    }
  });

  LogMessage('Cron job setup complete.');
};

/**
 * @name initializeChain
 * @description Initialize the chain handler and set up event listeners
 */
export const initializeChain = async () => {
  try {
    // Initialize the chain handler
    await chainHandler.initialize();

    // Set up event listeners if not using endpoint
    await chainHandler.setupListeners();

    LogMessage(
      `Chain handler for ${chainConfig.chainName} successfully initialized`
    );
    return true;
  } catch (error) {
    LogError('Failed to initialize chain handler:', error as Error);
    return false;
  }
};

// ---------------------------------------------------------------
