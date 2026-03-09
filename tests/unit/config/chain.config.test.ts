// --- Variable declarations for mock functions ---
let mockGetArbitrumSepoliaChainInput: jest.Mock;
let mockGetBaseSepoliaChainInput: jest.Mock;
let mockEvmChainConfigSchemaParse: jest.Mock;
let mockStarknetChainConfigSchemaParse: jest.Mock;
let mockGetStarknetTestnetChainInput: jest.Mock;

// Initialize the mocks before the registry mock
mockGetArbitrumSepoliaChainInput = jest.fn();
mockGetBaseSepoliaChainInput = jest.fn();
mockEvmChainConfigSchemaParse = jest.fn();
mockStarknetChainConfigSchemaParse = jest.fn();
mockGetStarknetTestnetChainInput = jest.fn();

import { ZodError } from 'zod';
// Import the actual chainRegistry to spy on its methods
import * as actualChainRegistry from '../../../config/chainRegistry.js';

// --- Mock process.exit ---
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  // Do nothing
}) as any);

// --- Mock Logger ---
jest.mock('../../../utils/Logger.js', () => ({
  __esModule: true,
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
  // Named exports if any are directly used by config/index.ts
}));
const loggerMock = require('../../../utils/Logger.js').default;

// --- Mock appConfig from app.config.ts ---
// We need to control SUPPORTED_CHAINS for tests of config/index.ts's main export.
const mockAppConfig: Partial<AppConfig> = {
  SUPPORTED_CHAINS: undefined, // Default to undefined, tests can override
};
jest.mock('../../../config/app.config.js', () => ({
  __esModule: true,
  appConfig: mockAppConfig,
}));

jest.mock('../../../config/chain/arbitrumSepolia.chain.js', () => {
  mockGetArbitrumSepoliaChainInput = jest.fn();
  return {
    __esModule: true,
    getArbitrumSepoliaChainInput: mockGetArbitrumSepoliaChainInput,
  };
});

jest.mock('../../../config/chain/baseSepolia.chain.js', () => {
  mockGetBaseSepoliaChainInput = jest.fn();
  return {
    __esModule: true,
    getBaseSepoliaChainInput: mockGetBaseSepoliaChainInput,
  };
});
jest.mock('../../../config/schemas/evm.chain.schema.js', () => {
  mockEvmChainConfigSchemaParse = jest.fn();
  return {
    __esModule: true,
    EvmChainConfigSchema: { parse: mockEvmChainConfigSchemaParse },
  };
});

jest.mock('../../../config/chain/starknet.chain.js', () => {
  mockGetStarknetTestnetChainInput = jest.fn();
  return {
    __esModule: true,
    getStarknetTestnetChainInput: mockGetStarknetTestnetChainInput,
  };
});
jest.mock('../../../config/schemas/starknet.chain.schema.js', () => {
  mockStarknetChainConfigSchemaParse = jest.fn();
  return {
    __esModule: true,
    StarknetChainConfigSchema: { parse: mockStarknetChainConfigSchemaParse },
  };
});

// --- Mock chainRegistry ---
jest.mock('../../../config/chainRegistry.js', () => ({
  __esModule: true,
  chainSchemaRegistry: {
    arbitrumSepolia: {
      getInputFunc: mockGetArbitrumSepoliaChainInput,
      schema: { parse: mockEvmChainConfigSchemaParse },
    },
    baseSepolia: {
      getInputFunc: mockGetBaseSepoliaChainInput,
      schema: { parse: mockEvmChainConfigSchemaParse },
    },
    starknetTestnet: {
      getInputFunc: mockGetStarknetTestnetChainInput,
      schema: { parse: mockStarknetChainConfigSchemaParse },
    },
    solanaDevnet: {
      getInputFunc: jest.fn(),
      schema: { parse: jest.fn() },
    },
    suiTestnet: {
      getInputFunc: jest.fn(),
      schema: { parse: jest.fn() },
    },
    arbitrumMainnet: {
      getInputFunc: jest.fn(),
      schema: { parse: jest.fn() },
    },
    baseMainnet: {
      getInputFunc: jest.fn(),
      schema: { parse: jest.fn() },
    },
    solanaDevnetImported: {
      getInputFunc: jest.fn(),
      schema: { parse: jest.fn() },
    },
  },
  getAvailableChainKeys: () => [
    'arbitrumSepolia',
    'baseSepolia',
    'starknetTestnet',
    'solanaDevnet',
    'suiTestnet',
    'arbitrumMainnet',
    'baseMainnet',
    'solanaDevnetImported',
  ],
}));

