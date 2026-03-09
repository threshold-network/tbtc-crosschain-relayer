import { z } from 'zod';
import { getAvailableChainKeys } from '../chainRegistry.js'; // Import from the new registry file

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

// Helper to properly parse boolean environment variables
const envBoolean = z.union([z.string(), z.boolean()]).transform((val) => {
  if (typeof val === 'string' && val.trim() === '') return false;
  if (typeof val === 'boolean') return val;
  val = val.toLowerCase().trim();
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0' || val === '') return false;
  throw new Error(`Invalid boolean value: ${val}`);
});

// Using UPPERCASE for environment variables for easier parsing from dotenv
export const AppConfigSchema = z.object({
  NODE_ENV: z.nativeEnum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  APP_NAME: z.string().min(1, 'APP_NAME is required'),
  APP_VERSION: z.string().min(1, 'APP_VERSION is required'),
  VERBOSE_APP: envBoolean.default(false),
  API_ONLY_MODE: envBoolean.default(false),
  ENABLE_CLEANUP_CRON: envBoolean.default(false),
  HOST_PORT: z.coerce.number().int().positive().default(4000),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ENABLED: envBoolean.default(true),
  CORS_URL: z
    .string()
    .min(1, 'CORS_URL is required if CORS_ENABLED is true')
    .refine((val) => val === '*' || /^https?:\/\/.+/i.test(val), {
      message: "CORS_URL must be a valid URL or '*'",
    })
    .optional(),
  CLEAN_QUEUED_TIME: z.coerce.number().int().positive().default(48),
  CLEAN_FINALIZED_TIME: z.coerce.number().int().positive().default(12),
  CLEAN_BRIDGED_TIME: z.coerce.number().int().positive().default(12),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SUPPORTED_CHAINS: z
    .string()
    .refine(
      (value) => {
        const validChains = getAvailableChainKeys();
        const chains = value
          .split(',')
          .map((chain) => chain.trim())
          .filter((c) => c.length > 0);
        if (chains.length === 0) return true;
        // If the input string was empty or only commas/whitespace, chains array will be empty.
        // An empty SUPPORTED_CHAINS env var means no specific chains are selected, which is valid.
        return chains.every((chain) => validChains.includes(chain));
      },
      {
        message: (() => {
          const validChains = getAvailableChainKeys();
          return `SUPPORTED_CHAINS must be a comma-separated list of valid chain names. Valid names are: ${validChains.join(', ')}`;
        })(),
      },
    )
    .optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
