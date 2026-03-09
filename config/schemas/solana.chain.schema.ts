import { z } from 'zod';
import { CHAIN_TYPE, CommonChainConfigSchema } from './common.schema.js';

// Base schema for fields that are specific to Solana chains.
const SolanaChainBaseSchema = z.object({
  chainName: z.string().default('Solana'),
  chainType: z.literal(CHAIN_TYPE.SOLANA).default(CHAIN_TYPE.SOLANA),
  // Solana-specific fields, often sourced from ENV or specific to the chain instance
  solanaPrivateKey: z
    .string({
      required_error:
        'SOLANA_PRIVATE_KEY is required. Set it in the environment or provide it in the config data.',
    })
    .min(1, 'SOLANA_PRIVATE_KEY must not be empty.')
    .regex(
      /^[1-9A-HJ-NP-Za-km-z]{88,89}$/,
      'Solana private key must be a base58-encoded 64-byte secret key (88 or 89 base58 characters).',
    ),
  solanaCommitment: z.enum(['processed', 'confirmed', 'finalized']).default('confirmed'),
  solanaSignerKeyBase: z
    .string({
      required_error:
        'SOLANA_SIGNER_KEY_BASE is required. Set it in the environment or provide it in the config data.',
    })
    .min(1, 'SOLANA_SIGNER_KEY_BASE must not be empty.'),
});

const CommonConfigForSolana = CommonChainConfigSchema.omit({ privateKey: true });

export const SolanaChainConfigSchema = CommonConfigForSolana.merge(SolanaChainBaseSchema)
  .extend({
    // Ensure these specific Solana fields are part of the final schema shape
    chainType: SolanaChainBaseSchema.shape.chainType,
    chainName: SolanaChainBaseSchema.shape.chainName,
    solanaPrivateKey: SolanaChainBaseSchema.shape.solanaPrivateKey,
    solanaCommitment: SolanaChainBaseSchema.shape.solanaCommitment,
    solanaSignerKeyBase: SolanaChainBaseSchema.shape.solanaSignerKeyBase,

    // Override inherited EthereumAddressSchema with a generic string for Solana addresses
    l2BitcoinDepositorAddress: z
      .string()
      .min(1, 'l2BitcoinDepositorAddress is required for Solana'),
    l2WormholeGatewayAddress: z.string().min(1, 'l2WormholeGatewayAddress is required for Solana'),
  })
  .refine((data) => data.chainType === CHAIN_TYPE.SOLANA, {
    message: 'Chain type must be Solana for SolanaChainConfigSchema.',
    path: ['chainType'],
  })
  .refine((data) => !!data.solanaPrivateKey, {
    message: 'solanaPrivateKey is required for Solana chains.',
    path: ['solanaPrivateKey'],
  })
  .refine((data) => !!data.solanaSignerKeyBase, {
    message: 'solanaSignerKeyBase is required for Solana chains.',
    path: ['solanaSignerKeyBase'],
  });

export type SolanaChainConfig = z.infer<typeof SolanaChainConfigSchema>;
