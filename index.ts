// -------------------------------------------------------------------------
// |                              IMPORTS                                  |
// -------------------------------------------------------------------------
// Express Server
import express, { Express, Request, Response } from 'express';

// Security
import cors from 'cors';
import helmet from 'helmet';

// Compression
import compression from 'compression';

// Rutas
import Routes from './routes/Routes';

// Utils
import { LogMessage, LogError, LogWarning } from './utils/Logs';
import { initializeChain } from './services/Core';
import { initializeAuditLog } from './utils/AuditLog';

// -------------------------------------------------------------------------
// |                            APP CONFIG                                 |
// -------------------------------------------------------------------------
// Express app
const app: Express = express();

// Port
const PORT = process.env.APP_PORT || 3000;
app.set('port', PORT);

// -------------------------------------------------------------------------
// |                              SECURITY                                 |
// -------------------------------------------------------------------------

if (process.env.CORS_ENABLED === 'true') {
  app.use(
    cors({
      credentials: true,
      origin: process.env.CORS_URL,
    })
  );
}
// Helmet (Security middleware)
app.use(helmet());

// Deshabilitar la cabecera X-Powered-By
app.disable('x-powered-by');

// -------------------------------------------------------------------------
// |                              COMPRESSION                              |
// -------------------------------------------------------------------------

// Compresion
app.use(compression() as any);

// File Upload limit
app.use(express.json({ limit: '2048mb' }));
app.use(express.urlencoded({ limit: '2048mb', extended: true }));

// -------------------------------------------------------------------------
// |                                 ROUTES                                |
// -------------------------------------------------------------------------

app.use(Routes);

// -------------------------------------------------------------------------
// |                              SERVER START                             |
// -------------------------------------------------------------------------

// --- Add Log ---
LogMessage('Application starting...');

// Initialize Audit Log System
try {
  initializeAuditLog();
  LogMessage('Audit log initialized.');
} catch (error: any) {
  LogError('Failed to initialize audit log:', error);
  process.exit(1); // Exit if audit log fails
}

// Initialize chain handler
let chainInitializationSuccess = false;
(async () => {
  try {
    LogMessage('Attempting to initialize chain handler...');
    await initializeChain();
    chainInitializationSuccess = true;
    LogMessage('Chain handler initialized successfully.');

    // Start Cron Jobs only if chain initialization was successful
    const { startCronJobs } = await import('./services/Core');
    startCronJobs();
    LogMessage('Cron jobs started.');
  } catch (error: any) {
    LogError(
      'FATAL: Failed to initialize chain handler or dependent services:',
      error
    );
    // Decide if the app should exit or run in a degraded state
    // process.exit(1); // Option: Exit if chain handler is critical
    LogWarning(
      'Running without active chain handler or cron jobs due to initialization error.'
    );
  }

  // Start the server regardless of chain init success? Or only if successful?
  // Let's start it anyway to provide basic API status, but log a warning.

  // --- Add Log ---
  LogMessage(`Attempting to start server on port ${PORT}...`);

  app
    .listen(PORT, () => {
      // --- Add Log ---
      LogMessage(`Server is running on port ${PORT}`);
      if (!chainInitializationSuccess) {
        LogWarning(
          'Server started, but chain handler failed to initialize. Service may be degraded.'
        );
      }
    })
    .on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        const errorMessage = `FATAL: Port ${PORT} is already in use.`;
        LogError(errorMessage, new Error(errorMessage));
      } else {
        LogError(`FATAL: Failed to start server:`, err);
      }
      process.exit(1); // Exit if server fails to start
    });
})(); // Immediately invoke the async function
