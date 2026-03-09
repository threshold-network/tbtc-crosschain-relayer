import pino from 'pino';
import { trace } from '@opentelemetry/api';

const APP_NAME = (process.env.APP_NAME || 'tBTC Cross-Chain Relayer').toUpperCase();

/**
 * Feature flag for OpenTelemetry log export via OTLP.
 * When enabled, sends logs to SigNoz via pino-opentelemetry-transport.
 * Requires OTEL_EXPORTER_OTLP_ENDPOINT to be configured.
 */
const OTEL_LOGS_ENABLED = process.env.OTEL_LOGS_ENABLED === 'true';

/**
 * Feature flag for OpenTelemetry tracing.
 * When enabled, injects trace_id and span_id into all log records for log-to-trace correlation.
 * Requires OTEL_EXPORTER_OTLP_ENDPOINT to be configured.
 */
const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';

/**
 * Correlation IDs for linking related log events across deposits, redemptions, and chains.
 * Use with createLoggerWithCorrelation() to attach these to every log from that logger.
 * SigNoz can filter/correlate by any of these fields.
 */
export type CorrelationIds = {
  depositId?: string;
  redemptionId?: string;
  chainName?: string;
  operation?: string;
  /** Bitcoin funding transaction hash */
  fundingTxHash?: string;
  /** L1 initialize deposit tx hash */
  initializeTxHash?: string;
  /** L1 finalize deposit tx hash */
  finalizeTxHash?: string;
  /** L2 bridge tx hash (Sui/Solana) */
  bridgeTxHash?: string;
  /** Wormhole L1 transfer tx hash */
  wormholeTxHash?: string;
  /** Wormhole transfer sequence */
  transferSequence?: string;
  /** L2 tx hash (e.g. redemption trigger tx) */
  l2TxHash?: string;
  /** L1 tx hash (e.g. redemption relay tx) */
  l1TxHash?: string;
  /** Block number when available */
  blockNumber?: string;
  /** Generic tx hash (when type is ambiguous) */
  txHash?: string;
  fromStatus?: string;
  toStatus?: string;
  [key: string]: string | undefined;
};

/**
 * Injects trace_id and span_id from the active OpenTelemetry span into log records.
 * Enables log-to-trace correlation in SigNoz.
 */
function getTraceContext(): Record<string, string> {
  if (!OTEL_ENABLED) return {};
  try {
    const span = trace.getActiveSpan();
    const ctx = span?.spanContext();
    if (ctx) {
      return {
        trace_id: ctx.traceId,
        span_id: ctx.spanId,
      };
    }
  } catch {
    // OTel not initialized or no active span
  }
  return {};
}

/**
 * Build Pino transport config: stdout (pretty in dev) + optional OTLP for SigNoz.
 */
function getTransport(): pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  // Always log to stdout
  if (process.env.NODE_ENV !== 'production') {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: process.env.LOG_LEVEL || 'info',
    });
  } else {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
      level: process.env.LOG_LEVEL || 'info',
    });
  }

  // Add OTLP log export when OTEL_LOGS_ENABLED
  if (OTEL_LOGS_ENABLED) {
    const otelServiceName =
      process.env.OTEL_SERVICE_NAME || process.env.APP_NAME || 'tbtc-crosschain-relayer';
    targets.push({
      target: 'pino-opentelemetry-transport',
      options: {
        resourceAttributes: {
          'service.name': otelServiceName,
          'service.version': process.env.APP_VERSION || '1.0.0-pre',
        },
      },
      level: process.env.LOG_LEVEL || 'info',
    });
  }

  return targets.length > 1 ? { targets } : targets[0];
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    appName: APP_NAME,
  },
  mixin() {
    return getTraceContext();
  },
  transport: OTEL_LOGS_ENABLED || process.env.NODE_ENV !== 'production' ? getTransport() : undefined,
});

export default logger;

/**
 * Creates a child logger with correlation IDs attached to every log.
 * Use for deposit/redemption flows so events can be filtered and correlated in SigNoz.
 *
 * @example
 * const log = createLoggerWithCorrelation({ depositId: '123', chainName: 'arbitrumMainnet' });
 * log.info('Deposit initialized');
 * // Log includes: depositId, chainName, trace_id, span_id
 */
export function createLoggerWithCorrelation(ids: CorrelationIds): pino.Logger {
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(ids)) {
    if (v != null && v !== '') sanitized[k] = String(v);
  }
  return logger.child(sanitized);
}

/**
 * Logs an error with structured context.
 * If the error is an instance of Error, it's logged under the 'err' key (Pino convention).
 * Otherwise, it's logged under 'errorData'.
 * @param message The primary log message.
 * @param error The error object or data.
 */
export const logErrorContext = (
  message: string,
  error: Error | unknown,
  context?: {
    chainName?: string;
    depositId?: string;
    redemptionId?: string;
    fundingTxHash?: string;
    initializeTxHash?: string;
    finalizeTxHash?: string;
    l2TxHash?: string;
    l1TxHash?: string;
    txHash?: string;
  },
) => {
  const logDetails: Record<string, unknown> = {};
  if (error instanceof Error) {
    logDetails.err = error;
  } else {
    logDetails.errorData = error;
  }

  const correlation: Record<string, string> = { operation: 'error' };
  if (context?.chainName) correlation.chainName = context.chainName;
  if (context?.depositId) correlation.depositId = context.depositId;
  if (context?.redemptionId) correlation.redemptionId = context.redemptionId;
  if (context?.fundingTxHash) correlation.fundingTxHash = context.fundingTxHash;
  if (context?.initializeTxHash) correlation.initializeTxHash = context.initializeTxHash;
  if (context?.finalizeTxHash) correlation.finalizeTxHash = context.finalizeTxHash;
  if (context?.l2TxHash) correlation.l2TxHash = context.l2TxHash;
  if (context?.l1TxHash) correlation.l1TxHash = context.l1TxHash;
  if (context?.txHash) correlation.txHash = context.txHash;

  createLoggerWithCorrelation(correlation).error(logDetails, message);
};

/**
 * Logs a standardized error message for chain-specific cron jobs.
 * @param chainName - The name of the chain where the error occurred.
 * @param cronJobName - A descriptive name of the cron job (e.g., "deposit processing", "redemption processing").
 * @param error - The error object.
 */
export function logChainCronError(
  chainName: string,
  cronJobName: string,
  error: Error | unknown,
): void {
  logErrorContext(`Error in ${cronJobName} cron job for chain ${chainName}:`, error, { chainName });
}

/**
 * Logs a standardized error message for global (non-chain-specific) cron jobs.
 * @param cronJobName - A descriptive name of the cron job (e.g., "deposit cleanup").
 * @param error - The error object.
 */
export function logGlobalCronError(cronJobName: string, error: Error | unknown): void {
  logErrorContext(`Error in global ${cronJobName} cron job:`, error);
}
