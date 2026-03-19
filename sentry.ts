/**
 * Sentry error tracking — must be imported before other application code.
 * Sentry DSN and environment are configured via environment variables.
 * If SENTRY_DSN is not set, Sentry is silently disabled.
 */
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 1.0,
  });
}
