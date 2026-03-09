import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { SolanaChainConfigSchema } from '../schemas/solana.chain.schema.js';
import { getEnv, getEnvNumber } from '../../utils/Env.js';
import { WORMHOLE_CHAIN_IDS, PUBLIC_RPCS, PUBLIC_WS_RPCS } from './common.chain.js';
import { getSolanaCommonInput } from './solana-common.js';

type SolanaChainInput = z.input<typeof SolanaChainConfigSchema>;

// A more complete generic Solana Devnet configuration
export const getSolanaDevnetChainInput = (): SolanaChainInput => {
  const commonDevnetSolanaInput = getSolanaCommonInput(NETWORK.DEVNET);

  const config: SolanaChainInput = {
    // Explicitly assign properties from commonDevnetSolanaInput, asserting non-null where appropriate
    network: commonDevnetSolanaInput.network!,
    chainType: commonDevnetSolanaInput.chainType!,
    l1Rpc: commonDevnetSolanaInput.l1Rpc!,
    vaultAddress: commonDevnetSolanaInput.vaultAddress!,
    l1BitcoinDepositorAddress: commonDevnetSolanaInput.l1BitcoinDepositorAddress!,
    l1Confirmations: commonDevnetSolanaInput.l1Confirmations!,
    enableL2Redemption: commonDevnetSolanaInput.enableL2Redemption!,
    useEndpoint: commonDevnetSolanaInput.useEndpoint!,
    supportsRevealDepositAPI:
      commonDevnetSolanaInput.supportsRevealDepositAPI === undefined
        ? false
        : commonDevnetSolanaInput.supportsRevealDepositAPI,
    endpointUrl: commonDevnetSolanaInput.endpointUrl,
    solanaCommitment: commonDevnetSolanaInput.solanaCommitment!,

    // SolanaDevnet-specific overrides and additions
    chainName: 'SolanaDevnet',
    l2Rpc: getEnv('CHAIN_SOLANA_DEVNET_L2_RPC', PUBLIC_RPCS['solana-devnet']),
    l2WsRpc: getEnv('CHAIN_SOLANA_DEVNET_L2_WS_RPC', PUBLIC_WS_RPCS['solana-devnet']),
    l2BitcoinDepositorStartBlock: getEnvNumber('CHAIN_SOLANA_DEVNET_L2_START_BLOCK', 0),
    l2BitcoinDepositorAddress: getEnv(
      'CHAIN_SOLANA_DEVNET_L2_CONTRACT_ADDRESS',
      '11111111111111111111111111111111', // Placeholder for Solana L2 contract
    ),
    l2WormholeGatewayAddress: 'MockSolanaWgway11111111111111111111111111',
    l2WormholeChainId: WORMHOLE_CHAIN_IDS.SOLANA,
    solanaPrivateKey: getEnv('CHAIN_SOLANA_DEVNET_SOLANA_PRIVATE_KEY'),
    solanaSignerKeyBase: getEnv('CHAIN_SOLANA_DEVNET_SOLANA_KEY_BASE'),
  };
  return config;
};
