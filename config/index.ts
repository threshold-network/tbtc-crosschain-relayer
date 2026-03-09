import { z } from 'zod';
import {
  chainSchemaRegistry,
  getAvailableChainKeys,
  type ChainSchemaRegistryEntry,
  type EvmChainConfig,
  type SolanaChainConfig,
  type StarknetChainConfig,
  type SuiChainConfig,
} from './chainRegistry.js';
import baseLogger from '../utils/Logger.js';
import { writeFileSync } from 'fs';
import { appConfig } from './app.config.js';

export type AnyChainConfig =
  | EvmChainConfig
  | SolanaChainConfig
  | StarknetChainConfig
  | SuiChainConfig;

export interface AllChainConfigs {
  solanaDevnet?: SolanaChainConfig;
  starknetTestnet?: StarknetChainConfig;
  starknetMainnet?: StarknetChainConfig;
  suiTestnet?: SuiChainConfig;
  suiMainnet?: SuiChainConfig;
  arbitrumMainnet?: EvmChainConfig;
  arbitrumSepolia?: EvmChainConfig;
  baseMainnet?: EvmChainConfig;
  baseSepolia?: EvmChainConfig;
  solanaDevnetImported?: SolanaChainConfig;
  [key: string]: AnyChainConfig | undefined;
}

export interface ChainValidationError {
  chainKey: string;
  error: any;
  input?: any;
  isZodError?: boolean;
}

