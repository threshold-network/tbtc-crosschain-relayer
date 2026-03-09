import { CHAIN_TYPE } from '../config/schemas/common.schema.js';
import logger from '../utils/Logger.js';

import type { AnyChainConfig } from '../config/index.js';
import type { EvmChainConfig } from '../config/schemas/evm.chain.schema.js';
import { L1RedemptionHandler } from './L1RedemptionHandler.js';
import { L1RedemptionHandlerInterface } from '../interfaces/L1RedemptionHandler.interface.js';

/**
 * Factory class for creating appropriate chain handlers based on configuration
 */
export class L1RedemptionHandlerFactory {
  /**
   * Create a chain handler based on the provided configuration
   * @param config Configuration for the chain
   * @returns An instance of a chain handler
   */
  static createHandler(config: AnyChainConfig): L1RedemptionHandlerInterface | null {
    logger.info(
      `Attempting to create chain handler for type: ${config.chainType}, name: ${config.chainName}`,
    );

    switch (config.chainType as CHAIN_TYPE) {
      case CHAIN_TYPE.EVM:
        logger.info('Creating EVMChainHandler');
        return new L1RedemptionHandler(config as EvmChainConfig);
      default:
        logger.error(`Unsupported chain type: ${config.chainType}`);
        throw new Error(`Unsupported chain type: ${config.chainType}`);
    }
  }
}
