import logger from '../utils/Logger.js';
import type { ChainHandlerRegistry } from './ChainHandlerRegistry.js';

let registryInstance: ChainHandlerRegistry | null = null;

export function setChainHandlerRegistry(instance: ChainHandlerRegistry): void {
  if (registryInstance) {
    // Optional: throw an error or log a warning if it's set multiple times
    logger.warn('ChainHandlerRegistry instance is being overwritten.');
  }
  registryInstance = instance;
}

export function getChainHandlerRegistry(): ChainHandlerRegistry {
  if (!registryInstance) {
    throw new Error(
      'ChainHandlerRegistry has not been set. Ensure setChainHandlerRegistry is called during app initialization.',
    );
  }
  return registryInstance;
}
