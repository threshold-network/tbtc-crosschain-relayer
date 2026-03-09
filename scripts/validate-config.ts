#!/usr/bin/env tsx

/**
 * Configuration Validation Script
 *
 * This script replicates the configuration loading and validation process
 * that occurs during server startup, making it suitable for CI environments
 * and pre-test validation.
 *
 * It validates:
 * - Application configuration (app.config.ts)
 * - Chain configurations specified by SUPPORTED_CHAINS (or all if not set)
 * - Environment variable requirements
 *
 * Usage:
 * - tsx scripts/validate-config.ts [env-file-path]
 * - Default env file: .env
 *
 * Exit codes:
 * - 0: All configurations valid
 * - 1: Configuration validation failed
 */

const SCRIPT_NAME = 'validate-config';
let supportedChainsToValidate: string[] = [];

// Parse command line arguments
const args = process.argv.slice(2);
const envFilePath = args[0] || '.env';

/**
 * Load environment variables if not in CI and parse SUPPORTED_CHAINS
 */
async function loadEnvironment() {
  // Only load dotenv in non-CI environments since CI sets environment variables directly
  if (process.env.CI !== 'true' && process.env.GITHUB_ACTIONS !== 'true') {
    const { config } = await import('dotenv');
    const result = config({ path: envFilePath });

    if (result.error) {
      console.warn(
        `[${SCRIPT_NAME}] Warning: Could not load environment file '${envFilePath}':`,
        result.error.message,
      );
    } else {
      console.log(`[${SCRIPT_NAME}] Loaded environment variables from '${envFilePath}'`);
    }
  }

  const supportedChainsEnv = process.env.SUPPORTED_CHAINS;
  if (supportedChainsEnv && supportedChainsEnv.trim() !== '') {
    supportedChainsToValidate = supportedChainsEnv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
  }
  // If supportedChainsToValidate is empty here, it means SUPPORTED_CHAINS was not set or was empty.
  // The validation logic will then decide to use all available chains from the registry.
}

/**
 * Dynamically imports modules after environment setup
 */
async function importConfigModules() {
  // Note: chainConfigs is no longer directly imported here.
  // It's loaded by loadAndValidateChainConfigs from config/index.ts
  const [
    { z },
    { default: logger },
    { AppConfigSchema },
    { loadAndValidateChainConfigs, getAvailableChainKeys },
    { writeFileSync },
  ] = await Promise.all([
    import('zod'),
    import('../utils/Logger.js'),
    import('../config/schemas/app.schema.js'),
    import('../config/index.js'),
    import('fs'),
  ]);

  return {
    z,
    logger,
    AppConfigSchema,
    loadAndValidateChainConfigs,
    getAvailableChainKeys,
    writeFileSync,
  };
}

// --- Structured error collector ---
interface ValidationError {
  type: string;
  scope: string;
  message: string;
  details?: any;
  timestamp: string;
  fatal: boolean;
  [key: string]: any;
}

/**
 * Validates application configuration using the same schema as startup
 */
