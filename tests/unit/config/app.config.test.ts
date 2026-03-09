import { AppConfig, AppConfigSchema, NodeEnv } from '../../../config/schemas/app.schema';
import logger from '../../../utils/Logger';
import { ZodError } from 'zod';

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation(
  (() => {}) as any, // Type assertion to satisfy jest.SpyInstance
);

// Mock the logger module
jest.mock('../../../utils/Logger.js', () => ({
  __esModule: true, // This is important for ES modules
  default: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
  // Mock named exports from Logger.ts if they were used by app.config.ts (not the case here)
}));

let originalProcessEnv: NodeJS.ProcessEnv;

const MINIMAL_VALID_ENV = {
  APP_NAME: 'TestApp',
  APP_VERSION: '1.0.0',
  DATABASE_URL: 'postgresql://user:pass@host:port/db',
  USE_ENDPOINT: 'false',
};

beforeAll(() => {
  originalProcessEnv = { ...process.env };
});

afterAll(() => {
  process.env = originalProcessEnv;
  mockExit.mockRestore();
});

beforeEach(() => {
  // Reset process.env before each test
  process.env = {};
  // Clear mocks
  mockExit.mockClear();
  // Ensure logger methods are clear if they are mock functions
  if (jest.isMockFunction(logger.error)) {
    (logger.error as jest.Mock).mockClear();
  }
  if (jest.isMockFunction(logger.warn)) {
    (logger.warn as jest.Mock).mockClear();
  }
});

// Helper function to load appConfig with current process.env using jest.isolateModules
const loadAppConfig = (): AppConfig => {
  let appConfigModule: { appConfig: AppConfig };
  jest.isolateModules(() => {
    appConfigModule = require('../../../config/app.config.js');
  });
  return appConfigModule!.appConfig;
};

