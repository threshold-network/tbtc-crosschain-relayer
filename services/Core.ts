import logger, { logErrorContext } from '../utils/Logger.js';
import cron from 'node-cron';
import pLimit from 'p-limit';

import { chainHandlerRegistry } from '../handlers/ChainHandlerRegistry.js';
import { chainConfigs, type AnyChainConfig } from '../config/index.js';
import type { EvmChainConfig } from '../config/schemas/evm.chain.schema.js';
import {
  cleanQueuedDeposits,
  cleanFinalizedDeposits,
  cleanBridgedDeposits,
} from './CleanupDeposits.js';
import { L2RedemptionService } from './L2RedemptionService.js';
import { RedemptionStore } from '../utils/RedemptionStore.js';
import { RedemptionStatus } from '../types/Redemption.type.js';
import { BaseChainHandler } from '../handlers/BaseChainHandler.js';
import { CHAIN_TYPE } from '../config/schemas/common.schema.js';
import { l1RedemptionHandlerRegistry } from '../handlers/L1RedemptionHandlerRegistry.js';
import { DepositStore } from '../utils/DepositStore.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
import type { Deposit } from '../types/Deposit.type.js';
import { DEFAULT_STARTUP_PAST_REDEMPTIONS_LOOKBACK_MINUTES } from '../utils/Constants.js';

let effectiveChainConfigs: AnyChainConfig[] = [];

const supportedChainsEnv = process.env.SUPPORTED_CHAINS;

if (supportedChainsEnv && supportedChainsEnv.trim() !== '') {
  const supportedChainKeys = supportedChainsEnv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (supportedChainKeys.length > 0) {
    logger.info(
      `SUPPORTED_CHAINS environment variable set. Attempting to load: ${supportedChainKeys.join(', ')}`,
    );
    supportedChainKeys.forEach((chainKey) => {
      const config = chainConfigs[chainKey];
      if (config) {
        effectiveChainConfigs.push(config);
      } else {
        logger.warn(
          `Configuration for chain key '${chainKey}' specified in SUPPORTED_CHAINS not found in loaded chainConfigs. Skipping.`,
        );
      }
    });

    if (effectiveChainConfigs.length === 0) {
      logger.error(
        'No valid chain configurations were loaded based on SUPPORTED_CHAINS. The relayer may not operate as expected. Please check your SUPPORTED_CHAINS environment variable and individual chain configuration files.',
      );
      // Consider process.exit(1) for non-test, non-API_ONLY_MODE environments
    }
  } else {
    logger.warn(
      'SUPPORTED_CHAINS environment variable is set but resulted in an empty list of chains after parsing. All loaded chain configurations will be used.',
    );
    effectiveChainConfigs = Object.values(chainConfigs).filter(
      (config): config is AnyChainConfig => config !== null && config !== undefined,
    );
  }
} else {
  logger.info(
    'SUPPORTED_CHAINS environment variable not set or is empty. All loaded chain configurations will be used.',
  );
  effectiveChainConfigs = Object.values(chainConfigs).filter(
    (config): config is AnyChainConfig => config !== null && config !== undefined,
  );
}

const chainConfigsArray: AnyChainConfig[] = effectiveChainConfigs;

const l2RedemptionServices: Map<string, L2RedemptionService> = new Map();

export async function processDeposits(): Promise<void> {
  logger.info('Processing deposits...');
  await Promise.all(
    chainHandlerRegistry.list().map(async (handler) => {
      const chainName = (handler as BaseChainHandler<AnyChainConfig>).config.chainName;
      try {
        await handler.processWormholeBridging?.();
        await handler.processFinalizeDeposits();
        await handler.processInitializeDeposits();
      } catch (error) {
        logErrorContext(`Error in deposit processing for ${chainName}:`, error);
      }
    }),
  );
}

