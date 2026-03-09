import { z } from 'zod';
import { EvmChainConfigSchema, type EvmChainConfig } from './schemas/evm.chain.schema.js';
import { SolanaChainConfigSchema, type SolanaChainConfig } from './schemas/solana.chain.schema.js';
import {
  StarknetChainConfigSchema,
  type StarknetChainConfig,
} from './schemas/starknet.chain.schema.js';
import { SuiChainConfigSchema, type SuiChainConfig } from './schemas/sui.chain.schema.js';

import { getSolanaDevnetChainInput } from './chain/solana.chain.js';
import { getStarknetTestnetChainInput } from './chain/starknet.chain.js';
import { getSuiMainnetChainInput } from './chain/sui.chain.js';
import { getArbitrumMainnetChainInput } from './chain/arbitrumMainnet.chain.js';
import { getBaseMainnetChainInput } from './chain/baseMainnet.chain.js';
import { getSolanaDevnetImportedChainInput } from './chain/solanaDevnetImported.chain.js';
import { getBaseSepoliaChainInput } from './chain/baseSepolia.chain.js';
import { getArbitrumSepoliaChainInput } from './chain/arbitrumSepolia.chain.js';
import { getStarknetMainnetChainInput } from './chain/starknetMainnet.chain.js';
import { getSuiTestnetChainInput } from './chain/suiTestnet.chain.js';
import { getEthereumMainnetChainInput } from './chain/ethereumMainnet.chain.js';
import { getEthereumSepoliaChainInput } from './chain/ethereumSepolia.chain.js';

// Re-exporting these types as they might be useful for consumers of the registry
export type { EvmChainConfig, SolanaChainConfig, StarknetChainConfig, SuiChainConfig };

export interface ChainSchemaRegistryEntry<S extends z.ZodTypeAny> {
  schema: S;
  getInputFunc: () => z.input<S>;
  // chainType?: CHAIN_TYPE;
}

type ChainSchemaRegistry = {
  solanaDevnet: ChainSchemaRegistryEntry<typeof SolanaChainConfigSchema>;
  starknetTestnet: ChainSchemaRegistryEntry<typeof StarknetChainConfigSchema>;
  starknetMainnet: ChainSchemaRegistryEntry<typeof StarknetChainConfigSchema>;
  suiTestnet: ChainSchemaRegistryEntry<typeof SuiChainConfigSchema>;
  suiMainnet: ChainSchemaRegistryEntry<typeof SuiChainConfigSchema>;
  arbitrumMainnet: ChainSchemaRegistryEntry<typeof EvmChainConfigSchema>;
  arbitrumSepolia: ChainSchemaRegistryEntry<typeof EvmChainConfigSchema>;
  baseMainnet: ChainSchemaRegistryEntry<typeof EvmChainConfigSchema>;
  baseSepolia: ChainSchemaRegistryEntry<typeof EvmChainConfigSchema>;
  ethereumMainnet: ChainSchemaRegistryEntry<typeof EvmChainConfigSchema>;
  ethereumSepolia: ChainSchemaRegistryEntry<typeof EvmChainConfigSchema>;
  solanaDevnetImported: ChainSchemaRegistryEntry<typeof SolanaChainConfigSchema>;
  [key: string]: ChainSchemaRegistryEntry<z.ZodTypeAny>;
};

export const chainSchemaRegistry: ChainSchemaRegistry = {
  solanaDevnet: { schema: SolanaChainConfigSchema, getInputFunc: getSolanaDevnetChainInput },
  starknetTestnet: {
    schema: StarknetChainConfigSchema,
    getInputFunc: getStarknetTestnetChainInput,
  },
  starknetMainnet: {
    schema: StarknetChainConfigSchema,
    getInputFunc: getStarknetMainnetChainInput,
  },
  suiTestnet: { schema: SuiChainConfigSchema, getInputFunc: getSuiTestnetChainInput },
  suiMainnet: { schema: SuiChainConfigSchema, getInputFunc: getSuiMainnetChainInput },
  arbitrumMainnet: { schema: EvmChainConfigSchema, getInputFunc: getArbitrumMainnetChainInput },
  arbitrumSepolia: {
    schema: EvmChainConfigSchema,
    getInputFunc: getArbitrumSepoliaChainInput,
  },
  baseMainnet: { schema: EvmChainConfigSchema, getInputFunc: getBaseMainnetChainInput },
  baseSepolia: {
    schema: EvmChainConfigSchema,
    getInputFunc: getBaseSepoliaChainInput,
  },
  ethereumMainnet: {
    schema: EvmChainConfigSchema,
    getInputFunc: getEthereumMainnetChainInput,
  },
  ethereumSepolia: {
    schema: EvmChainConfigSchema,
    getInputFunc: getEthereumSepoliaChainInput,
  },
  solanaDevnetImported: {
    schema: SolanaChainConfigSchema,
    getInputFunc: getSolanaDevnetImportedChainInput,
  },
  // Add other chains here if they become supported
};

export const getAvailableChainKeys = (): string[] => Object.keys(chainSchemaRegistry);
