import type { NETWORK } from '../config/schemas/common.schema.js';

export const DEFAULT_APP_NAME = 'tBTC Cross-Chain Relayer';

export const ENV_NETWORK = process.env.NETWORK as NETWORK;

// Default lookback window for startup past redemptions check (in minutes)
// 10 days
export const DEFAULT_STARTUP_PAST_REDEMPTIONS_LOOKBACK_MINUTES = 60 * 24 * 10;