export async function processRedemptions(): Promise<void> {
  const evmChainConfigs = chainConfigsArray.filter(
    (config) => config.chainType === CHAIN_TYPE.EVM,
  ) as EvmChainConfig[];

  if (evmChainConfigs.length === 0) {
    logger.warn(
      'No EVM chain configurations found, redemptions will not be processed for any chain.',
    );
    return;
  }

  logger.info('Processing redemptions...');
  await Promise.all(
    evmChainConfigs.map(async (evmConfig) => {
      const chainName = evmConfig.chainName;
      try {
        const l2Service = l2RedemptionServices.get(chainName);

        if (l2Service) {
          await l2Service.processPendingRedemptions();
          await l2Service.processVaaFetchedRedemptions();
        } else {
          // No L2 service, check if it was expected
          if (evmConfig.enableL2Redemption) {
            logger.error(
              `L2 redemption is enabled for ${chainName}, but no L2RedemptionService was initialized. This could be a misconfiguration or an unsupported chain type for L2 redemption.`,
            );
          } else {
            // This is the expected path for chains without L2 redemption enabled (like Starknet by default)
            logger.info(`L2 redemption processing is disabled by configuration for ${chainName}.`);
          }
        }
      } catch (error) {
        logErrorContext(`Error in redemption processing for ${chainName}:`, error);
      }
    }),
  );
}

export async function checkForPastDepositsForAllChains(): Promise<void> {
  logger.info('Checking for past deposits...');
  await Promise.all(
    chainHandlerRegistry.list().map(async (handler) => {
      const chainName = (handler as BaseChainHandler<AnyChainConfig>).config.chainName;
      try {
        if (handler.supportsPastDepositCheck()) {
          const latestBlock = await handler.getLatestBlock();
          if (latestBlock > 0) {
            logger.debug(
              `Running checkForPastDeposits for ${chainName} (Latest Block/Slot: ${latestBlock})`,
            );
            await handler.checkForPastDeposits({
              pastTimeInMinutes: 60,
              latestBlock: latestBlock,
            });
          } else {
            logger.warn(
              `Skipping checkForPastDeposits for ${chainName} - Invalid latestBlock received: ${latestBlock}`,
            );
          }
        } else {
          logger.debug(
            `Skipping checkForPastDeposits for ${chainName} - Handler does not support it (e.g., using endpoint).`,
          );
        }
      } catch (error) {
        logErrorContext(`Error in past deposits check for ${chainName}:`, error);
      }
    }),
  );
}

export async function checkForPastRedemptionsForAllChains(
  pastTimeInMinutes: number = 60,
): Promise<void> {
  const evmChainConfigs = chainConfigsArray.filter(
    (config) => config.chainType === CHAIN_TYPE.EVM,
  ) as EvmChainConfig[];

  if (evmChainConfigs.length === 0) {
    logger.warn(
      'No EVM chain configurations found, past redemptions will not be checked for any chain.',
    );
    return;
  }

  logger.info('Checking for past redemptions...');
  await Promise.all(
    evmChainConfigs.map(async (evmConfig) => {
      const chainName = evmConfig.chainName;
      try {
        const l2Service = l2RedemptionServices.get(chainName);

        if (l2Service) {
          const latestBlock = await l2Service.getLatestBlock();
          if (latestBlock > 0) {
            logger.debug(
              `Running checkForPastRedemptions for ${chainName} (Latest Block: ${latestBlock})`,
            );
            await l2Service.checkForPastRedemptions({
              pastTimeInMinutes,
              latestBlock: latestBlock,
            });
          } else {
            logger.warn(
              `Skipping checkForPastRedemptions for ${chainName} - Invalid latestBlock received: ${latestBlock}`,
            );
          }
        } else {
          // No L2 service, check if it was expected
          if (evmConfig.enableL2Redemption) {
            logger.error(
              `L2 redemption is enabled for ${chainName}, but no L2RedemptionService was initialized for past redemption check.`,
            );
          } else {
            logger.debug(`L2 redemption past check is disabled by configuration for ${chainName}.`);
          }
        }
      } catch (error) {
        logErrorContext(`Error in past redemptions check for ${chainName}:`, error);
      }
    }),
  );
}

