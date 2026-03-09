import { z } from 'zod';
import { EthereumAddressSchema } from './shared.js';

export enum NETWORK {
  MAINNET = 'Mainnet',
  TESTNET = 'Testnet',
  DEVNET = 'Devnet',
}

export enum CHAIN_TYPE {
  EVM = 'Evm',
  STARKNET = 'Starknet',
  SUI = 'Sui',
  SOLANA = 'Solana',
}

// This schema defines fields that are common to all chain configurations and typically have defaults.
// Specific chain schemas will merge this and can override these defaults.
export const CommonChainConfigSchema = z.object({
  // We expect this to be overridden by the specific chain schema
  chainType: z.nativeEnum(CHAIN_TYPE).default(CHAIN_TYPE.EVM),
  chainName: z.string().default('Unknown Chain'),

  // These are optional
  privateKey: z.string().min(1, 'privateKey is required and must not be empty'),

  // We expect these to remain the same for all chains
  network: z.nativeEnum(NETWORK).default(NETWORK.TESTNET),
  /**
   * Determines if the relayer should use HTTP endpoints for deposit processing
   * instead of direct L2 event listeners.
   * When true, L2 listeners are disabled, and routes like /api/:chainName/reveal
   * and /api/:chainName/deposit/:depositId become available.
   * Defaults to false.
   */
  useEndpoint: z.coerce.boolean().default(false),
  endpointUrl: z.string().url('endpointUrl must be a valid URL').optional(),
  /**
   * When `useEndpoint` is true, this flag specifically controls whether the
   * POST /api/:chainName/reveal endpoint is active for this chain.
   * If `useEndpoint` is true but this is false, the reveal endpoint will return a 405 error.
   * This allows enabling the general endpoint mode while selectively disabling the reveal intake.
   * Defaults to false.
   */
  supportsRevealDepositAPI: z.coerce.boolean().default(false),

  enableL2Redemption: z.coerce.boolean().default(false),

  // tBTC Protocol Architecture:
  // L1 = Main protocol layer (Ethereum mainnet/testnet) where core tBTC protocol is deployed
  // L2 = Minter deployment layer (Arbitrum, Base, etc.) where minting functionality is deployed

  // L1 RPC: Ethereum mainnet/testnet (core tBTC protocol layer)
  l1Rpc: z.string().url('l1Rpc must be a valid URL'),

  // L2 RPC: Target network (Arbitrum, Base, etc.) where minters are deployed
  l2Rpc: z.string().url('l2Rpc must be a valid URL'),

  // L2 WebSocket: Target network for real-time minter event monitoring
  l2WsRpc: z.string().url('l2WsRpc must be a valid WebSocket URL'),

  // Contract Addresses in tBTC Protocol:
  // L1: Bitcoin depositor contracts on Ethereum
  // L2: Bitcoin depositor contracts on target network (Arbitrum, Base, etc.)
  l1BitcoinDepositorAddress: EthereumAddressSchema, // L1BitcoinDepositor on Ethereum
  l2BitcoinDepositorAddress: EthereumAddressSchema, // L2BitcoinDepositor on target network

  // L1: Bitcoin redeemer contracts on Ethereum
  // L2: Bitcoin redeemer contracts on target network
  l1BitcoinRedeemerAddress: EthereumAddressSchema.optional(),
  l2BitcoinRedeemerAddress: EthereumAddressSchema.optional(),

  // Wormhole Configuration for cross-chain messaging
  l2WormholeGatewayAddress: EthereumAddressSchema, // Wormhole Gateway on target network
  l2WormholeChainId: z.coerce.number().int().nonnegative(), // Wormhole Chain ID for target network

  // Block Configuration:
  // L2 start block: Where to begin monitoring minter events on target network
  // L1 confirmations: How many Ethereum blocks to wait for transaction finality
  l1BitcoinDepositorStartBlock: z.coerce.number().int().nonnegative().default(0),
  l2BitcoinDepositorStartBlock: z.coerce.number().int().nonnegative(),

  // L1: Bitcoin redeemer start block on Ethereum
  // L2: Bitcoin redeemer start block on target network
  l1BitcoinRedeemerStartBlock: z.coerce.number().int().nonnegative().default(0).optional(),
  l2BitcoinRedeemerStartBlock: z.coerce.number().int().nonnegative().optional(),

  vaultAddress: EthereumAddressSchema, // TBTCVault on Ethereum

  // Number of L1 (Ethereum) block confirmations to wait for transactions.
  l1Confirmations: z.coerce.number().int().positive().default(1),

  depositApiEndpoint: z.string().url().optional(),
});

export type CommonChainConfig = z.infer<typeof CommonChainConfigSchema>;
export type CommonChainInput = z.input<typeof CommonChainConfigSchema>;