describe('AppConfigSchema Direct Validation', () => {
  it('should validate with minimal required environment variables', () => {
    expect(() => AppConfigSchema.parse(MINIMAL_VALID_ENV)).not.toThrow();
  });

  it('should apply default values correctly with minimal valid env', () => {
    const parsed = AppConfigSchema.parse(MINIMAL_VALID_ENV);
    expect(parsed.NODE_ENV).toBe(NodeEnv.DEVELOPMENT);
    expect(parsed.VERBOSE_APP).toBe(false);
    expect(parsed.API_ONLY_MODE).toBe(false);
    expect(parsed.ENABLE_CLEANUP_CRON).toBe(false);
    expect(parsed.HOST_PORT).toBe(4000);
    expect(parsed.APP_PORT).toBe(3000);
    expect(parsed.CORS_ENABLED).toBe(true);
    expect(parsed.CORS_URL).toBeUndefined(); // Optional, so undefined if not provided
    expect(parsed.CLEAN_QUEUED_TIME).toBe(48);
    expect(parsed.CLEAN_FINALIZED_TIME).toBe(12);
    expect(parsed.CLEAN_BRIDGED_TIME).toBe(12);
    expect(parsed.SUPPORTED_CHAINS).toBeUndefined(); // Optional
  });

  it('should fail if APP_NAME is missing', () => {
    const env = { ...MINIMAL_VALID_ENV, APP_NAME: undefined };
    delete env.APP_NAME;
    try {
      AppConfigSchema.parse(env);
      throw new Error('Should have thrown ZodError');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      if (e instanceof ZodError) {
        expect(e.issues[0].path).toEqual(['APP_NAME']);
        expect(e.issues[0].message).toBe('Required');
      }
    }
  });

  it('should fail if DATABASE_URL is missing', () => {
    const env = { ...MINIMAL_VALID_ENV, DATABASE_URL: undefined };
    delete env.DATABASE_URL;
    try {
      AppConfigSchema.parse(env);
      throw new Error('Should have thrown ZodError');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      if (e instanceof ZodError) {
        expect(e.issues[0].path).toEqual(['DATABASE_URL']);
        expect(e.issues[0].message).toBe('Required');
      }
    }
  });

  it('should correctly parse all valid provided values', () => {
    const fullEnv = {
      ...MINIMAL_VALID_ENV,
      NODE_ENV: 'production',
      VERBOSE_APP: 'true',
      API_ONLY_MODE: 'true',
      ENABLE_CLEANUP_CRON: 'true',
      HOST_PORT: '8080',
      APP_PORT: '3030',
      CORS_ENABLED: 'false',
      CORS_URL: 'https://example.com',
      CLEAN_QUEUED_TIME: '24',
      CLEAN_FINALIZED_TIME: '6',
      CLEAN_BRIDGED_TIME: '6',
      SUPPORTED_CHAINS: 'arbitrumSepolia, baseSepolia, starknetTestnet ',
    };
    const parsed = AppConfigSchema.parse(fullEnv);
    expect(parsed.NODE_ENV).toBe(NodeEnv.PRODUCTION);
    expect(parsed.VERBOSE_APP).toBe(true);
    expect(parsed.API_ONLY_MODE).toBe(true);
    expect(parsed.ENABLE_CLEANUP_CRON).toBe(true);
    expect(parsed.HOST_PORT).toBe(8080);
    expect(parsed.APP_PORT).toBe(3030);
    expect(parsed.CORS_ENABLED).toBe(false);
    expect(parsed.CORS_URL).toBe('https://example.com');
    expect(parsed.CLEAN_QUEUED_TIME).toBe(24);
    expect(parsed.CLEAN_FINALIZED_TIME).toBe(6);
    expect(parsed.CLEAN_BRIDGED_TIME).toBe(6);
    expect(parsed.SUPPORTED_CHAINS).toBe('arbitrumSepolia, baseSepolia, starknetTestnet ');
  });

  it('should fail for invalid HOST_PORT format', () => {
    const env = { ...MINIMAL_VALID_ENV, HOST_PORT: 'not-a-number' };
    expect(() => AppConfigSchema.parse(env)).toThrow(/Expected number, received nan/);
  });

  it('should fail for invalid APP_PORT format (negative integer)', () => {
    const env = { ...MINIMAL_VALID_ENV, APP_PORT: '-3000' };
    try {
      AppConfigSchema.parse(env);
      throw new Error('Should have thrown ZodError');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      if (e instanceof ZodError) {
        expect(e.issues[0].path).toEqual(['APP_PORT']);
        expect(e.issues[0].message).toBe('Number must be greater than 0');
      }
    }
  });

  it('should fail for invalid CORS_URL format', () => {
    const env = { ...MINIMAL_VALID_ENV, CORS_URL: 'not-a-valid-url' };
    expect(() => AppConfigSchema.parse(env)).toThrow(/CORS_URL must be a valid URL or '\*'/);
  });

  it('should pass if CORS_URL is a valid URL when CORS_ENABLED is true (default)', () => {
    const env = { ...MINIMAL_VALID_ENV, CORS_URL: 'http://valid.url' };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.CORS_URL).toBe('http://valid.url');
  });

  it("should accept '*' as a valid CORS_URL", () => {
    const env = { ...MINIMAL_VALID_ENV, CORS_URL: '*' };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.CORS_URL).toBe('*');
  });

  it('should pass if CORS_URL is undefined and CORS_ENABLED is true (default)', () => {
    const env = { ...MINIMAL_VALID_ENV };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.CORS_URL).toBeUndefined();
  });

  it('should pass if CORS_URL is undefined and CORS_ENABLED is false', () => {
    const env = { ...MINIMAL_VALID_ENV, CORS_ENABLED: 'false' };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.CORS_ENABLED).toBe(false);
    expect(parsed.CORS_URL).toBeUndefined();
  });

  it('should validate SUPPORTED_CHAINS with valid chains', () => {
    const env = {
      ...MINIMAL_VALID_ENV,
      SUPPORTED_CHAINS: 'arbitrumSepolia, baseSepolia, solanaDevnet',
    };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.SUPPORTED_CHAINS).toBe('arbitrumSepolia, baseSepolia, solanaDevnet');
  });

  it('should fail SUPPORTED_CHAINS with an invalid chain name', () => {
    const env = {
      ...MINIMAL_VALID_ENV,
      SUPPORTED_CHAINS: 'arbitrumSepolia, baseSepolia, invalidChain',
    };
    try {
      AppConfigSchema.parse(env);
      throw new Error('Should have thrown ZodError');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodError);
      if (e instanceof ZodError) {
        expect(e.issues[0].path).toEqual(['SUPPORTED_CHAINS']);
        expect(e.issues[0].message).toMatch(
          /^SUPPORTED_CHAINS must be a comma-separated list of valid chain names/,
        );
      }
    }
  });

  it('should pass SUPPORTED_CHAINS if it is an empty string (interpreted as no specific chains)', () => {
    const env = { ...MINIMAL_VALID_ENV, SUPPORTED_CHAINS: '' };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.SUPPORTED_CHAINS).toBe('');
  });

  it('should pass SUPPORTED_CHAINS if it only contains whitespace (interpreted as empty)', () => {
    const env = { ...MINIMAL_VALID_ENV, SUPPORTED_CHAINS: '   ' };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.SUPPORTED_CHAINS).toBe('   ');
  });

  it('should handle boolean coercion for VERBOSE_APP, API_ONLY_MODE, ENABLE_CLEANUP_CRON, CORS_ENABLED', () => {
    const env = {
      ...MINIMAL_VALID_ENV,
      VERBOSE_APP: 'TRUE',
      API_ONLY_MODE: 'false',
      ENABLE_CLEANUP_CRON: '1',
      CORS_ENABLED: '0',
    };
    const parsed = AppConfigSchema.parse(env);
    expect(parsed.VERBOSE_APP).toBe(true);
    expect(parsed.API_ONLY_MODE).toBe(false);
    expect(parsed.ENABLE_CLEANUP_CRON).toBe(true);
    expect(parsed.CORS_ENABLED).toBe(false);
  });
});

