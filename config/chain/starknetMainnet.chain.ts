import { z } from 'zod';
import { getEnv } from '../../utils/Env.js';
import type { StarknetChainConfigSchema } from '../schemas/starknet.chain.schema.js';
import { CHAIN_TYPE, NETWORK } from '../schemas/common.schema.js';
import { getCommonChainInput } from './common.chain.js';

type StarknetChainInput = z.input<typeof StarknetChainConfigSchema>;

// Generic StarkNet Mainnet Configuration
export const getStarknetMainnetChainInput = (): StarknetChainInput => {
  const common = getCommonChainInput(NETWORK.MAINNET);

  const config: StarknetChainInput = {
    network: common.network,
    l1Rpc: common.l1Rpc!,
    l1Confirmations: common.l1Confirmations!,
    enableL2Redemption: false, // Starknet does not support L2 redemption
    useEndpoint: common.useEndpoint as boolean,

    // endpointUrl is optional
    endpointUrl: common.endpointUrl,

    // StarkNet-specific overrides and additions
    chainName: 'StarknetMainnet',
    chainType: CHAIN_TYPE.STARKNET,
    privateKey: getEnv('CHAIN_STARKNET_MAINNET_PRIVATE_KEY'),
    supportsRevealDepositAPI: true,
    l1FeeAmountWei: getEnv('CHAIN_STARKNET_MAINNET_L1_FEE_AMOUNT_WEI', '0'),
    starkGateBridgeAddress: getEnv(
      'STARKNET_MAINNET_STARKGATE_BRIDGE_ADDRESS',
      '0x2111A49ebb717959059693a3698872a0aE9866b9',
    ),
    vaultAddress: getEnv('STARKNET_MAINNET_VAULT_ADDRESS', common.vaultAddress as string),
    l1BitcoinDepositorAddress: getEnv(
      'STARKNET_MAINNET_L1_CONTRACT_ADDRESS',
      common.l1BitcoinDepositorAddress as string,
    ),
    l1BitcoinDepositorStartBlock: 22670140,
  };
  return config;
};