export const startCronJobs = () => {
  logger.debug('Starting multi-chain cron job setup...');

  // Every minute - process deposits
  cron.schedule('* * * * *', async () => {
    await processDeposits();
  });

  // Every 5 minutes - process redemptions
  cron.schedule('*/5 * * * *', async () => {
    await processRedemptions();
  });

  // Every 60 minutes - check for past deposits
  cron.schedule('*/60 * * * *', async () => {
    await checkForPastDepositsForAllChains();
  });

  // Every 60 minutes - check for past redemptions
  cron.schedule('*/60 * * * *', async () => {
    await checkForPastRedemptionsForAllChains(60);
  });

  // Every 60 minutes - recover stuck finalized deposits (for chains that support it)
  cron.schedule('*/60 * * * *', async () => {
    await recoverStuckFinalizedDeposits();
  });

  if (process.env.ENABLE_CLEANUP_CRON === 'true') {
    // Every 10 minutes - cleanup deposits
    cron.schedule('*/10 * * * *', async () => {
      try {
        await cleanQueuedDeposits();
        await cleanFinalizedDeposits();
        await cleanBridgedDeposits();
      } catch (error) {
        logErrorContext('Error in deposit cleanup cron job', error);
      }
    });

    // Every 60 minutes - cleanup old redemptions
    cron.schedule('*/60 * * * *', async () => {
      try {
        const now = Date.now();
        const retentionMs = 60 * 24 * 60 * 60 * 1000; // 60 days
        const allRedemptions = await RedemptionStore.getAll();
        for (const redemption of allRedemptions) {
          if (
            (redemption.status === RedemptionStatus.COMPLETED ||
              redemption.status === RedemptionStatus.FAILED) &&
            redemption.dates.completedAt &&
            now - redemption.dates.completedAt > retentionMs
          ) {
            await RedemptionStore.delete(redemption.id);
            logger.info(`Cleaned up redemption ${redemption.id} (status: ${redemption.status})`);
          }
        }
      } catch (error) {
        logErrorContext('Error in redemption cleanup cron job', error);
      }
    });
    logger.info('Cleanup cron jobs ENABLED.');
  } else {
    logger.info('Cleanup cron jobs DISABLED by environment variable ENABLE_CLEANUP_CRON.');
  }

  logger.debug('Multi-chain cron job setup complete.');
};

export async function recoverStuckFinalizedDeposits(): Promise<void> {
  logger.info('Recovering stuck finalized deposits...');

  try {
    // Get all finalized deposits across all chains
    const finalizedDeposits = await DepositStore.getByStatus(DepositStatus.FINALIZED);

    if (finalizedDeposits.length === 0) {
      logger.debug('No stuck finalized deposits found');
      return;
    }

    logger.info(`Found ${finalizedDeposits.length} finalized deposits to check`);

    // Group deposits by chain
    const depositsByChain = new Map<string, Deposit[]>();
    for (const deposit of finalizedDeposits) {
      const chainDeposits = depositsByChain.get(deposit.chainId) || [];
      chainDeposits.push(deposit);
      depositsByChain.set(deposit.chainId, chainDeposits);
    }

    // Process each chain's deposits
    await Promise.all(
      Array.from(depositsByChain.entries()).map(async ([chainName, deposits]) => {
        try {
          // Get the handler for this chain
          const handler = chainHandlerRegistry
            .list()
            .find((h) => (h as BaseChainHandler<AnyChainConfig>).config.chainName === chainName);

          if (!handler) {
            logger.warn(`No handler found for chain ${chainName}, skipping recovery`);
            return;
          }

          // Check if handler supports recovery (currently only SUI)
          if (
            'recoverStuckFinalizedDeposits' in handler &&
            typeof (handler as any).recoverStuckFinalizedDeposits === 'function'
          ) {
            logger.info(`Running recovery for ${deposits.length} deposits on ${chainName}`);
            await (handler as any).recoverStuckFinalizedDeposits(deposits);
          } else {
            logger.debug(`Chain ${chainName} does not support finalized deposit recovery`);
          }
        } catch (error) {
          logErrorContext(`Error recovering stuck deposits for ${chainName}:`, error);
        }
      }),
    );

    logger.info('Stuck finalized deposits recovery complete');
  } catch (error) {
    logErrorContext('Error in recoverStuckFinalizedDeposits:', error);
  }
}

