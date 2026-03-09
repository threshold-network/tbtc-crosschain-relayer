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

export const getBaseMainnetChainInput = (): EvmChainInput => {
  return buildEvmChainInput({
    chainName: 'BaseMainnet',
    targetNetwork: NETWORK.MAINNET,
    privateKeyEnv: 'CHAIN_BASE_MAINNET_PRIVATE_KEY',
    l1ConfirmationsEnv: 'CHAIN_BASE_MAINNET_L1_CONFIRMATIONS',

    l1BitcoinDepositorStartBlock: 21961116,
    l1BitcoinDepositorAddress: '0x186D048097c7406C64EfB0537886E3CaE100a1fe',
    l1BitcoinRedeemerStartBlock: 23309400,
    l1BitcoinRedeemerAddress: '0x5D4d83aaB53B7E7cA915AEB2d4d3f4e03823DbDe',

    l2RpcEnv: 'CHAIN_BASE_MAINNET_L2_RPC',
    l2WsRpcEnv: 'CHAIN_BASE_MAINNET_L2_WS_RPC',
    l2RpcDefault: PUBLIC_RPCS['base-mainnet'],
    l2WsDefault: PUBLIC_WS_RPCS['base-mainnet'],
    l2BitcoinDepositorStartBlock: 27076231,
    l2BitcoinDepositorAddress: '0xa2A81d9445b4F898b028c96D164bcd6c8C8C512E',
    l2BitcoinRedeemerStartBlock: 35253549,
    l2BitcoinRedeemerAddress: '0xe931F1Ac6B00400E1dAD153E184afeE164d2D88B',

    wormholeGateway: WORMHOLE_GATEWAYS.BASE,
    wormholeChainId: WORMHOLE_CHAIN_IDS.BASE,
  });
};
