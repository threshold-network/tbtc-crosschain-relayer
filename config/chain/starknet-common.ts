import { CHAIN_TYPE, NETWORK } from '../schemas/common.schema.js';
import { getCommonChainInput, STARKNET_L1_CONTRACT_ADDRESSES } from './common.chain.js';
import { getEnv } from '../../utils/Env.js';
import type { PartialDeep } from 'type-fest';
import type { StarknetChainConfig } from '../schemas/starknet.chain.schema.js';

// TODO: Get rid of this file and use the StarknetChainConfigSchema instead.

// This function provides common defaults specifically for StarkNet chains,
// building upon the universal getCommonChainInput.
export const getStarknetCommonInput = (
  targetNetwork: NETWORK,
): PartialDeep<StarknetChainConfig> => {
  const commonInput = getCommonChainInput(targetNetwork);
  return {
    ...commonInput,
    chainType: CHAIN_TYPE.STARKNET,
    l1BitcoinDepositorAddress: STARKNET_L1_CONTRACT_ADDRESSES[targetNetwork],
    // Enable reveal deposit API for StarkNet
    supportsRevealDepositAPI: true,
    // Default L1 fee amount for StarkNet transactions, can be overridden by specific ENV or config.
    l1FeeAmountWei: getEnv('STARKNET_DEFAULT_L1_FEE_AMOUNT_WEI', '0'),
    starkGateBridgeAddress: getEnv(
      'STARKNET_STARK_GATE_BRIDGE_ADDRESS',
      '0xF6217de888fD6E6b2CbFBB2370973BE4c36a152D',
    ),
    // Other StarkNet-specific common defaults can be added here
  };
};