// Import the module to be tested *after* all mocks are set up
import {
  loadAndValidateChainConfigs,
  // chainConfigs, // We will test this later with jest.isolateModules
  // getAvailableChainKeys, // Can also be tested
} from '../../../config/index.js';
import type { ChainValidationError } from '../../../config/index.js';
import { AppConfig } from '../../../config/schemas/app.schema';

let originalProcessEnv: NodeJS.ProcessEnv;
let getAvailableChainsSpy: jest.SpyInstance | undefined;

beforeAll(() => {
  originalProcessEnv = { ...process.env };
});

afterAll(() => {
  process.env = originalProcessEnv;
  mockProcessExit.mockRestore();
});

beforeEach(() => {
  process.env = {}; // Clear process.env for each test
  mockProcessExit.mockClear();
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();

  // Reset appConfig mock property for SUPPORTED_CHAINS
  mockAppConfig.SUPPORTED_CHAINS = undefined;

  // Reset mocks for chain inputs and schema parsers
  mockGetArbitrumSepoliaChainInput.mockReset();
  mockGetBaseSepoliaChainInput.mockReset();
  mockEvmChainConfigSchemaParse.mockReset();
  mockGetStarknetTestnetChainInput.mockReset();
  mockStarknetChainConfigSchemaParse.mockReset();
  // Restore any spy that might have been set
  if (getAvailableChainsSpy) {
    getAvailableChainsSpy.mockRestore();
    getAvailableChainsSpy = undefined;
  }
});