describe('appConfig Loading (via config/app.config.ts)', () => {
  it('should load successfully with minimal valid environment variables', () => {
    process.env = { ...MINIMAL_VALID_ENV };
    let config: AppConfig | undefined;
    expect(() => {
      config = loadAppConfig();
    }).not.toThrow();
    expect(config).toBeDefined();
    expect(config?.APP_NAME).toBe(MINIMAL_VALID_ENV.APP_NAME);
    expect(mockExit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should exit and log error if APP_NAME is missing', () => {
    process.env = { ...MINIMAL_VALID_ENV };
    delete process.env.APP_NAME;

    // The act of loading appConfig will trigger the error and exit
    const config = loadAppConfig();
    // Due to process.exit mock, config might still be populated with defaults before exit call
    // The key is to check that exit was called.

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Application configuration validation failed:',
      expect.objectContaining({
        /* ZodError structure */
      }),
    );
  });

  it('should exit and log error if DATABASE_URL is missing', () => {
    process.env = { ...MINIMAL_VALID_ENV };
    delete process.env.DATABASE_URL;
    loadAppConfig();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Application configuration validation failed:',
      expect.objectContaining({}),
    );
  });

  it('should exit and log error if APP_VERSION is missing', () => {
    process.env = { ...MINIMAL_VALID_ENV };
    delete process.env.APP_VERSION;
    loadAppConfig();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('should exit and log error for invalid HOST_PORT format', () => {
    process.env = { ...MINIMAL_VALID_ENV, HOST_PORT: 'not-a-number' };
    loadAppConfig();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('should exit and log error for invalid CORS_URL format', () => {
    process.env = { ...MINIMAL_VALID_ENV, CORS_URL: 'not-a-valid-url' };
    loadAppConfig();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('should exit and log error for invalid SUPPORTED_CHAINS', () => {
    process.env = { ...MINIMAL_VALID_ENV, SUPPORTED_CHAINS: 'invalidChainName' };
    loadAppConfig();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('should load successfully with all optional values provided correctly', () => {
    process.env = {
      ...MINIMAL_VALID_ENV,
      NODE_ENV: 'production',
      VERBOSE_APP: 'true',
      API_ONLY_MODE: 'true',
      ENABLE_CLEANUP_CRON: 'true',
      HOST_PORT: '8080',
      APP_PORT: '3030',
      CORS_ENABLED: 'true',
      CORS_URL: 'https://example.com',
      CLEAN_QUEUED_TIME: '24',
      CLEAN_FINALIZED_TIME: '6',
      CLEAN_BRIDGED_TIME: '6',
      SUPPORTED_CHAINS: 'arbitrumSepolia, baseSepolia, starknetTestnet',
    };
    let config: AppConfig | undefined;
    expect(() => {
      config = loadAppConfig();
    }).not.toThrow();
    expect(config).toBeDefined();
    expect(mockExit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(config?.HOST_PORT).toBe(8080);
    expect(config?.CORS_URL).toBe('https://example.com');
  });
});
