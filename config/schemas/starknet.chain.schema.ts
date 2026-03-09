import { z } from 'zod';
import { CHAIN_TYPE, CommonChainConfigSchema } from './common.schema.js';
import { EthereumAddressSchema } from './shared.js';

const CommonConfigForStarknet = CommonChainConfigSchema.omit({
  l2BitcoinDepositorAddress: true,
  l2WormholeGatewayAddress: true,
  l2WormholeChainId: true,
  l2WsRpc: true,
  l2BitcoinDepositorStartBlock: true,
  l2BitcoinRedeemerStartBlock: true,
  l2BitcoinRedeemerAddress: true,
});

export const StarknetChainConfigSchema = CommonConfigForStarknet.extend({
  chainName: z.string().default('Starknet'),
  chainType: z.literal(CHAIN_TYPE.STARKNET).default(CHAIN_TYPE.STARKNET),
  // Starknet-specific fields
  l1FeeAmountWei: z
    .string()
    .regex(/^\d+$/, 'l1FeeAmountWei must be a string of digits')
    .default('0'),
  l1BitcoinDepositorStartBlock: z.coerce.number().int().nonnegative().default(8489908),
  // L1 private key for chains using endpoint mode
  // This is the Ethereum private key used to pay for L1 transactions
  privateKey: z
    .string()
    .min(1, 'privateKey is required for endpoint mode to pay L1 transactions')
    .optional(),
  starkGateBridgeAddress: EthereumAddressSchema,

  // Overriding these as optional to maintain compatibility with AnyChainConfig
  l2Rpc: z.string().optional(),
}).refine((data) => data.chainType === CHAIN_TYPE.STARKNET, {
  message: 'Chain type must be Starknet for StarknetChainConfigSchema.',
  path: ['chainType'],
});

export type StarknetChainConfig = z.infer<typeof StarknetChainConfigSchema>;