describe('loadAndValidateChainConfigs', () => {
  const arbitrumSepoliaInput = { chainName: 'ArbitrumSepoliaInput' };
  const arbitrumSepoliaOutput = { chainName: 'ArbitrumSepoliaOutput', chainType: 'EVM' };
  const baseSepoliaInput = { chainName: 'BaseSepoliaInput' };
  const baseSepoliaOutput = { chainName: 'BaseSepoliaOutput', chainType: 'EVM' };
  const starknetInput = { chainName: 'StarknetTestnetInput' };
  const starknetOutput = { chainName: 'StarknetTestnetOutput', chainType: 'Starknet' };

  it('should load and validate a single valid chain (ArbitrumSepolia EVM)', () => {
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockEvmChainConfigSchemaParse.mockReturnValue(arbitrumSepoliaOutput);

    const { configs, validationErrors } = loadAndValidateChainConfigs(
      ['arbitrumSepolia'],
      loggerMock,
    );

    expect(validationErrors).toHaveLength(0);
    expect(configs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(mockGetArbitrumSepoliaChainInput).toHaveBeenCalledTimes(1);
    expect(mockEvmChainConfigSchemaParse).toHaveBeenCalledWith(arbitrumSepoliaInput);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Attempting to load and validate configuration for chain: arbitrumSepolia',
      ),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully loaded configuration for chain: arbitrumSepolia'),
    );
  });

  it('should load and validate multiple valid chains (ArbitrumSepolia, BaseSepolia, Starknet)', () => {
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse
      .mockReturnValueOnce(arbitrumSepoliaOutput)
      .mockReturnValueOnce(baseSepoliaOutput);
    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockReturnValue(starknetOutput);

    const { configs, validationErrors } = loadAndValidateChainConfigs(
      ['arbitrumSepolia', 'baseSepolia', 'starknetTestnet'],
      loggerMock,
    );

    expect(validationErrors).toHaveLength(0);
    expect(configs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configs.baseSepolia).toEqual(baseSepoliaOutput);
    expect(configs.starknetTestnet).toEqual(starknetOutput);
    expect(Object.keys(configs)).toHaveLength(3);
  });

  it('should return a validation error if a chain is not in the registry', () => {
    const { configs, validationErrors } = loadAndValidateChainConfigs(['unknownChain'], loggerMock);

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].chainKey).toBe('unknownChain');
    expect(validationErrors[0].error).toBe('No schema registry entry found');
    expect(Object.keys(configs)).toHaveLength(0);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('No schema registry entry found for requested chain: unknownChain'),
    );
  });

  it('should return a validation error if chain input function throws', () => {
    const error = new Error('Failed to get input');
    mockGetArbitrumSepoliaChainInput.mockImplementation(() => {
      throw error;
    });

    const { configs, validationErrors } = loadAndValidateChainConfigs(
      ['arbitrumSepolia'],
      loggerMock,
    );

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].chainKey).toBe('arbitrumSepolia');
    expect(validationErrors[0].error).toBe(error); // The original error object
    expect(validationErrors[0].input).toContain('Input data could not be retrieved');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("UNEXPECTED ERROR loading/validating chain 'arbitrumSepolia'"),
    );
    expect(Object.keys(configs)).toHaveLength(0);
  });

  it('should return a validation error if Zod schema parsing fails', () => {
    const zodError = new ZodError([
      {
        code: 'custom',
        path: ['field'],
        message: 'Zod validation failed',
      },
    ]);
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse.mockImplementation(() => {
      throw zodError;
    });

    const { configs, validationErrors } = loadAndValidateChainConfigs(['baseSepolia'], loggerMock);

    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].chainKey).toBe('baseSepolia');
    expect(validationErrors[0].isZodError).toBe(true);
    expect(validationErrors[0].input).toEqual(baseSepoliaInput);
    // Check that the logger received the flattened Zod error
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("Config validation failed for 'baseSepolia'. Flattened Zod errors:"),
    );
    expect(Object.keys(configs)).toHaveLength(0);
  });

  it('should handle a mix of valid and invalid chains', () => {
    const zodError = new ZodError([
      { code: 'custom', path: ['field'], message: 'Zod validation failed' },
    ]);
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockEvmChainConfigSchemaParse.mockReturnValue(arbitrumSepoliaOutput); // ArbitrumSepolia is valid

    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockImplementation(() => {
      throw zodError;
    }); // Starknet is invalid (Zod error)

    const { configs, validationErrors } = loadAndValidateChainConfigs(
      ['arbitrumSepolia', 'starknetTestnet', 'unknownChain'],
      loggerMock,
    );

    expect(Object.keys(configs)).toHaveLength(1);
    expect(configs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configs.starknetTestnet).toBeUndefined();
    expect(configs.unknownChain).toBeUndefined();

    expect(validationErrors).toHaveLength(2);
    const starknetError = validationErrors.find(
      (err: ChainValidationError) => err.chainKey === 'starknetTestnet',
    );
    const unknownChainError = validationErrors.find(
      (err: ChainValidationError) => err.chainKey === 'unknownChain',
    );

    expect(starknetError).toBeDefined();
    expect(starknetError?.isZodError).toBe(true);
    expect(starknetError?.input).toEqual(starknetInput);

    expect(unknownChainError).toBeDefined();
    expect(unknownChainError?.error).toBe('No schema registry entry found');

    expect(loggerMock.error).toHaveBeenCalledTimes(1); // For Starknet Zod error
    expect(loggerMock.warn).toHaveBeenCalledTimes(2); // For unknownChain and potentially other issues
  });

  it('should handle an empty targetChainKeys array gracefully', () => {
    const { configs, validationErrors } = loadAndValidateChainConfigs([], loggerMock);
    expect(Object.keys(configs)).toHaveLength(0);
    expect(validationErrors).toHaveLength(0);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('Attempting to load configurations for chains: '),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully loaded 0 chain configuration(s) out of 0 requested'),
    );
  });

  it('should log detailed Zod error information correctly', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['someField'],
        message: 'Expected string, received number',
      },
      {
        code: 'too_small',
        minimum: 5,
        type: 'string',
        inclusive: true,
        path: ['otherField'],
        message: 'Too small',
      },
    ]);
    const flattenedError = zodError.flatten();

    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockEvmChainConfigSchemaParse.mockImplementation(() => {
      throw zodError;
    });

    loadAndValidateChainConfigs(['arbitrumSepolia'], loggerMock);

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      `Config validation failed for 'arbitrumSepolia'. Flattened Zod errors: ${JSON.stringify(flattenedError, null, 2)}`,
    );
  });

  // Add more tests: mix of valid/invalid, empty targetChains, logging details
});

