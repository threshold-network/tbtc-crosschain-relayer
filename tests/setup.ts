import dotenv from 'dotenv';

// Load shared mock configurations from env.test.base
dotenv.config({ path: 'env.test.base' });

// Override or set Jest-specific environment variables
process.env.NODE_ENV = 'test';
process.env.APP_NAME = 'tBTC Relayer Test'; // Jest-specific app name

// --- Server Ports for Jest test execution context ---
process.env.HOST_PORT = '4001'; // Different port for tests
process.env.APP_PORT = '3001'; // Different port for tests

// --- CORS URL for Jest test execution context ---
// If env.test.base provides a CORS_URL, it will be used unless overridden here.
// This explicitly sets it for the Jest context if a different one is needed.
process.env.CORS_URL = 'http://localhost:4001';

// --- Database Configuration for Jest test execution context ---
// Check if we're in CI environment (DATABASE_URL potentially already set by CI runner for host-based steps)
// or local development.
const isCI = process.env.CI === 'true' || process.env.DATABASE_URL?.includes('postgres:5432');

if (!isCI && !process.env.DATABASE_URL) {
  // Local test database configuration for Jest (distinct from Docker service if needed)
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5433'; // Example: Jest uses a separate local DB instance
  process.env.POSTGRES_USER = 'test_user';
  process.env.POSTGRES_PASSWORD = 'test_password';
  process.env.POSTGRES_DB = 'tbtc_relayer_test';
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/tbtc_relayer?schema=public';
}
// If DATABASE_URL is already set (e.g., by CI runner for host operations like Prisma migrate),
// ensure other POSTGRES_ env vars are consistent if they are used by any test setup logic.
// The primary source of truth for DB connection for tests should be DATABASE_URL itself.
else if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    process.env.POSTGRES_HOST = url.hostname;
    process.env.POSTGRES_PORT = url.port || '5432'; // Default to 5432 if not specified
    process.env.POSTGRES_USER = url.username;
    process.env.POSTGRES_PASSWORD = url.password;
    // Extract DB name, removing leading slash and any query parameters
    process.env.POSTGRES_DB = url.pathname.split('?')[0].slice(1);
  } catch (e) {
    console.error('[tests/setup.ts] Failed to parse DATABASE_URL for POSTGRES_ vars:', e);
    // Depending on how strictly these are needed, you might throw or just log.
  }
}

// --- Supported Chains (Minimal set for focused and faster Jest tests) ---
// This overrides the SUPPORTED_CHAINS loaded from env.test.base for the Jest execution context.
process.env.SUPPORTED_CHAINS = 'arbitrumSepolia,baseSepolia,solanaDevnet,suiTestnet';

// Variables like VERBOSE_APP, API_ONLY_MODE, ENABLE_CLEANUP_CRON, CLEAN_*, JSON_PATH,
// all mock private keys, RPC URLs, and block configurations are now expected to be loaded
// from env.test.base by the dotenv.config() call at the top.
