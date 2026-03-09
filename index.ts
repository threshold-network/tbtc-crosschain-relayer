// -------------------------------------------------------------------------
// |                              IMPORTS                                  |
// -------------------------------------------------------------------------
import 'dotenv/config';
import { shutdownOtel } from './instrumentation.js';

// Express Server
import express from 'express';
import type { Express, RequestHandler } from 'express';
import type { Server } from 'http';

// Security
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Compression
import compression from 'compression';

// Rutas
import Routes from './routes/Routes.js';

// Utils
import logger from './utils/Logger.js';
import {
  initializeAllChains,
  initializeAllL2RedemptionServices,
  runStartupTasks,
  startCronJobs,
} from './services/Core.js';
import { logErrorContext } from './utils/Logger.js';

import { chainConfigs } from './config/index.js';
import { appConfig } from './config/app.config.js';
import { NodeEnv } from './config/schemas/app.schema.js';
import { prisma } from './utils/prisma.js';

// -------------------------------------------------------------------------
// |                            APP INSTANCE                               |
// -------------------------------------------------------------------------
const app: Express = express();

/** HTTP server reference for graceful shutdown. */
let server: Server | null = null;

// -------------------------------------------------------------------------
// |                        EXTRACTED SETUP FUNCTIONS                      |
// -------------------------------------------------------------------------
function setupMiddleware(app: Express) {
  if (appConfig.CORS_ENABLED) {
    const corsOptions = {
      credentials: true,
      origin: appConfig.CORS_URL === '*' ? '*' : appConfig.CORS_URL,
    };
    app.use(cors(corsOptions));
    logger.info(`CORS enabled for origin: ${appConfig.CORS_URL || '*'}`);
  }

  app.use(helmet());
  app.disable('x-powered-by');
  app.use(compression() as unknown as RequestHandler);
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ limit: '8mb', extended: true }));

  // Apply rate limiting
  const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 1000, // Limit each IP to 1000 requests per `window` (here, per 5 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: 'Too many requests from this IP, please try again after 5 minutes',
  });
  app.use(limiter);
  logger.info('Rate limiting middleware applied globally.');
}

function setupRoutes(app: Express) {
  app.use(Routes);
}

async function initializeBackgroundServices() {
  logger.info('Attempting to initialize all chain handlers...');
  await initializeAllChains();

  logger.info('Attempting to initialize all L2 redemption listeners...');
  await initializeAllL2RedemptionServices();
  logger.info('All L2 redemption listeners initialized successfully.');

  logger.info('Starting cron jobs...');
  startCronJobs();
  logger.info('Cron jobs started.');

  logger.info('Running startup tasks to check for past deposits...');
  await runStartupTasks();
  logger.info('Startup tasks completed.');
}

// -------------------------------------------------------------------------
// |                          MAIN ASYNC FUNCTION                          |
// -------------------------------------------------------------------------
const main = async () => {
  logger.info('Application starting...');

  try {
    logger.info(
      `App Name: ${appConfig.APP_NAME}, Version: ${appConfig.APP_VERSION}, Env: ${appConfig.NODE_ENV}`,
    );
    app.set('port', appConfig.APP_PORT);

    const numLoadedChains = Object.keys(chainConfigs).length;
    if (
      numLoadedChains === 0 &&
      (appConfig.NODE_ENV as NodeEnv) !== NodeEnv.TEST &&
      !appConfig.API_ONLY_MODE
    ) {
      logger.error('No chain configurations detected');
      process.exit(1);
    }
    logger.info(
      `Loaded ${numLoadedChains} chain configurations via Zod: ${Object.keys(chainConfigs).join(', ')}`,
    );

    if (appConfig.VERBOSE_APP) {
      Object.entries(chainConfigs).forEach(([key, cc]) => {
        logger.debug(`Chain Config [${key}]:`, JSON.stringify(cc, null, 2));
      });
    }
  } catch (error) {
    logErrorContext('FATAL: Failed during initial setup after config loading:', error);
    if ((appConfig.NODE_ENV as NodeEnv) !== NodeEnv.TEST) {
      process.exit(1);
    }
    // If in test mode, rethrow the error so test frameworks can catch it
    throw error;
  }

  // -------------------------------------------------------------------------
  // |                         MIDDLEWARE SETUP                            |
  // -------------------------------------------------------------------------
  setupMiddleware(app);

  // -------------------------------------------------------------------------
  // |                                 ROUTES                                |
  // -------------------------------------------------------------------------
  setupRoutes(app);

  // -------------------------------------------------------------------------
  // |                        BACKGROUND SERVICES                          |
  // -------------------------------------------------------------------------
  if (appConfig.API_ONLY_MODE || appConfig.NODE_ENV === 'test') {
    logger.warn(
      'Application running in API_ONLY_MODE or test environment. Background services (chain handlers, cron jobs) will not be initialized.',
    );

    // However, if USE_ENDPOINT is true, we still need to initialize chain handlers for the API endpoints
    if (process.env.USE_ENDPOINT === 'true') {
      try {
        logger.info(
          'USE_ENDPOINT is true - initializing chain handlers for endpoint API support...',
        );
        await initializeAllChains();
        logger.info('Chain handlers initialized for endpoint mode.');
      } catch (error: any) {
        logErrorContext('FATAL: Failed to initialize chain handlers for endpoint mode:', error);
        if (appConfig.NODE_ENV !== 'test') {
          process.exit(1);
        }
        throw new Error(`Endpoint mode initialization failed in test mode: ${error.message}`);
      }
    }
  } else {
    try {
      await initializeBackgroundServices();
    } catch (error: any) {
      logErrorContext('FATAL: Failed to initialize chain handlers or dependent services:', error);
      if ((appConfig.NODE_ENV as NodeEnv) !== NodeEnv.TEST) {
        process.exit(1);
      } else {
        throw new Error(`Initialization failed in test mode: ${error.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // |                              SERVER START                             |
  // -------------------------------------------------------------------------
  if ((appConfig.NODE_ENV as NodeEnv) !== NodeEnv.TEST) {
    server = app.listen({ port: appConfig.APP_PORT, host: '0.0.0.0' }, () => {
      logger.info(`Server listening on port ${appConfig.APP_PORT}`);
    });
    setupGracefulShutdown();
  } else {
    logger.info(
      'Server startup tasks are skipped in the test environment. Server has already started successfully.',
    );
  }

  logger.info('Application initialization sequence complete.');
};

/** Coordinated shutdown: stop server, disconnect Prisma, flush OTel, then exit. */
function setupGracefulShutdown(): void {
  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server!.close((err: Error | undefined) => (err ? reject(err) : resolve()));
        });
        logger.info('HTTP server closed');
      }
      await prisma.$disconnect();
      logger.info('Prisma disconnected');
      await shutdownOtel();
      logger.info('OTel SDK shut down');
    } catch (error) {
      logErrorContext('Error during graceful shutdown', error);
      process.exit(1);
    }
    process.exit(exitCode);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.on('SIGINT', () => shutdown('SIGINT', 0));
}

// Execute main and capture the promise for export (e.g., for tests to await readiness)
const initializationPromise = main().catch((error) => {
  logErrorContext('Unhandled error during application main execution:', error);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
  throw error;
});

export { app, appConfig, initializationPromise };