describe('chainConfigs Main Export and Initial Load', () => {
  const arbitrumSepoliaInput = { chainName: 'ArbitrumSepoliaInput' };
  const arbitrumSepoliaOutput = { chainName: 'ArbitrumSepoliaOutput', chainType: 'EVM' };
  const baseSepoliaInput = { chainName: 'BaseSepoliaInput' };
  const baseSepoliaOutput = { chainName: 'BaseSepoliaOutput', chainType: 'EVM' };

  // Helper to load config/index.ts within an isolated module scope
  const loadIsolatedConfigIndex = () => {
    let configIndex: any;
    jest.isolateModules(() => {
      // This will re-evaluate config/index.ts, including its top-level logic
      // that uses the (now potentially modified by tests) appConfig mock.
      configIndex = require('../../../config/index.js');
    });
    return configIndex;
  };

  it('should load chains specified in appConfig.SUPPORTED_CHAINS', () => {
    mockAppConfig.SUPPORTED_CHAINS = 'arbitrumSepolia';
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockEvmChainConfigSchemaParse.mockReturnValue(arbitrumSepoliaOutput);

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.starknetTestnet).toBeUndefined();
    expect(mockProcessExit).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('should attempt to load all registered chains if SUPPORTED_CHAINS is undefined', () => {
    mockAppConfig.SUPPORTED_CHAINS = undefined; // Explicitly undefined
    // ArbitrumSepolia will be valid
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    // BaseSepolia will be valid
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse
      .mockReturnValueOnce(arbitrumSepoliaOutput)
      .mockReturnValueOnce(baseSepoliaOutput);
    // Starknet will also be attempted (mock it as valid for this test)
    const starknetInput = { chainName: 'StarknetTestnetInput' };
    const starknetOutput = { chainName: 'StarknetTestnetOutput', chainType: 'Starknet' };
    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockReturnValue(starknetOutput);

    // We need to ensure our mocks for schemas/inputs cover all chains in the actual registry
    // For this test, assume only arbitrumSepolia, baseSepolia and starknetTestnet are in the mocked registry part of config/index
    // A more robust way would be to mock the actual chainSchemaRegistry if possible, or ensure all its keys have mocks.

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.baseSepolia).toEqual(baseSepoliaOutput);
    // This expectation depends on starknetTestnet being in the actual registry inside config/index.ts
    // and its mocks being active.
    expect(configIndex.chainConfigs.starknetTestnet).toEqual(starknetOutput);
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('should attempt to load all registered chains if SUPPORTED_CHAINS is an empty string', () => {
    mockAppConfig.SUPPORTED_CHAINS = ''; // Empty string
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse
      .mockReturnValueOnce(arbitrumSepoliaOutput)
      .mockReturnValueOnce(baseSepoliaOutput);
    // For simplicity, assume only arbitrumSepolia and baseSepolia are attempted or successfully loaded

    const configIndex = loadIsolatedConfigIndex();
    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.baseSepolia).toEqual(baseSepoliaOutput);
    // Potentially other chains would be loaded too, depending on registry
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('should call process.exit if any chain fails to load during initial load (due to Zod error)', () => {
    mockAppConfig.SUPPORTED_CHAINS = 'arbitrumSepolia';
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    const zodError = new ZodError([{ code: 'custom', path: [], message: 'Critical Zod Fail' }]);
    mockEvmChainConfigSchemaParse.mockImplementation(() => {
      throw zodError;
    });

    loadIsolatedConfigIndex(); // This will trigger the load and potential exit

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('CHAIN CONFIGURATION ERRORS DETECTED DURING STARTUP'),
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("Chain 'arbitrumSepolia': Validation FAILED."),
    );
  });

  it('should call process.exit if input function throws during initial load', () => {
    mockAppConfig.SUPPORTED_CHAINS = 'baseSepolia';
    mockGetBaseSepoliaChainInput.mockImplementation(() => {
      throw new Error('Input Gen Fail');
    });

    loadIsolatedConfigIndex();

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('CHAIN CONFIGURATION ERRORS DETECTED DURING STARTUP'),
    );
  });

  it('should not call process.exit if SUPPORTED_CHAINS is valid and leads to no chains to load (e.g. " ") but no errors', () => {
    mockAppConfig.SUPPORTED_CHAINS = '   '; // Whitespace only, parsed to empty array
    getAvailableChainsSpy = jest.spyOn(actualChainRegistry, 'getAvailableChainKeys');
    getAvailableChainsSpy.mockReturnValue([]);
    loadIsolatedConfigIndex();
    expect(mockProcessExit).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'No chains specified to load via SUPPORTED_CHAINS, and not defaulting to all chains. chainConfigs will be empty.',
      ),
    );
  });
});

