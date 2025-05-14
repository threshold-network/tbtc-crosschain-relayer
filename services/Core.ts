import cron from 'node-cron';

import { LogMessage, LogError, LogWarning } from '../utils/Logs';
import { ChainHandlerFactory } from '../handlers/ChainHandlerFactory';
import { ChainConfig, ChainType } from '../types/ChainConfig.type';
import { cleanQueuedDeposits, cleanFinalizedDeposits } from './CleanupDeposits';
import { L2RedemptionService } from './L2RedemptionService';

// ---------------------------------------------------------------
// Environment Variables and Configuration
// ---------------------------------------------------------------
const requireEnv = (envVar: string) => {
  if (!process.env[envVar]) {
    LogError(`Environment variable ${envVar} is not set.`, new Error(`Environment variable ${envVar} is not set.`));
    process.exit(1);
  }
  return process.env[envVar] as string;
};

const chainConfig: ChainConfig = {
  chainType: (process.env.CHAIN_TYPE as ChainType) || ChainType.EVM,
  chainName: process.env.CHAIN_NAME || 'Default Chain',
  l1Rpc: requireEnv('L1_RPC'),
  l2Rpc: requireEnv('L2_RPC'),
  l1ContractAddress: requireEnv('L1BitcoinDepositor'),
  l1BitcoinRedeemerAddress: requireEnv('L1_BITCOIN_REDEEMER_ADDRESS'),
  l2ContractAddress: requireEnv('L2BitcoinDepositor'),
  l2BitcoinRedeemerAddress: requireEnv('L2_BITCOIN_REDEEMER_ADDRESS'),
  l2WormholeGatewayAddress: requireEnv('L2_WORMHOLE_GATEWAY_ADDRESS'),
  l2WormholeChainId: requireEnv('L2_WORMHOLE_CHAIN_ID'),
  vaultAddress: requireEnv('TBTCVault'),
  privateKey: requireEnv('PRIVATE_KEY'),
  useEndpoint: process.env.USE_ENDPOINT === 'true',
  endpointUrl: process.env.ENDPOINT_URL,
  l2StartBlock: process.env.L2_START_BLOCK
    ? parseInt(process.env.L2_START_BLOCK)
    : undefined,
};

export const WORMHOLE_GUARDIAN_API_ENDPOINT = requireEnv('WORMHOLE_GUARDIAN_API_ENDPOINT');
export const VAA_FETCH_RETRY_DELAY_MS = parseInt(process.env.VAA_FETCH_RETRY_DELAY_MS || '60000');
export const VAA_FETCH_MAX_RETRIES = parseInt(process.env.VAA_FETCH_MAX_RETRIES || '5');
export const L1_TX_CONFIRMATION_TIMEOUT_MS = parseInt(process.env.L1_TX_CONFIRMATION_TIMEOUT_MS || '300000');

// Create the appropriate chain handler
export const chainHandler = ChainHandlerFactory.createHandler(chainConfig);

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
      await chainHandler.processFinalizeDeposits();
      await chainHandler.processInitializeDeposits();
    } catch (error) {
      LogError('Error in deposit processing cron job:', error as Error);
    }
  });

  // Every 5 minutes - check for past deposits
  cron.schedule('*/5 * * * *', async () => {
    try {
      if (chainHandler.supportsPastDepositCheck()) {
        const latestBlock = await chainHandler.getLatestBlock();
        if (latestBlock > 0) {
          LogMessage(
            `Running checkForPastDeposits (Latest Block/Slot: ${latestBlock})`
          );
          await chainHandler.checkForPastDeposits({
            pastTimeInMinutes: 5,
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
    await chainHandler.initialize();
    await chainHandler.setupListeners();
    LogMessage(
      `Deposit chain handler for ${chainConfig.chainName} successfully initialized`
    );
  } catch (error) {
    LogError('Failed to initialize deposit chain handler:', error as Error);
    return false;
  }
  return true;
};

export const initializeL2RedemptionService = async () => {
  try {
    LogMessage('Attempting to initialize L2RedemptionService...');
    const l2RedemptionService = new L2RedemptionService(
      chainConfig.l2Rpc,
      chainConfig.l2BitcoinRedeemerAddress,
      chainConfig.privateKey,
      chainConfig.l1Rpc,
      chainConfig.l1BitcoinRedeemerAddress,
      Number(chainConfig.l2WormholeChainId),
      chainConfig.l2WormholeGatewayAddress,
    );
    await l2RedemptionService.initialize();
    l2RedemptionService.startListening();
    LogMessage('L2RedemptionService initialized and started successfully.');
  } catch (error) {
    LogError('Failed to initialize or start L2RedemptionService:', error as Error);
    return false;
  }
  return true;
};