async function validateAppConfig(errors: ValidationError[]): Promise<void> {
  const { z, logger, AppConfigSchema, writeFileSync } = await importConfigModules();
  try {
    logger.info(`[${SCRIPT_NAME}] Validating application configuration...`);
    const config = AppConfigSchema.parse(process.env);
    logger.info(`[${SCRIPT_NAME}] App configuration valid:`, {
      APP_NAME: config.APP_NAME,
      APP_VERSION: config.APP_VERSION,
      NODE_ENV: config.NODE_ENV,
      API_ONLY_MODE: config.API_ONLY_MODE,
      numConfigsPresent: Object.keys(config).length,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'app',
        message: 'Application configuration validation failed',
        details: { zod: error.flatten() },
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
      try {
        writeFileSync('/tmp/app-config-validation-error.json', JSON.stringify(errObj, null, 2));
        logger.error({
          type: 'config_validation_error',
          scope: 'app',
          message: 'Detailed app config error written to /tmp/app-config-validation-error.json',
          timestamp: new Date().toISOString(),
          fatal: false,
        });
      } catch (writeError) {
        logger.error({
          type: 'config_validation_error',
          scope: 'app',
          message: 'Failed to write app config error details',
          details: writeError,
          timestamp: new Date().toISOString(),
          fatal: false,
        });
      }
    } else {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'app',
        message: 'Unexpected error during application configuration validation',
        details: error,
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
    }
  }
}

/**
 * Validates chain configurations using the new dynamic loading process
 */
async function validateChainConfigs(errors: ValidationError[]): Promise<void> {
  const { logger, loadAndValidateChainConfigs, getAvailableChainKeys, writeFileSync } =
    await importConfigModules();
  try {
    let chainsToAttemptValidation: string[];
    if (supportedChainsToValidate.length > 0) {
      logger.info(
        `[${SCRIPT_NAME}] Validating chain configurations specified in SUPPORTED_CHAINS: ${supportedChainsToValidate.join(', ')}...`,
      );
      chainsToAttemptValidation = supportedChainsToValidate;
    } else {
      const availableChains = getAvailableChainKeys();
      logger.info(
        `[${SCRIPT_NAME}] SUPPORTED_CHAINS not set or empty. Validating all available chain configurations: ${availableChains.join(', ')}...`,
      );
      chainsToAttemptValidation = availableChains;
      if (chainsToAttemptValidation.length === 0) {
        logger.warn(
          `[${SCRIPT_NAME}] No chains specified via SUPPORTED_CHAINS and no chains available in the registry. This is unusual.`,
        );
        const nodeEnv = process.env.NODE_ENV || 'development';
        const apiOnlyMode = process.env.API_ONLY_MODE === 'true';
        if (nodeEnv !== 'test' && !apiOnlyMode) {
          const errObj: ValidationError = {
            type: 'config_validation_error',
            scope: 'chain',
            message:
              'No chain configurations to validate and not in test/API_ONLY_MODE. Server would fail to start.',
            timestamp: new Date().toISOString(),
            fatal: true,
          };
          errors.push(errObj);
          logger.error(errObj);
        }
        logger.info(
          `[${SCRIPT_NAME}] Proceeding without chain config validation as no chains are defined or specified, and in test/API_ONLY_MODE.`,
        );
        return;
      }
    }
    const { configs: loadedChainConfigs, validationErrors } = await loadAndValidateChainConfigs(
      chainsToAttemptValidation,
      logger,
    );
    if (validationErrors.length > 0) {
      validationErrors.forEach((err) => {
        const errObj: ValidationError = {
          type: 'config_validation_error',
          scope: 'chain',
          chainKey: err.chainKey,
          message: `Chain configuration validation failed for '${err.chainKey}'`,
          details: {
            input: err.input,
            error: err.error,
          },
          timestamp: new Date().toISOString(),
          fatal: true,
        };
        errors.push(errObj);
        logger.error(errObj);
      });
      try {
        writeFileSync(
          '/tmp/chain-configs-validation-errors.json',
          JSON.stringify(validationErrors, null, 2),
        );
        logger.error({
          type: 'config_validation_error',
          scope: 'chain',
          message:
            'Detailed chain config errors written to /tmp/chain-configs-validation-errors.json',
          timestamp: new Date().toISOString(),
          fatal: false,
        });
      } catch (writeError) {
        logger.error({
          type: 'config_validation_error',
          scope: 'chain',
          message: 'Failed to write chain config error details',
          details: writeError,
          timestamp: new Date().toISOString(),
          fatal: false,
        });
      }
    }
    // Critical environment variable checks
    const missingEnvVars: string[] = [];
    const criticalEnvVars = ['DATABASE_URL', 'APP_NAME', 'APP_VERSION'];
    criticalEnvVars.forEach((envVar) => {
      if (!process.env[envVar]) {
        missingEnvVars.push(envVar);
      }
    });
    if (missingEnvVars.length > 0) {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'environment',
        message: 'Critical environment variables missing',
        details: { missing: missingEnvVars },
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
    }
    // Check if chains were expected but none loaded
    const numLoadedChains = Object.keys(loadedChainConfigs).length;
    const nodeEnv = process.env.NODE_ENV || 'development';
    const apiOnlyMode = process.env.API_ONLY_MODE === 'true';
    if (
      chainsToAttemptValidation.length > 0 &&
      numLoadedChains === 0 &&
      nodeEnv !== 'test' &&
      !apiOnlyMode
    ) {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'chain',
        message: `No chain configurations were successfully loaded out of the ${chainsToAttemptValidation.length} attempted, and not in test/API_ONLY_MODE. Server would fail to start.`,
        details: { requestedChains: chainsToAttemptValidation },
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
    }
    if (
      numLoadedChains === 0 &&
      chainsToAttemptValidation.length === 0 &&
      nodeEnv !== 'test' &&
      !apiOnlyMode
    ) {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'chain',
        message:
          'No chain configurations detected (none specified, none in registry) - server would fail to start as not in test/API_ONLY_MODE.',
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
    }
  } catch (error: any) {
    const errObj: ValidationError = {
      type: 'config_validation_error',
      scope: 'chain',
      message: 'Unexpected error during chain configuration validation process',
      details: error,
      timestamp: new Date().toISOString(),
      fatal: true,
    };
    errors.push(errObj);
    logger.error(errObj);
  }
}

/**
 * Validates configuration environment readiness
 */
async function validateEnvironmentReadiness(errors: ValidationError[]): Promise<void> {
  const { logger } = await importConfigModules();
  try {
    logger.info(`[${SCRIPT_NAME}] Validating environment readiness...`);
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const apiOnlyMode = process.env.API_ONLY_MODE === 'true';
    logger.info(`[${SCRIPT_NAME}] Environment status:`, {
      NODE_ENV: nodeEnv,
      CI: isCI,
      API_ONLY_MODE: apiOnlyMode,
      ENABLE_CLEANUP_CRON: process.env.ENABLE_CLEANUP_CRON || 'false',
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
      SUPPORTED_CHAINS_SET: !!process.env.SUPPORTED_CHAINS,
      NUM_SUPPORTED_CHAINS_TO_VALIDATE: supportedChainsToValidate.length,
    });
    if (isCI && !process.env.DATABASE_URL) {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'environment',
        message: 'DATABASE_URL must be set in CI environment',
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
    }
    const requiredForStartup = ['APP_NAME', 'APP_VERSION'];
    const missingRequired = requiredForStartup.filter(
      (key) => !process.env[key] || process.env[key]?.trim() === '',
    );
    if (missingRequired.length > 0) {
      const errObj: ValidationError = {
        type: 'config_validation_error',
        scope: 'environment',
        message: 'Required startup environment variables missing or empty',
        details: { missing: missingRequired },
        timestamp: new Date().toISOString(),
        fatal: true,
      };
      errors.push(errObj);
      logger.error(errObj);
    }
    logger.info(`[${SCRIPT_NAME}] Environment readiness validation complete - ready for startup`);
  } catch (error: any) {
    const errObj: ValidationError = {
      type: 'config_validation_error',
      scope: 'environment',
      message: 'Environment readiness validation failed',
      details: error,
      timestamp: new Date().toISOString(),
      fatal: true,
    };
    errors.push(errObj);
    logger.error(errObj);
  }
}

/**
 * Gracefully shuts down the script with proper log flushing
 */
async function gracefulShutdown(exitCode: number): Promise<void> {
  // Get logger instance carefully, as importConfigModules might fail if called too early or if error occurs before it's safe
  let loggerInstance;
  try {
    const modules = await importConfigModules();
    loggerInstance = modules.logger;
  } catch (e) {
    // If importing modules fails, logger won't be available. Fallback to console.
    console.error(`[${SCRIPT_NAME}] Failed to import logger for graceful shutdown:`, e);
  }

  if (loggerInstance && typeof (loggerInstance as any).flush === 'function') {
    try {
      await (loggerInstance as any).flush();
    } catch (flushError) {
      console.error(`[${SCRIPT_NAME}] Failed to flush logs:`, flushError);
    }
  }
  process.exitCode = exitCode;
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  console.log(`[${SCRIPT_NAME}] Starting configuration validation...`);
  console.log(`[${SCRIPT_NAME}] Using environment file: ${envFilePath}`);
  await loadEnvironment();
  const { logger } = await importConfigModules();
  logger.info(`[${SCRIPT_NAME}] Environment setup complete, beginning validation...`);
  logger.info(`[${SCRIPT_NAME}] Environment file: ${envFilePath}`);
  logger.info(
    `[${SCRIPT_NAME}] Chains to validate based on SUPPORTED_CHAINS (or all if empty): ${supportedChainsToValidate.length > 0 ? supportedChainsToValidate.join(', ') : 'ALL_AVAILABLE'}`,
  );
  const startTime = Date.now();
  const errors: ValidationError[] = [];
  await validateAppConfig(errors);
  await validateChainConfigs(errors);
  await validateEnvironmentReadiness(errors);
  const duration = Date.now() - startTime;
  if (errors.length === 0) {
    logger.info(`[${SCRIPT_NAME}] ✅ All configuration validation passed (${duration}ms)`);
    logger.info(`[${SCRIPT_NAME}] Server startup configuration is ready`);
    await gracefulShutdown(0);
  } else {
    logger.error({
      type: 'config_validation_summary',
      errorCount: errors.length,
      errors,
      timestamp: new Date().toISOString(),
      fatal: true,
      message: `[${SCRIPT_NAME}] ❌ Configuration validation failed (${duration}ms). Server would fail to start with current configuration.`,
    });
    await gracefulShutdown(1);
  }
}

// Handle unhandled errors gracefully
process.on('unhandledRejection', async (reason, promise) => {
  // Use console.error here as logger might not be initialized or available
  console.error(`[${SCRIPT_NAME}] Unhandled Rejection at:`, promise, 'reason:', reason);
  // Avoid calling gracefulShutdown if it relies on logger that might not be safe to get
  process.exitCode = 1;
  process.exit(1); // Force exit
});

process.on('uncaughtException', async (error) => {
  console.error(`[${SCRIPT_NAME}] Uncaught Exception:`, error);
  process.exitCode = 1;
  process.exit(1); // Force exit
});

// Execute main function
main().catch(async (error) => {
  // Use console.error for script execution failures as logger might not be safe.
  console.error(`[${SCRIPT_NAME}] Script execution failed catastrophically:`, error);
  process.exitCode = 1;
  process.exit(1); // Force exit
});
