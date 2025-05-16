import { ChainHandlerInterface } from '../interfaces/ChainHandler.interface';
import { ChainConfig, CHAIN_TYPE } from '../types/ChainConfig.type';
import { EVMChainHandler } from './EVMChainHandler';
import { LogMessage } from '../utils/Logs';

// --- Import New Handlers ---
import { StarknetChainHandler } from './StarknetChainHandler';
import { SuiChainHandler } from './SuiChainHandler';
import { SolanaChainHandler } from './SolanaChainHandler';

/**
 * Factory class for creating appropriate chain handlers based on configuration
 */
export class ChainHandlerFactory {
  /**
   * Create a chain handler based on the provided configuration
   * @param chainConfig Configuration for the chain
   * @returns An instance of a chain handler
   */
  static createHandler(chainConfig: ChainConfig): ChainHandlerInterface {
    LogMessage(
      `Factory: Creating chain handler for ${chainConfig.chainName} (${chainConfig.chainType})`
    );

    switch (chainConfig.chainType) {
      case CHAIN_TYPE.EVM:
        return new EVMChainHandler(chainConfig);

      case CHAIN_TYPE.STARKNET:
        return new StarknetChainHandler(chainConfig);

      case CHAIN_TYPE.SUI:
        return new SuiChainHandler(chainConfig);

      case CHAIN_TYPE.SOLANA:
        return new SolanaChainHandler(chainConfig);

      default:
        // Ensure exhaustive check - if new types added, this will error
        const _exhaustiveCheck: never = chainConfig.chainType;
        throw new Error(`Unsupported chain type: ${_exhaustiveCheck}`);
    }
  }
}
