import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { SuiChainConfigSchema } from '../schemas/sui.chain.schema.js';
import { getEnv, getEnvNumber } from '../../utils/Env.js';
import { getSuiCommonInput } from './sui-common.js';

type SuiChainInput = z.input<typeof SuiChainConfigSchema>;

// Generic Sui Mainnet Configuration
export const getSuiMainnetChainInput = (): SuiChainInput => {
  const commonMainnetSuiInput = getSuiCommonInput(NETWORK.MAINNET);

  // Validate required properties from commonMainnetSuiInput
  const requiredFields: Array<keyof Partial<SuiChainInput>> = [
    'network',
    'chainType',
    'l1Rpc',
    'vaultAddress',
    'l1BitcoinDepositorAddress',
    'l1Confirmations',
    'enableL2Redemption',
    'useEndpoint',
  ];
  for (const field of requiredFields) {
    if (commonMainnetSuiInput[field] === undefined || commonMainnetSuiInput[field] === null) {
      throw new Error(
        `getSuiMainnetChainInput: Missing required field '${String(field)}' in commonMainnetSuiInput.`,
      );
    }
  }

  const config: SuiChainInput = {
    network: commonMainnetSuiInput.network!,
    chainType: commonMainnetSuiInput.chainType!,
    l1Rpc: commonMainnetSuiInput.l1Rpc!,
    vaultAddress: commonMainnetSuiInput.vaultAddress!,
    l1BitcoinDepositorAddress: getEnv(
      'CHAIN_SUI_MAINNET_L1_CONTRACT_ADDRESS',
      commonMainnetSuiInput.l1BitcoinDepositorAddress!,
    ),
    l1Confirmations: commonMainnetSuiInput.l1Confirmations!,
    enableL2Redemption: commonMainnetSuiInput.enableL2Redemption!,
    useEndpoint: commonMainnetSuiInput.useEndpoint!,
    supportsRevealDepositAPI:
      commonMainnetSuiInput.supportsRevealDepositAPI === undefined
        ? false
        : commonMainnetSuiInput.supportsRevealDepositAPI,
    endpointUrl: commonMainnetSuiInput.endpointUrl,
    suiGasObjectId: getEnv(
      'CHAIN_SUI_MAINNET_SUI_GAS_OBJECT_ID',
      commonMainnetSuiInput.suiGasObjectId, // Default from getSuiCommonInput (can be empty string)
    ),

    // SuiMainnet-specific values
    chainName: 'SuiMainnet',
    l2Rpc: getEnv('CHAIN_SUI_MAINNET_L2_RPC', 'https://fullnode.mainnet.sui.io'),
    l2WsRpc: getEnv('CHAIN_SUI_MAINNET_L2_WS_RPC', 'wss://fullnode.mainnet.sui.io'),
    l2BitcoinDepositorStartBlock: getEnvNumber('CHAIN_SUI_MAINNET_L2_START_BLOCK', 3776927722),
    // Mainnet BitcoinDepositor contract package and module
    l2BitcoinDepositorAddress: getEnv(
      'CHAIN_SUI_MAINNET_L2_CONTRACT_ADDRESS',
      '0x77045f1b9f811a7a8fb9ebd085b5b0c55c5cb0d1520ff55f7037f89b5da9f5f1::bitcoin_depositor',
    ),
    suiPrivateKey: getEnv('CHAIN_SUI_MAINNET_SUI_PRIVATE_KEY'),
    privateKey: getEnv('CHAIN_SUI_MAINNET_PRIVATE_KEY'),

    // Sui-specific Wormhole and Bridge Object IDs (Mainnet values)
    wormholeCoreId: getEnv(
      'CHAIN_SUI_MAINNET_WORMHOLE_CORE_ID',
      '0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c',
    ),
    tokenBridgeId: getEnv(
      'CHAIN_SUI_MAINNET_TOKEN_BRIDGE_ID',
      '0xc57508ee0d4595e5a8728974a4a93a787d38f339757230d441e895422c07aba9',
    ),
    wrappedTbtcType: getEnv(
      'CHAIN_SUI_MAINNET_WRAPPED_TBTC_TYPE',
      '0xbc3a676894871284b3ccfb2eec66f428612000e2a6e6d23f592ce8833c27c973::coin::COIN',
    ),
    receiverStateId: getEnv(
      'CHAIN_SUI_MAINNET_RECEIVER_STATE_ID',
      '0x164f463fdc60bbbff19c30ad9597ea7123c643d3671e9719cd982e3912176d94',
    ),
    gatewayStateId: getEnv(
      'CHAIN_SUI_MAINNET_GATEWAY_STATE_ID',
      '0x76eb72899418719b2db5fbc12f5fb42e93bb75f67116420f5dbf971dd31fe7f7',
    ),
    capabilitiesId: getEnv(
      'CHAIN_SUI_MAINNET_CAPABILITIES_ID',
      '0xb0faec8d0a74808108c775230967d9617acf0952425c2a559cac95588f187901',
    ),
    treasuryId: getEnv(
      'CHAIN_SUI_MAINNET_TREASURY_ID',
      '0x0ee96ad714d690753b5b4cd62d952c658dfc9e152195394395460f63cfac26b2',
    ),
    tokenStateId: getEnv(
      'CHAIN_SUI_MAINNET_TOKEN_STATE_ID',
      '0x2ff31492339e06859132b8db199f640ca37a5dc8ab1713782c4372c678f2f85c',
    ),
  };
  return config;
};
