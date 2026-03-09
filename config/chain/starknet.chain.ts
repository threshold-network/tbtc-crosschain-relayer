import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { StarknetChainConfigSchema } from '../schemas/starknet.chain.schema.js';
import { getEnv } from '../../utils/Env.js';
import { getStarknetCommonInput } from './starknet-common.js';

type StarknetChainInput = z.input<typeof StarknetChainConfigSchema>;

// Generic StarkNet Testnet Configuration
export const getStarknetTestnetChainInput = (): StarknetChainInput => {
  const commonTestnetStarknetInput = getStarknetCommonInput(NETWORK.TESTNET);

  // Validate required properties from commonTestnetStarknetInput
  const requiredFields: Array<keyof Partial<StarknetChainInput>> = [
    'network',
    'chainType',
    'l1Rpc',
    'vaultAddress',
    'l1BitcoinDepositorAddress',
    'l1Confirmations',
    'useEndpoint',
  ];
  for (const field of requiredFields) {
    if (
      typeof field === 'string' &&
      (commonTestnetStarknetInput[field] === undefined ||
        commonTestnetStarknetInput[field] === null)
    ) {
      throw new Error(
        `getStarknetTestnetChainInput: Missing required field '${String(field)}' in commonTestnetStarknetInput.`,
      );
    }
  }

  const config: StarknetChainInput = {
    network: commonTestnetStarknetInput.network,
    chainType: commonTestnetStarknetInput.chainType,
    l1Rpc: commonTestnetStarknetInput.l1Rpc!,
    vaultAddress: getEnv(
      'STARKNET_TESTNET_VAULT_ADDRESS',
      commonTestnetStarknetInput.vaultAddress as string,
    ),
    l1BitcoinDepositorAddress: getEnv(
      'STARKNET_TESTNET_L1_CONTRACT_ADDRESS',
      commonTestnetStarknetInput.l1BitcoinDepositorAddress as string,
    ),
    l1Confirmations: commonTestnetStarknetInput.l1Confirmations,
    useEndpoint: commonTestnetStarknetInput.useEndpoint,
    enableL2Redemption: false, // Starknet does not support L2 redemption
    supportsRevealDepositAPI: commonTestnetStarknetInput.supportsRevealDepositAPI,
    endpointUrl: commonTestnetStarknetInput.endpointUrl,
    l1FeeAmountWei: getEnv(
      'CHAIN_STARKNET_TESTNET_L1_FEE_AMOUNT_WEI',
      commonTestnetStarknetInput.l1FeeAmountWei as string,
    ),
    starkGateBridgeAddress: getEnv(
      'STARKNET_TESTNET_STARKGATE_BRIDGE_ADDRESS',
      commonTestnetStarknetInput.starkGateBridgeAddress as string,
    ),

    chainName: 'StarknetTestnet',
    // L1 private key for endpoint mode (to pay for L1 transactions)
    privateKey: getEnv('CHAIN_STARKNET_TESTNET_PRIVATE_KEY'),
  };
  return config;
};
