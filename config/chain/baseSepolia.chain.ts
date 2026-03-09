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

export const getBaseSepoliaChainInput = (): EvmChainInput => {
  return buildEvmChainInput({
    chainName: 'BaseSepolia',
    targetNetwork: NETWORK.TESTNET,
    privateKeyEnv: 'CHAIN_BASE_SEPOLIA_PRIVATE_KEY',
    l1ConfirmationsEnv: 'CHAIN_BASE_SEPOLIA_L1_CONFIRMATIONS',

    l1BitcoinDepositorStartBlock: 7592526,
    l1BitcoinDepositorAddress: '0x59FAE614867b66421b44D1Ed3461e6B6a4B50106',
    l1BitcoinRedeemerStartBlock: 8558171,
    l1BitcoinRedeemerAddress: '0xe8312BD306512c5CAD4D650df373D5597B1C697A',

    l2RpcEnv: 'CHAIN_BASE_SEPOLIA_L2_RPC',
    l2WsRpcEnv: 'CHAIN_BASE_SEPOLIA_L2_WS_RPC',
    l2RpcDefault: PUBLIC_RPCS['base-sepolia'],
    l2WsDefault: PUBLIC_WS_RPCS['base-sepolia'],
    l2BitcoinDepositorStartBlock: 21173079,
    l2BitcoinDepositorAddress: '0xDEbD9aA9BC4845c7Cd2d9a997F82A2Daea540bD5',
    l2BitcoinRedeemerStartBlock: 27135404,
    l2BitcoinRedeemerAddress: '0x3e765ebafC46d8b71b798eeDd51e95381E474168',

    wormholeGateway: WORMHOLE_GATEWAYS.BASE_SEPOLIA,
    wormholeChainId: WORMHOLE_CHAIN_IDS.BASE_SEPOLIA,
  });
};