describe('getAvailableChainKeys', () => {
  it('should return the list of keys from the chainSchemaRegistry', () => {
    // Import it here to ensure it's the one from the actual module, not affected by isolation in other tests
    const { getAvailableChainKeys } = require('../../../config/index.js');
    const keys = getAvailableChainKeys();

    // This assertion depends on the actual content of chainSchemaRegistry in config/index.ts
    // Based on our mocks and typical setup, we expect at least these.
    expect(keys).toEqual(
      expect.arrayContaining([
        'arbitrumSepolia',
        'baseSepolia',
        'solanaDevnet',
        'starknetTestnet',
        'suiTestnet',
        'arbitrumMainnet',
        'baseMainnet',
        'solanaDevnetImported',
        // Add any other keys that are in your actual chainSchemaRegistry
      ]),
    );
    // A more precise test if you know all keys:
    // expect(keys.sort()).toEqual(['arbitrumMainnet', 'baseMainnet', ...].sort());
  });
});

// Tests continue below

describe('config/index.ts module initialization', () => {
  const arbitrumSepoliaInput = { chainName: 'ArbitrumSepoliaInputIsolated' };
  const arbitrumSepoliaOutput = { chainName: 'ArbitrumSepoliaOutputIsolated', chainType: 'EVM' };
  const baseSepoliaInput = { chainName: 'BaseSepoliaInputIsolated' };
  const baseSepoliaOutput = { chainName: 'BaseSepoliaOutputIsolated', chainType: 'EVM' };
  const starknetInput = { chainName: 'StarknetTestnetInputIsolated' };
  const starknetOutput = { chainName: 'StarknetTestnetOutputIsolated', chainType: 'Starknet' };

  const loadIsolatedConfigIndex = () => {
    let configIndexModule: typeof import('../../../config/index.js');
    jest.isolateModules(() => {
      configIndexModule = require('../../../config/index.js');
    });
    return configIndexModule!;
  };

  afterEach(() => {
    if (getAvailableChainsSpy) {
      getAvailableChainsSpy.mockRestore();
      getAvailableChainsSpy = undefined;
    }
  });

  it('should load explicitly defined SUPPORTED_CHAINS and not exit on success', () => {
    mockAppConfig.SUPPORTED_CHAINS = 'arbitrumSepolia,baseSepolia,starknetTestnet';
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse
      .mockReturnValueOnce(arbitrumSepoliaOutput)
      .mockReturnValueOnce(baseSepoliaOutput);
    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockReturnValue(starknetOutput);

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.baseSepolia).toEqual(baseSepoliaOutput);
    expect(configIndex.chainConfigs.starknetTestnet).toEqual(starknetOutput);
    expect(configIndex.chainConfigErrors).toHaveLength(0);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Attempting to load configurations for chains: arbitrumSepolia, baseSepolia, starknetTestnet',
      ),
    );
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('should call process.exit(1) if explicitly defined SUPPORTED_CHAINS contains errors', () => {
    mockAppConfig.SUPPORTED_CHAINS = 'arbitrumSepolia,unknownChain';
    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockEvmChainConfigSchemaParse.mockReturnValue(arbitrumSepoliaOutput);
    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockReturnValue(starknetOutput);

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.starknetTestnet).toBeUndefined();
    expect(
      configIndex.chainConfigErrors.some(
        (e: ChainValidationError) => e.chainKey === 'unknownChain',
      ),
    ).toBe(true);
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('should attempt to load all registered chains if SUPPORTED_CHAINS is undefined, and succeed if mocks are good', () => {
    mockAppConfig.SUPPORTED_CHAINS = undefined;
    getAvailableChainsSpy = jest.spyOn(actualChainRegistry, 'getAvailableChainKeys');
    getAvailableChainsSpy.mockReturnValue(['arbitrumSepolia', 'baseSepolia', 'starknetTestnet']);

    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse
      .mockReturnValueOnce(arbitrumSepoliaOutput)
      .mockReturnValueOnce(baseSepoliaOutput);
    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockReturnValue(starknetOutput);

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.baseSepolia).toEqual(baseSepoliaOutput);
    expect(configIndex.chainConfigs.starknetTestnet).toEqual(starknetOutput);
    expect(configIndex.chainConfigErrors).toHaveLength(0);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'SUPPORTED_CHAINS is not set. Attempting to load all registered chain configurations.',
      ),
    );
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('should attempt to load all registered chains if SUPPORTED_CHAINS is an empty string, and succeed if mocks are good', () => {
    mockAppConfig.SUPPORTED_CHAINS = '';
    getAvailableChainsSpy = jest.spyOn(actualChainRegistry, 'getAvailableChainKeys');
    getAvailableChainsSpy.mockReturnValue(['arbitrumSepolia', 'baseSepolia', 'starknetTestnet']);

    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockGetBaseSepoliaChainInput.mockReturnValue(baseSepoliaInput);
    mockEvmChainConfigSchemaParse
      .mockReturnValueOnce(arbitrumSepoliaOutput)
      .mockReturnValueOnce(baseSepoliaOutput);
    mockGetStarknetTestnetChainInput.mockReturnValue(starknetInput);
    mockStarknetChainConfigSchemaParse.mockReturnValue(starknetOutput);

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(configIndex.chainConfigs.baseSepolia).toEqual(baseSepoliaOutput);
    expect(configIndex.chainConfigs.starknetTestnet).toEqual(starknetOutput);
    expect(configIndex.chainConfigErrors).toHaveLength(0);
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'SUPPORTED_CHAINS is not set. Attempting to load all registered chain configurations.',
      ),
    );
    expect(mockProcessExit).not.toHaveBeenCalled();
  });

  it('should call process.exit(1) if SUPPORTED_CHAINS is undefined and loading available chains results in errors', () => {
    mockAppConfig.SUPPORTED_CHAINS = undefined;
    getAvailableChainsSpy = jest.spyOn(actualChainRegistry, 'getAvailableChainKeys');
    getAvailableChainsSpy.mockReturnValue(['arbitrumSepolia', 'unknownChain']);

    mockGetArbitrumSepoliaChainInput.mockReturnValue(arbitrumSepoliaInput);
    mockEvmChainConfigSchemaParse.mockReturnValue(arbitrumSepoliaOutput);

    const configIndex = loadIsolatedConfigIndex();

    expect(configIndex.chainConfigs.arbitrumSepolia).toEqual(arbitrumSepoliaOutput);
    expect(
      configIndex.chainConfigErrors.some(
        (e: ChainValidationError) => e.chainKey === 'unknownChain',
      ),
    ).toBe(true);
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('should not call process.exit if SUPPORTED_CHAINS is " " (empty after trim) AND fallback to available chains is empty', () => {
    mockAppConfig.SUPPORTED_CHAINS = ' ';
    getAvailableChainsSpy = jest.spyOn(actualChainRegistry, 'getAvailableChainKeys');
    getAvailableChainsSpy.mockReturnValue([]);

    const configIndex = loadIsolatedConfigIndex();

    expect(Object.keys(configIndex.chainConfigs)).toHaveLength(0);
    expect(configIndex.chainConfigErrors).toHaveLength(0);
    expect(mockProcessExit).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'No chains specified to load via SUPPORTED_CHAINS, and not defaulting to all chains. chainConfigs will be empty.',
      ),
    );
    expect(getAvailableChainsSpy).toHaveBeenCalledTimes(1);
  });

  it('should call process.exit(1) if SUPPORTED_CHAINS is " " (empty after trim) AND fallback to available chains has errors', () => {
    mockAppConfig.SUPPORTED_CHAINS = ' ';
    getAvailableChainsSpy = jest.spyOn(actualChainRegistry, 'getAvailableChainKeys');
    getAvailableChainsSpy.mockReturnValue(['unknownChain']);

    const configIndex = loadIsolatedConfigIndex();
    expect(
      configIndex.chainConfigErrors.some(
        (e: ChainValidationError) => e.chainKey === 'unknownChain',
      ),
    ).toBe(true);
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('should handle critical error during appConfig access or SUPPORTED_CHAINS parsing', () => {
    Object.defineProperty(mockAppConfig, 'SUPPORTED_CHAINS', {
      get: () => {
        throw new Error('Cannot access SUPPORTED_CHAINS');
      },
      configurable: true,
    });

    loadIsolatedConfigIndex();
    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(loggerMock.fatal).toHaveBeenCalled();

    Object.defineProperty(mockAppConfig, 'SUPPORTED_CHAINS', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });
});

describe('config/index.ts getAvailableChainKeys export', () => {
  it('should return the list of keys from the actual chainSchemaRegistry', () => {
    let configIndexModule: any; // Or more specific type: typeof import('../../../config/index.js');
    jest.isolateModules(() => {
      configIndexModule = require('../../../config/index.js');
    });

    const keysFromConfigIndex = configIndexModule.getAvailableChainKeys();
    const actualKeysFromRegistryFile = actualChainRegistry.getAvailableChainKeys();

    expect(keysFromConfigIndex).toEqual(actualKeysFromRegistryFile);
    expect(keysFromConfigIndex).toEqual(
      expect.arrayContaining(Object.keys(actualChainRegistry.chainSchemaRegistry)),
    );
  });
});
