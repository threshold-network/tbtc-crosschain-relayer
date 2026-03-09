import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { EvmChainConfigSchema } from '../schemas/evm.chain.schema.js';
import { PUBLIC_RPCS, PUBLIC_WS_RPCS } from './common.chain.js';
import { buildEvmChainInput } from './evm-common.js';

type EvmChainInput = z.input<typeof EvmChainConfigSchema>;

/**
 * Ethereum Mainnet L1 Native Deposits Configuration
 *
 * This configuration is for gasless deposits that finalize directly on Ethereum L1
 * without using Wormhole or any L2 bridge. The NativeBTCDepositor (L1ProxyDepositor)
 * contract transfers tBTC directly to the user's Ethereum address.
 *
 * Key Characteristics:
 * - quoteFinalizeDeposit() returns 0 (no bridging fee)
 * - finalizeDeposit() calls tbtcToken.safeTransfer() directly
 * - No Wormhole gateway or cross-chain messaging
 *
 * Contract Details (verified from backend artifacts):
 * - Address: 0xad7c6d46F4a4bc2D3A227067d03218d6D7c9aaa5
 * - Deployment block: 23577711 (Oct 14, 2025)
 * - Deployment tx: 0x1f3ec345734594404ee66af9c6feae0add7e8cfce61ced6ab16bb33c7f19b714
 * - Vault: 0x9C070027cdC9dc8F82416B2e5314E11DFb4FE3CD (from common.chain.ts)
 *
 * L2 Fields Note:
 * For L1 native deposits, L2 fields are set to same as L1 (not actually used).
 * The schema requires these fields, but NativeBTCDepositor doesn't use them since
 * deposits are transferred directly on L1 without any L2 bridging.
 */
export const getEthereumMainnetChainInput = (): EvmChainInput => {
  return buildEvmChainInput({
    chainName: 'EthereumMainnet',
    targetNetwork: NETWORK.MAINNET,
    privateKeyEnv: 'CHAIN_ETHEREUM_MAINNET_PRIVATE_KEY',
    l1ConfirmationsEnv: 'CHAIN_ETHEREUM_MAINNET_L1_CONFIRMATIONS',

    // L1 Bitcoin Depositor (NativeBTCDepositor/L1ProxyDepositor)
    // This is the contract that backend initializes and relayer finalizes
    l1BitcoinDepositorStartBlock: 23577711, // Verified from Etherscan: deployed Oct 14, 2025
    l1BitcoinDepositorAddress: '0xad7c6d46F4a4bc2D3A227067d03218d6D7c9aaa5',

    // L1 Bitcoin Redeemer (optional - not needed for gasless deposits)
    l1BitcoinRedeemerStartBlock: undefined,
    l1BitcoinRedeemerAddress: undefined,

    // L2 fields: For L1 native deposits, set to same as L1 (not actually used)
    // The schema requires these fields, but NativeBTCDepositor doesn't use them
    l2RpcEnv: 'CHAIN_ETHEREUM_MAINNET_L2_RPC',
    l2WsRpcEnv: 'CHAIN_ETHEREUM_MAINNET_L2_WS_RPC',
    l2RpcDefault: PUBLIC_RPCS['ethereum-mainnet'], // Same as L1
    l2WsDefault: PUBLIC_WS_RPCS['ethereum-mainnet'], // Same as L1
    l2BitcoinDepositorStartBlock: 23577711, // Same as L1 start block
    l2BitcoinDepositorAddress: '0xad7c6d46F4a4bc2D3A227067d03218d6D7c9aaa5', // Same as L1 address
    l2BitcoinRedeemerStartBlock: undefined,
    l2BitcoinRedeemerAddress: undefined,

    // Wormhole fields: Placeholder values (not used for L1 native deposits)
    // quoteFinalizeDeposit() returns 0, so Wormhole code is never called
    wormholeGateway: '0x0000000000000000000000000000000000000000', // Zero address (not used)
    wormholeChainId: 0, // Not applicable for L1 native
  });
};
