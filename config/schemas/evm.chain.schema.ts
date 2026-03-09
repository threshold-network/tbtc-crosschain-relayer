import { z } from 'zod';
import { CHAIN_TYPE, CommonChainConfigSchema } from './common.schema.js';

const EvmChainBaseSchema = z.object({
  chainType: z.literal(CHAIN_TYPE.EVM).default(CHAIN_TYPE.EVM), // Fixed for EVM chains
});

export const EvmChainConfigSchema = EvmChainBaseSchema.merge(CommonChainConfigSchema)
  .extend({
    chainType: EvmChainBaseSchema.shape.chainType,
  })
  .refine((data) => data.chainType === CHAIN_TYPE.EVM, {
    message: 'Chain type must be EVM for EvmChainConfigSchema.',
    path: ['chainType'],
  })
  .refine(
    (data) => {
      // Validate privateKey format for EVM: 64 hex characters, optionally 0x-prefixed
      if (data.privateKey) {
        return /^(0x)?[0-9a-fA-F]{64}$/.test(data.privateKey);
      }
      return false; // privateKey is required by CommonChainConfigSchema
    },
    {
      message: 'EVM private key must be a 64-character hex string, optionally 0x-prefixed.',
      path: ['privateKey'],
    },
  );

export type EvmChainConfig = z.infer<typeof EvmChainConfigSchema>;
