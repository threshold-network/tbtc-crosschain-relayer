import { z } from 'zod';
import { NETWORK } from '../schemas/common.schema.js';
import type { SuiChainConfigSchema } from '../schemas/sui.chain.schema.js';
import { getEnv, getEnvNumber } from '../../utils/Env.js';
import { getSuiCommonInput } from './sui-common.js';

type SuiChainInput = z.input<typeof SuiChainConfigSchema>;

// Generic Sui Testnet Configuration
export const getSuiTestnetChainInput = (): SuiChainInput => {
  const commonTestnetSuiInput = getSuiCommonInput(NETWORK.TESTNET);

  // Validate required properties from commonTestnetSuiInput
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
    if (commonTestnetSuiInput[field] === undefined || commonTestnetSuiInput[field] === null) {
      throw new Error(
        `getSuiTestnetChainInput: Missing required field '${String(field)}' in commonTestnetSuiInput.`,
      );
    }
  }

  const config: SuiChainInput = {
    network: commonTestnetSuiInput.network!,
    chainType: commonTestnetSuiInput.chainType!,
    l1Rpc: commonTestnetSuiInput.l1Rpc!,
    vaultAddress: commonTestnetSuiInput.vaultAddress!,
    l1BitcoinDepositorAddress: getEnv(
      'CHAIN_SUI_TESTNET_L1_CONTRACT_ADDRESS',
      commonTestnetSuiInput.l1BitcoinDepositorAddress!,
    ),
    l1Confirmations: commonTestnetSuiInput.l1Confirmations!,
    enableL2Redemption: commonTestnetSuiInput.enableL2Redemption!,
    useEndpoint: commonTestnetSuiInput.useEndpoint!,
    supportsRevealDepositAPI:
      commonTestnetSuiInput.supportsRevealDepositAPI === undefined
        ? false
        : commonTestnetSuiInput.supportsRevealDepositAPI,
    endpointUrl: commonTestnetSuiInput.endpointUrl,
    suiGasObjectId: getEnv(
      'CHAIN_SUI_TESTNET_SUI_GAS_OBJECT_ID',
      commonTestnetSuiInput.suiGasObjectId, // Default from getSuiCommonInput (can be empty string)
    ),

    // SuiTestnet-specific values
    chainName: 'SuiTestnet',
    l2Rpc: getEnv('CHAIN_SUI_TESTNET_L2_RPC', 'https://fullnode.testnet.sui.io'),
    l2WsRpc: getEnv('CHAIN_SUI_TESTNET_L2_WS_RPC', 'wss://fullnode.testnet.sui.io'),
    l2BitcoinDepositorStartBlock: getEnvNumber('CHAIN_SUI_TESTNET_L2_START_BLOCK', 2231104491),
    l2BitcoinDepositorAddress: getEnv(
      'CHAIN_SUI_TESTNET_L2_CONTRACT_ADDRESS',
      '0x3d78316ce8ee3fe48d7ff85cdc2d0df9d459f43d802d96f58f7b59984c2dd3ae::bitcoin_depositor',
    ),
    suiPrivateKey: getEnv('CHAIN_SUI_TESTNET_SUI_PRIVATE_KEY'),
    privateKey: getEnv('CHAIN_SUI_TESTNET_PRIVATE_KEY'),

    // Sui-specific Wormhole and Bridge Object IDs (Testnet values)
    wormholeCoreId: getEnv(
      'CHAIN_SUI_TESTNET_WORMHOLE_CORE_ID',
      '0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790',
    ),
    tokenBridgeId: getEnv(
      'CHAIN_SUI_TESTNET_TOKEN_BRIDGE_ID',
      '0x6fb10cdb7aa299e9a4308752dadecb049ff55a892de92992a1edbd7912b3d6da',
    ),
    wrappedTbtcType: getEnv(
      'CHAIN_SUI_TESTNET_WRAPPED_TBTC_TYPE',
      '0xb501e7f0b86ad34eb634835069be3dad295b6a4af139986bcd5447f1ad0a2b94::coin::COIN',
    ),
    receiverStateId: getEnv(
      'CHAIN_SUI_TESTNET_RECEIVER_STATE_ID',
      '0x10f421d7960be14c07057fd821332ee8a9d717873c62e7fa370fa99913e8e924',
    ),
    gatewayStateId: getEnv(
      'CHAIN_SUI_TESTNET_GATEWAY_STATE_ID',
      '0x19ab17536712e3e2efa9a1c01acbf5c09ae53e969cb9046dc382f5f49b603d52',
    ),
    capabilitiesId: getEnv(
      'CHAIN_SUI_TESTNET_CAPABILITIES_ID',
      '0xeb0857599ce78686a8e01f4fbb4356151697610cf9f8ea8469581ad326c89425',
    ),
    treasuryId: getEnv(
      'CHAIN_SUI_TESTNET_TREASURY_ID',
      '0xa7f1115226db843a59c3ae554ce4b7cf32648bf705ab543c85759cc1f56e1b78',
    ),
    tokenStateId: getEnv(
      'CHAIN_SUI_TESTNET_TOKEN_STATE_ID',
      '0x0d59e4970772269ee917280da592089c7de389ed67164ce4c07ed508917fdf08',
    ),
  };
  return config;
};
