import { z } from 'zod';
import { NETWORK, CHAIN_TYPE } from '../schemas/common.schema.js';
import type { SolanaChainConfigSchema } from '../schemas/solana.chain.schema.js';
import { getEnv, getEnvNumber } from '../../utils/Env.js';
import {
  PUBLIC_RPCS, // Used for default l1Rpc
} from './common.chain.js';
import { getSolanaCommonInput } from './solana-common.js'; // Import new Solana common input

type SolanaChainInput = z.input<typeof SolanaChainConfigSchema>;

export const getSolanaDevnetImportedChainInput = (): SolanaChainInput => {
  const commonDevnetSolanaInput = getSolanaCommonInput(NETWORK.DEVNET);

  const config: SolanaChainInput = {
    // Explicitly assign properties from commonDevnetSolanaInput or override
    network: NETWORK.DEVNET, // Explicitly Devnet for this config, aligns with commonDevnetSolanaInput.network!
    chainType: CHAIN_TYPE.SOLANA, // Aligns with commonDevnetSolanaInput.chainType!
    l1Rpc: getEnv('ETHEREUM_SEPOLIA_RPC', PUBLIC_RPCS['ethereum-sepolia']), // Overrides commonDevnetSolanaInput.l1Rpc if different, but usually same for DEVNET
    vaultAddress: '0xB5679dE944A79732A75CE556191DF11F489448d5', // Specific override
    l1BitcoinDepositorAddress: '0x7F025cda2e4ae9CEB1cC31c704b83E72A0889e92', // Specific override
    l1Confirmations: commonDevnetSolanaInput.l1Confirmations!, // Uses L1_CONFIRMATIONS.TESTNET/DEVNET via common input
    enableL2Redemption: false, // Specific override
    useEndpoint: commonDevnetSolanaInput.useEndpoint!,
    supportsRevealDepositAPI:
      commonDevnetSolanaInput.supportsRevealDepositAPI === undefined
        ? false
        : commonDevnetSolanaInput.supportsRevealDepositAPI,
    endpointUrl: commonDevnetSolanaInput.endpointUrl,
    solanaCommitment: commonDevnetSolanaInput.solanaCommitment!,

    // SolanaDevnetImported-specific values
    chainName: 'SolanaDevnetImported',
    l2Rpc: getEnv('CHAIN_SOLANA_DEVNET_IMPORTED_L2_RPC'),
    l2WsRpc: getEnv('CHAIN_SOLANA_DEVNET_IMPORTED_L2_WS_RPC'),
    l2BitcoinDepositorStartBlock: getEnvNumber('CHAIN_SOLANA_DEVNET_IMPORTED_L2_START_BLOCK'),
    l2BitcoinDepositorAddress: getEnv('CHAIN_SOLANA_DEVNET_IMPORTED_L2_CONTRACT'),
    l2WormholeGatewayAddress: getEnv('CHAIN_SOLANA_DEVNET_IMPORTED_L2_WORMHOLE_GATEWAY'),
    l2WormholeChainId: getEnvNumber('CHAIN_SOLANA_DEVNET_IMPORTED_L2_WORMHOLE_CHAIN_ID', 1),
    solanaPrivateKey: getEnv('CHAIN_SOLANA_DEVNET_IMPORTED_SOLANA_PRIVATE_KEY'),
    solanaSignerKeyBase: getEnv('CHAIN_SOLANA_DEVNET_IMPORTED_SOLANA_KEY_BASE'),
  };
  return config;
};
