import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { EvmChainConfigSchema } from '../schemas/evm.chain.schema.js';
import { PUBLIC_RPCS, PUBLIC_WS_RPCS } from './common.chain.js';
import { buildEvmChainInput } from './evm-common.js';

type EvmChainInput = z.input<typeof EvmChainConfigSchema>;

/**
 * Ethereum Sepolia Testnet L1 Native Deposits Configuration
 *
 * Testnet configuration for gasless deposits on Ethereum Sepolia.
 * Uses L1ProxyDepositor for direct L1 tBTC transfers.
 *
 * Contract Details (verified from backend artifacts):
 * - Address: 0xb673147244A39d0206b36925A8A456EB91a7Abc0
 * - Deployment block: 9407560 (deployed 23 days ago from Nov 2025)
 * - Deployment tx: 0x33d99508a0af67ac573252caadc81a822a667947e6d438c91c9bdbb0f9a917cf
 * - Vault: 0xB5679dE944A79732A75CE556191DF11F489448d5 (from common.chain.ts)
 *
 * L2 Fields Note:
 * For L1 native deposits, L2 fields are set to same as L1 (not actually used).
 * See ethereumMainnet.chain.ts for detailed explanation.
 */
export const getEthereumSepoliaChainInput = (): EvmChainInput => {
  return buildEvmChainInput({
    chainName: 'EthereumSepolia',
    targetNetwork: NETWORK.TESTNET,
    privateKeyEnv: 'CHAIN_ETHEREUM_SEPOLIA_PRIVATE_KEY',
    l1ConfirmationsEnv: 'CHAIN_ETHEREUM_SEPOLIA_L1_CONFIRMATIONS',

    // L1 Bitcoin Depositor (NativeBTCDepositor/L1ProxyDepositor)
    l1BitcoinDepositorStartBlock: 9407560, // Verified from Sepolia Etherscan
    l1BitcoinDepositorAddress: '0xb673147244A39d0206b36925A8A456EB91a7Abc0',

    // L1 Bitcoin Redeemer (optional)
    l1BitcoinRedeemerStartBlock: undefined,
    l1BitcoinRedeemerAddress: undefined,

    // L2 fields: Set to same as L1 (not used for native deposits)
    l2RpcEnv: 'CHAIN_ETHEREUM_SEPOLIA_L2_RPC',
    l2WsRpcEnv: 'CHAIN_ETHEREUM_SEPOLIA_L2_WS_RPC',
    l2RpcDefault: PUBLIC_RPCS['ethereum-sepolia'],
    l2WsDefault: PUBLIC_WS_RPCS['ethereum-sepolia'],
    l2BitcoinDepositorStartBlock: 9407560, // Same as L1 start block
    l2BitcoinDepositorAddress: '0xb673147244A39d0206b36925A8A456EB91a7Abc0',
    l2BitcoinRedeemerStartBlock: undefined,
    l2BitcoinRedeemerAddress: undefined,

    // Wormhole fields: Placeholder values (not used)
    wormholeGateway: '0x0000000000000000000000000000000000000000',
    wormholeChainId: 0,
  });
};