export async function runStartupTasks(): Promise<void> {
  logger.info('Running startup tasks...');
  await Promise.all([
    processDeposits(),
    processRedemptions(),
    checkForPastDepositsForAllChains(),
    checkForPastRedemptionsForAllChains(DEFAULT_STARTUP_PAST_REDEMPTIONS_LOOKBACK_MINUTES),
    recoverStuckFinalizedDeposits(),
  ]);
  logger.info('Startup tasks complete.');
}

export async function initializeAllChains(): Promise<void> {
  if (chainConfigsArray.length === 0) {
    logger.warn('No chain configurations loaded. Relayer might not operate on any chain.');
    return;
  }
  logger.info(
    `Loaded ${chainConfigsArray.length} chain configurations: ${chainConfigsArray
      .map((c) => c.chainName)
      .join(', ')}`,
  );

  await chainHandlerRegistry.initialize(chainConfigsArray);
  logger.info('ChainHandlerRegistry initialized for all chains.');

  // Initialize L1 Redemption Handler Registry
  try {
    await l1RedemptionHandlerRegistry.initialize(chainConfigsArray);
    logger.info('L1RedemptionHandlerRegistry initialized.');
  } catch (error) {
    logErrorContext(
      'Failed to initialize L1RedemptionHandlerRegistry. L2 redemptions may not be processed.',
      error,
    );
  }

  // Initialize handlers and setup listeners concurrently
  const initLimit = pLimit(5); // Limit concurrency for initialization
  const initializationPromises = chainHandlerRegistry.list().map((handler) =>
    initLimit(async () => {
      const chainName = (handler as BaseChainHandler<AnyChainConfig>).config.chainName as string;
      try {
        await handler.initialize();
        logger.info(`Successfully initialized handler for ${chainName}`);
        await handler.setupListeners();
        logger.info(`Successfully set up listeners for ${chainName}`);
      } catch (error: any) {
        logErrorContext(`Failed to initialize or set up listeners for ${chainName}:`, error);
        // Decide if we should exit or continue without this chain
        // For now, logging the error and continuing
      }
    }),
  );
  await Promise.all(initializationPromises);
  logger.info('All available chain handlers initialized and listeners set up.');
}

export async function initializeAllL2RedemptionServices(): Promise<void> {
  const evmChainConfigs = chainConfigsArray.filter(
    (config) => config.chainType === CHAIN_TYPE.EVM,
  ) as EvmChainConfig[];

  if (evmChainConfigs.length === 0) {
    logger.warn(
      'No EVM chain configurations found, L2RedemptionService will not be initialized for any chain.',
    );
    return;
  }

  logger.info('Initializing L2 Redemption Services for configured EVM chains...');
  for (const config of evmChainConfigs) {
    const chainName = config.chainName as string;
    if (config.enableL2Redemption) {
      if (!l2RedemptionServices.has(chainName)) {
        logger.info(`Initializing L2RedemptionService for ${chainName}...`);
        try {
          const service = await L2RedemptionService.create(config);
          await service.startListening(); // Start listening for events
          l2RedemptionServices.set(chainName, service);
          logger.info(`L2RedemptionService for ${chainName} initialized and listeners set up.`);
        } catch (error) {
          logErrorContext(`Failed to initialize L2RedemptionService for ${chainName}:`, error);
        }
      } else {
        logger.debug(`L2RedemptionService for ${chainName} already initialized.`);
      }
    } else {
      logger.info(`L2RedemptionService disabled for ${chainName} by configuration.`);
    }
  }
  logger.info('All L2 redemption services initialized (or skipped if disabled/not EVM).');
}

// Export for testing or specific access if needed, though registry is preferred
export function getL2RedemptionService(chainName: string): L2RedemptionService | undefined {
  return l2RedemptionServices.get(chainName);
}
