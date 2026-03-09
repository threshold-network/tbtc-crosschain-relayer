import type { AnyChainConfig } from '../config/index.js';
import { CHAIN_TYPE } from '../config/schemas/common.schema.js';
import { L1RedemptionHandlerInterface } from '../interfaces/L1RedemptionHandler.interface.js';
import { logErrorContext } from '../utils/Logger.js';
import { L1RedemptionHandlerFactory } from './L1RedemptionHandlerFactory.js';

/**
 * Manages L1RedemptionHandler instances.
 * Uses a composite key based on L1 RPC URL, L1 contract address, and L1 signer address
 * to reuse handlers for chains sharing the same L1 configuration.
 */
class L1RedemptionHandlerRegistry {
  private handlers: Map<string, L1RedemptionHandlerInterface> = new Map();

  // Register a handler for a chainName
  register(chainName: string, handler: L1RedemptionHandlerInterface): void {
    this.handlers.set(chainName, handler);
  }

  // Get a handler by chainName
  get(chainName: string): L1RedemptionHandlerInterface | undefined {
    return this.handlers.get(chainName);
  }

  // List all handlers
  list(): L1RedemptionHandlerInterface[] {
    return Array.from(this.handlers.values());
  }

  // Filter handlers by a predicate
  filter(
    predicate: (handler: L1RedemptionHandlerInterface) => boolean,
  ): L1RedemptionHandlerInterface[] {
    return this.list().filter(predicate);
  }

  public async initialize(configs: AnyChainConfig[]): Promise<void> {
    for (const config of configs) {
      if (!config.enableL2Redemption || config.chainType !== CHAIN_TYPE.EVM) {
        continue;
      }
      try {
        const handler = L1RedemptionHandlerFactory.createHandler(config);
        const handlerExists = this.get(config.chainName) !== undefined;
        if (handler && !handlerExists) {
          await handler.initialize();
          this.register(config.chainName, handler);
        }
      } catch (error) {
        logErrorContext(`Failed to initialize L1RedemptionHandler for ${config.chainName}`, error, {
          chainName: config.chainName,
        });
      }
    }
  }

  public clear(): void {
    this.handlers.clear();
  }
}

export const l1RedemptionHandlerRegistry = new L1RedemptionHandlerRegistry();
export { L1RedemptionHandlerRegistry };
