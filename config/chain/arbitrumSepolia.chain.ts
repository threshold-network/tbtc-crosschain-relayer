import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { EvmChainConfigSchema } from '../schemas/evm.chain.schema.js';
import { WORMHOLE_CHAIN_IDS, WORMHOLE_GATEWAYS } from './common.chain.js';
import { buildEvmChainInput } from './evm-common.js';

type EvmChainInput = z.input<typeof EvmChainConfigSchema>;

export const getArbitrumSepoliaChainInput = (): EvmChainInput => {
  return buildEvmChainInput({
    chainName: 'ArbitrumSepolia',
    targetNetwork: NETWORK.TESTNET,
    privateKeyEnv: 'CHAIN_ARBITRUM_SEPOLIA_PRIVATE_KEY',
    l1ConfirmationsEnv: 'CHAIN_ARBITRUM_SEPOLIA_L1_CONFIRMATIONS',

    l1BitcoinDepositorStartBlock: 6281003,
    l1BitcoinDepositorAddress: '0xD9B523fb879C63b00ef14e48C98f4e3398d3BA2D',
    l1BitcoinRedeemerStartBlock: 8667161,
    l1BitcoinRedeemerAddress: '0x809E35f4C9984Ad39CD1433F50F2d8E35Ac15714',

    l2RpcEnv: 'CHAIN_ARBITRUM_SEPOLIA_L2_RPC',
    l2WsRpcEnv: 'CHAIN_ARBITRUM_SEPOLIA_L2_WS_RPC',
    l2RpcDefault: 'https://sepolia-rollup.arbitrum.io/rpc',
    l2WsDefault: 'wss://sepolia-rollup.arbitrum.io/rpc',
    l2BitcoinDepositorStartBlock: 62644268,
    l2BitcoinDepositorAddress: '0xB2fEC598a9374078Bb639f3d70555fc4389b7a78',
    l2BitcoinRedeemerStartBlock: 169048481,
    l2BitcoinRedeemerAddress: '0x3fAe84586021754a1d446A488e73c5d1Fba559C0',

    wormholeGateway: WORMHOLE_GATEWAYS.ARBITRUM_SEPOLIA,
    wormholeChainId: WORMHOLE_CHAIN_IDS.ARBITRUM_SEPOLIA,
  });
};
