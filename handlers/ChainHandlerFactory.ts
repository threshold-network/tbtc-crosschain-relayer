import type { ChainHandlerInterface } from '../interfaces/ChainHandler.interface.js';
import { CHAIN_TYPE } from '../config/schemas/common.schema.js';
import logger from '../utils/Logger.js';

import { EVMChainHandler } from './EVMChainHandler.js';
import { StarknetChainHandler } from './StarknetChainHandler.js';
import { SuiChainHandler } from './SuiChainHandler.js';
import { SolanaChainHandler } from './SolanaChainHandler.js';

import type { AnyChainConfig } from '../config/index.js';
import type { EvmChainConfig } from '../config/schemas/evm.chain.schema.js';
import type { SolanaChainConfig } from '../config/schemas/solana.chain.schema.js';
import type { StarknetChainConfig } from '../config/schemas/starknet.chain.schema.js';
import type { SuiChainConfig } from '../config/schemas/sui.chain.schema.js';

/**
 * Factory class for creating appropriate chain handlers based on configuration
 */
export class ChainHandlerFactory {
  /**
   * Create a chain handler based on the provided configuration
   * @param config Configuration for the chain
   * @returns An instance of a chain handler
   */
  static createHandler(config: AnyChainConfig): ChainHandlerInterface | null {
    logger.info(
      `Attempting to create chain handler for type: ${config.chainType}, name: ${config.chainName}`,
    );

    switch (config.chainType as CHAIN_TYPE) {
      case CHAIN_TYPE.EVM:
        logger.info('Creating EVMChainHandler');
        return new EVMChainHandler(config as EvmChainConfig);

      case CHAIN_TYPE.STARKNET:
        logger.info('Creating StarknetChainHandler');
        return new StarknetChainHandler(config as StarknetChainConfig);

      case CHAIN_TYPE.SUI:
        logger.info('Creating SuiChainHandler');
        return new SuiChainHandler(config as SuiChainConfig);

      case CHAIN_TYPE.SOLANA:
        logger.info('Creating SolanaChainHandler');
        return new SolanaChainHandler(config as SolanaChainConfig);

      default:
        logger.error(`Unsupported chain type: ${config.chainType}`);
        throw new Error(`Unsupported chain type: ${config.chainType}`);
    }
  }
}
