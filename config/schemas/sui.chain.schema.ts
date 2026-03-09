import { z } from 'zod';
import { CommonChainConfigSchema, CHAIN_TYPE } from './common.schema.js';
import { SuiObjectIdSchema, SuiTypeSchema } from './shared.js';

// Use CommonChainConfigSchema.omit({ privateKey: true }) since we use a different private key field
const CommonConfigForSui = CommonChainConfigSchema.omit({ privateKey: true });

// Sui-specific schema that extends the common chain configuration
// but omits the Wormhole fields that are specific to EVM chains
export const SuiChainConfigSchema = CommonConfigForSui.omit({
  l2WormholeGatewayAddress: true,
  l2WormholeChainId: true,
  l2BitcoinRedeemerStartBlock: true,
  l2BitcoinRedeemerAddress: true,
})
  .extend({
    chainType: z.literal(CHAIN_TYPE.SUI),

    // Override l2ContractAddress to allow Sui contract format (package::module)
    l2BitcoinDepositorAddress: z
      .string()
      .regex(
        /^0x[a-fA-F0-9]{64}::[a-zA-Z_][a-zA-Z0-9_]*$/,
        'l2BitcoinDepositorAddress must be in Sui format: 0x{package_id}::{module_name}',
      ),

    // Sui-specific private key field
    suiPrivateKey: z.string().min(1, 'suiPrivateKey is required and must not be empty'),

    // L1 private key for interacting with Ethereum L1 contracts
    privateKey: z.string().optional(),

    // Optional gas object ID for transactions (can be managed automatically)
    suiGasObjectId: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine((val) => val === undefined || /^0x[a-fA-F0-9]{64}$/.test(val), {
        message: 'suiGasObjectId must be a valid Sui object ID',
      })
      .describe(
        'Optional specific gas object ID. If not provided, gas objects will be managed automatically.',
      ),

    // Sui-specific Wormhole integration using Object IDs instead of contract addresses
    wormholeCoreId: SuiObjectIdSchema.describe('Wormhole Core shared object ID on Sui'),
    tokenBridgeId: SuiObjectIdSchema.describe('Wormhole Token Bridge shared object ID on Sui'),
    wrappedTbtcType: SuiTypeSchema.describe(
      'Wrapped tBTC coin type on Sui (package::module::Type format)',
    ),

    // BitcoinDepositor shared object IDs on Sui
    receiverStateId: SuiObjectIdSchema.describe('BitcoinDepositor receiver state shared object ID'),
    gatewayStateId: SuiObjectIdSchema.describe(
      'BitcoinDepositor gateway state shared object ID for Wormhole messaging',
    ),
    capabilitiesId: SuiObjectIdSchema.describe('BitcoinDepositor capabilities shared object ID'),
    treasuryId: SuiObjectIdSchema.describe('BitcoinDepositor treasury shared object ID'),
    tokenStateId: SuiObjectIdSchema.describe('BitcoinDepositor token state shared object ID'),
  })
  .transform((data) => ({
    ...data,
    // Automatically derive l2PackageId from l2ContractAddress
    l2PackageId: data.l2BitcoinDepositorAddress.split('::')[0],
  }));

export type SuiChainConfig = z.infer<typeof SuiChainConfigSchema>;
export type SuiChainInput = z.input<typeof SuiChainConfigSchema>;
