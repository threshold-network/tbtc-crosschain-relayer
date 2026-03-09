import { z } from 'zod';
import { NETWORK, CHAIN_TYPE } from '../schemas/common.schema.js';
import { EvmChainConfigSchema } from '../schemas/evm.chain.schema.js';
import { getCommonChainInput } from './common.chain.js';
import { getEnv, getEnvNumber } from '../../utils/Env.js';

export type EvmChainInput = z.input<typeof EvmChainConfigSchema>;

export interface EvmChainBuildParams {
  chainName: string;
  targetNetwork: NETWORK;
  privateKeyEnv: string;
  l1ConfirmationsEnv: string;
  useEndpoint?: boolean;

  // L1 config (Ethereum)
  l1BitcoinDepositorStartBlock: number;
  l1BitcoinDepositorAddress: string;
  l1BitcoinRedeemerStartBlock?: number;
  l1BitcoinRedeemerAddress?: string;

  // L2 config (target EVM network)
  l2RpcEnv: string;
  l2WsRpcEnv: string;
  l2RpcDefault: string;
  l2WsDefault: string;
  l2BitcoinDepositorStartBlock: number;
  l2BitcoinDepositorAddress: string;
  l2BitcoinRedeemerStartBlock?: number;
  l2BitcoinRedeemerAddress?: string;

  // Wormhole
  wormholeGateway: string;
  wormholeChainId: number;
}

export function buildEvmChainInput(params: EvmChainBuildParams): EvmChainInput {
  const common = getCommonChainInput(params.targetNetwork);

  const config: EvmChainInput = {
    // from common
    network: common.network!,
    vaultAddress: common.vaultAddress as string,
    // Use polling for EVM chains
    useEndpoint: false,
    supportsRevealDepositAPI:
      common.supportsRevealDepositAPI === undefined
        ? false
        : (common.supportsRevealDepositAPI as boolean),
    endpointUrl: common.endpointUrl,
    enableL2Redemption: common.enableL2Redemption as boolean,

    // EVM specifics
    chainName: params.chainName,
    chainType: CHAIN_TYPE.EVM,
    privateKey: getEnv(params.privateKeyEnv),
    l1Confirmations: getEnvNumber(params.l1ConfirmationsEnv, common.l1Confirmations as number),

    // L1 (Ethereum)
    l1Rpc: common.l1Rpc as string,
    l1BitcoinDepositorStartBlock: params.l1BitcoinDepositorStartBlock,
    l1BitcoinDepositorAddress: params.l1BitcoinDepositorAddress,
    l1BitcoinRedeemerStartBlock: params.l1BitcoinRedeemerStartBlock,
    l1BitcoinRedeemerAddress: params.l1BitcoinRedeemerAddress,

    // L2 (target)
    l2Rpc: getEnv(params.l2RpcEnv, params.l2RpcDefault),
    l2WsRpc: getEnv(params.l2WsRpcEnv, params.l2WsDefault),
    l2BitcoinDepositorStartBlock: params.l2BitcoinDepositorStartBlock,
    l2BitcoinDepositorAddress: params.l2BitcoinDepositorAddress,
    l2BitcoinRedeemerStartBlock: params.l2BitcoinRedeemerStartBlock,
    l2BitcoinRedeemerAddress: params.l2BitcoinRedeemerAddress,

    // Wormhole
    l2WormholeGatewayAddress: params.wormholeGateway,
    l2WormholeChainId: params.wormholeChainId,
  };

  // Validate the assembled config with Zod to ensure correctness
  const validation = EvmChainConfigSchema.safeParse(config);
  if (!validation.success) {
    throw new Error(
      `buildEvmChainInput(${params.chainName}): Invalid EVM config: ${validation.error.message}`,
    );
  }

  return config;
}
