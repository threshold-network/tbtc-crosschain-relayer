import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { EvmChainConfigSchema } from '../schemas/evm.chain.schema.js';
import {
  WORMHOLE_CHAIN_IDS,
  WORMHOLE_GATEWAYS,
  PUBLIC_RPCS,
  PUBLIC_WS_RPCS,
} from './common.chain.js';
import { buildEvmChainInput } from './evm-common.js';

type EvmChainInput = z.input<typeof EvmChainConfigSchema>;

export const getArbitrumMainnetChainInput = (): EvmChainInput => {
  return buildEvmChainInput({
    chainName: 'ArbitrumMainnet',
    targetNetwork: NETWORK.MAINNET,
    privateKeyEnv: 'CHAIN_ARBITRUM_MAINNET_PRIVATE_KEY',
    l1ConfirmationsEnv: 'CHAIN_ARBITRUM_MAINNET_L1_CONFIRMATIONS',

    l1BitcoinDepositorStartBlock: 20632547,
    l1BitcoinDepositorAddress: '0x75A6e4A7C8fAa162192FAD6C1F7A6d48992c619A',
    l1BitcoinRedeemerStartBlock: 23309400,
    l1BitcoinRedeemerAddress: '0x5D4d83aaB53B7E7cA915AEB2d4d3f4e03823DbDe',

    l2RpcEnv: 'CHAIN_ARBITRUM_MAINNET_L2_RPC',
    l2WsRpcEnv: 'CHAIN_ARBITRUM_MAINNET_L2_WS_RPC',
    l2RpcDefault: PUBLIC_RPCS['arbitrum-one'],
    l2WsDefault: PUBLIC_WS_RPCS['arbitrum-one'],
    l2BitcoinDepositorStartBlock: 247865814,
    l2BitcoinDepositorAddress: '0x1C8d7b744b474c080faADd5BF9AD965Be4258F9e',
    l2BitcoinRedeemerStartBlock: 376813910,
    l2BitcoinRedeemerAddress: '0xd7Cd996a47b3293d4FEc2dBcF49692370334d9b7',

    wormholeGateway: WORMHOLE_GATEWAYS.ARBITRUM_ONE,
    wormholeChainId: WORMHOLE_CHAIN_IDS.ARBITRUM_ONE,
  });
};