function handleValidationError(
  key: string,
  error: any,
  input: any,
  logger: typeof baseLogger,
): ChainValidationError {
  const isZodError = error instanceof z.ZodError;
  const errorPayloadToStore = isZodError ? error.flatten() : error;
  const errorDetails: ChainValidationError = {
    chainKey: key,
    error: errorPayloadToStore,
    input,
    isZodError,
  };

  if (isZodError) {
    const zodErrorData = {
      chain: key,
      flattened: error.flatten(),
      errors: error.errors,
      inputAttempted: input,
    };
    logger.error(
      `Config validation failed for '${key}'. Flattened Zod errors: ${JSON.stringify(zodErrorData.flattened, null, 2)}`,
    );
  } else {
    logger.error(`--------------------------------------------------------------------`);
    logger.error(`--- UNEXPECTED ERROR loading/validating chain '${key}' ---`);
    logger.error(`--------------------------------------------------------------------`);
    logger.error(`Chain Key: ${key}`);
    logger.error(`Error Message: ${error.message || 'No message property'}`);
    logger.error(`Error Type: ${error.constructor ? error.constructor.name : typeof error}`);
    try {
      logger.error(
        `Full Error Object (stringified): ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
      );
    } catch {
      logger.error('Full Error Object (could not stringify, logging raw):', error);
    }
    if (error.stack) {
      logger.error('Stack Trace:', error.stack);
    }
    logger.error(`Input that may have caused error:`, JSON.stringify(input, null, 2));
    logger.error(`--------------------------------------------------------------------`);
  }
  return errorDetails;
}

function validateSingleChain(
  key: string,
  entry: ChainSchemaRegistryEntry<z.ZodTypeAny>,
  logger: typeof baseLogger,
): { config?: AnyChainConfig; error?: ChainValidationError } {
  let inputForThisChain: any = null;
  try {
    logger.info(`Attempting to load and validate configuration for chain: ${key}`);
    inputForThisChain = entry.getInputFunc();
    const config = entry.schema.parse(inputForThisChain) as AnyChainConfig;
    logger.info(`Successfully loaded configuration for chain: ${key}`);
    return { config };
  } catch (error: any) {
    let capturedInput: any;
    if (inputForThisChain === null) {
      capturedInput = `Input data could not be retrieved for chain '${key}'. The failure occurred during input generation with error: ${error instanceof Error ? error.message : String(error)}`;
    } else {
      capturedInput = inputForThisChain;
    }
    const validationError = handleValidationError(key, error, capturedInput, logger);
    return { error: validationError };
  }
}

export function loadAndValidateChainConfigs(
  targetChainKeys: string[],
  logger: typeof baseLogger,
): { configs: AllChainConfigs; validationErrors: ChainValidationError[] } {
  const loadedConfigs: AllChainConfigs = {};
  const validationErrors: ChainValidationError[] = [];

  logger.info(`Attempting to load configurations for chains: ${targetChainKeys.join(', ')}`);

  for (const key of targetChainKeys) {
    const entry = chainSchemaRegistry[key];
    if (!entry) {
      logger.warn(`No schema registry entry found for requested chain: ${key}. Skipping.`);
      validationErrors.push({
        chainKey: key,
        error: 'No schema registry entry found',
        input: 'N/A due to missing registry entry',
        isZodError: false,
      });
      continue;
    }
    const { config, error } = validateSingleChain(key, entry, logger);
    if (config) {
      loadedConfigs[key] = config;
    } else if (error) {
      validationErrors.push(error);
    }
  }

  if (validationErrors.length > 0) {
    logger.warn(`Found ${validationErrors.length} error(s) during chain configuration loading.`);
  }
  logger.info(
    `Successfully loaded ${Object.keys(loadedConfigs).length} chain configuration(s) out of ${targetChainKeys.length} requested.`,
  );
  return { configs: loadedConfigs, validationErrors };
}

let mainChainConfigs: AllChainConfigs = {};
let mainChainConfigErrors: ChainValidationError[] = [];

try {
  const supportedChainsEnv = appConfig.SUPPORTED_CHAINS;
  let chainsToLoad: string[];

  if (supportedChainsEnv && supportedChainsEnv.trim() !== '') {
    chainsToLoad = supportedChainsEnv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
    if (chainsToLoad.length === 0 && supportedChainsEnv.trim() !== '') {
      baseLogger.warn(
        'SUPPORTED_CHAINS environment variable was set but resulted in an empty list of chains after parsing. This might be unintentional.',
      );
    } else if (chainsToLoad.length === 0) {
      baseLogger.info(
        'SUPPORTED_CHAINS is empty or not set. No specific chains will be loaded by default.',
      );
    }
  } else {
    baseLogger.info(
      'SUPPORTED_CHAINS is not set. Attempting to load all registered chain configurations.',
    );
    chainsToLoad = getAvailableChainKeys();
  }

  if (chainsToLoad.length > 0) {
    const result = loadAndValidateChainConfigs(chainsToLoad, baseLogger);
    mainChainConfigs = result.configs;
    mainChainConfigErrors = result.validationErrors;
  } else {
    baseLogger.info(
      'No chains specified to load via SUPPORTED_CHAINS, and not defaulting to all chains. chainConfigs will be empty.',
    );
  }

  if (mainChainConfigErrors.length > 0) {
    baseLogger.error('--------------------------------------------------------------------');
    baseLogger.error('--- CHAIN CONFIGURATION ERRORS DETECTED DURING STARTUP ---');
    baseLogger.error('--------------------------------------------------------------------');
    mainChainConfigErrors.forEach((err) => {
      baseLogger.error(`Chain '${err.chainKey}': Validation FAILED.`);
      try {
        baseLogger.error(`Input that led to error: ${JSON.stringify(err.input, null, 2)}`);
        if (err.isZodError) {
          baseLogger.error(`Zod Error details: ${JSON.stringify(err.error, null, 2)}`);
        } else {
          baseLogger.error(
            `Error details: ${JSON.stringify(err.error, Object.getOwnPropertyNames(err.error), 2)}`,
          );
        }
      } catch {
        baseLogger.error('Failed to stringify error details. Logging raw objects:');
        baseLogger.error('Raw Input:', err.input);
        baseLogger.error('Raw Error:', err.error);
      }
    });
    writeFileSync(
      '/tmp/all-chain-config-errors.json',
      JSON.stringify(mainChainConfigErrors, null, 2),
    );
    baseLogger.error('Detailed errors written to /tmp/all-chain-config-errors.json');
    // In test environment, allow graceful handling of config errors
    if (process.env.NODE_ENV === 'test') {
      baseLogger.warn('Running in test environment - config errors will not cause exit');
    } else {
      baseLogger.error('Application will now exit.');
      baseLogger.error('--------------------------------------------------------------------');
      process.exit(1); // Critical failure for application startup
    }
  }

  if (Object.keys(mainChainConfigs).length === 0 && chainsToLoad.length > 0) {
    baseLogger.warn(
      'Exiting due to chain configuration errors. Please check the logs above for details.',
    );
    process.exit(1);
  }
} catch (error: any) {
  baseLogger.fatal(
    {
      err: error,
      context: 'Critical error during initial chain configuration loading process',
    },
    'A critical error occurred that prevented chain configurations from being determined. This is likely an issue with parsing SUPPORTED_CHAINS or accessing appConfig itself.',
  );
  process.exit(1);
}

export const chainConfigs = mainChainConfigs;
export const chainConfigErrors = mainChainConfigErrors;

export { getAvailableChainKeys };

baseLogger.info('Chain configuration module initialized.');
