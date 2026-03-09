import { getEnv, getEnvBoolean, getEnvNumber } from '../../../utils/Env';
import logger from '../../../utils/Logger';

// Mock the logger
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
}));

// Mock process.env
let originalProcessEnv: NodeJS.ProcessEnv;

beforeAll(() => {
  originalProcessEnv = { ...process.env };
});

afterAll(() => {
  process.env = originalProcessEnv;
});

beforeEach(() => {
  // Reset process.env for each test
  process.env = {};
  // Clear mock calls for logger.warn before each test that might use it
  if (jest.isMockFunction(logger.warn)) {
    (logger.warn as jest.Mock).mockClear();
  }
});

describe('getEnv', () => {
  it('should return the value of an existing environment variable', () => {
    process.env.TEST_VAR = 'test_value';
    expect(getEnv('TEST_VAR')).toBe('test_value');
  });

  it('should return the default value if the environment variable does not exist', () => {
    expect(getEnv('MISSING_VAR', 'default_value')).toBe('default_value');
  });

  it('should throw an error if the environment variable does not exist and no default value is provided', () => {
    expect(() => getEnv('MISSING_VAR_NO_DEFAULT')).toThrow(
      'Missing required environment variable: MISSING_VAR_NO_DEFAULT',
    );
  });

  it('should return an empty string if the environment variable is set to an empty string', () => {
    process.env.EMPTY_VAR = '';
    expect(getEnv('EMPTY_VAR')).toBe('');
  });

  it('should return an empty string as default value if provided', () => {
    expect(getEnv('MISSING_VAR_EMPTY_DEFAULT', '')).toBe('');
  });
});

describe('getEnvBoolean', () => {
  // No need for beforeEach to clear process.env here, top-level one handles it

  it('should return true for "true" (lowercase)', () => {
    process.env.BOOL_TRUE = 'true';
    expect(getEnvBoolean('BOOL_TRUE')).toBe(true);
  });

  it('should return true for "TRUE" (uppercase)', () => {
    process.env.BOOL_CAPS_TRUE = 'TRUE';
    expect(getEnvBoolean('BOOL_CAPS_TRUE')).toBe(true);
  });

  it('should return false for "false" (lowercase)', () => {
    process.env.BOOL_FALSE = 'false';
    expect(getEnvBoolean('BOOL_FALSE')).toBe(false);
  });

  it('should return false for "FALSE" (uppercase)', () => {
    process.env.BOOL_CAPS_FALSE = 'FALSE';
    expect(getEnvBoolean('BOOL_CAPS_FALSE')).toBe(false);
  });

  it('should return default value if env var is missing', () => {
    expect(getEnvBoolean('MISSING_BOOL', true)).toBe(true);
    expect(getEnvBoolean('MISSING_BOOL_FALSE', false)).toBe(false);
  });

  it('should throw error if env var is missing and no default value', () => {
    expect(() => getEnvBoolean('MISSING_BOOL_NO_DEFAULT')).toThrow(
      'Missing required environment variable: MISSING_BOOL_NO_DEFAULT',
    );
  });

  it('should return default value and log warning for invalid boolean string', () => {
    process.env.INVALID_BOOL = 'not_a_boolean';
    expect(getEnvBoolean('INVALID_BOOL', true)).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid boolean value "not_a_boolean" for environment variable INVALID_BOOL. Using default: true.',
    );
  });

  it('should throw error for invalid boolean string if no default value', () => {
    process.env.INVALID_BOOL_NO_DEFAULT = 'not_a_boolean';
    expect(() => getEnvBoolean('INVALID_BOOL_NO_DEFAULT')).toThrow(
      "Invalid boolean value \"not_a_boolean\" for required environment variable INVALID_BOOL_NO_DEFAULT. Must be 'true' or 'false'.",
    );
  });
});

describe('getEnvNumber', () => {
  // No need for beforeEach to clear process.env here, top-level one handles it

  it('should return the parsed number for a valid number string', () => {
    process.env.NUM_VAR = '123';
    expect(getEnvNumber('NUM_VAR')).toBe(123);
  });

  it('should return zero for "0"', () => {
    process.env.ZERO_VAR = '0';
    expect(getEnvNumber('ZERO_VAR')).toBe(0);
  });

  it('should return a negative number for a valid negative number string', () => {
    process.env.NEG_NUM_VAR = '-45';
    expect(getEnvNumber('NEG_NUM_VAR')).toBe(-45);
  });

  it('should return default value if env var is missing', () => {
    expect(getEnvNumber('MISSING_NUM', 999)).toBe(999);
  });

  it('should throw error if env var is missing and no default value', () => {
    expect(() => getEnvNumber('MISSING_NUM_NO_DEFAULT')).toThrow(
      'Missing required environment variable: MISSING_NUM_NO_DEFAULT',
    );
  });

  it('should return default value and log warning for an invalid number string', () => {
    process.env.INVALID_NUM = 'not_a_number';
    expect(getEnvNumber('INVALID_NUM', 777)).toBe(777);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid number value "not_a_number" for environment variable INVALID_NUM. Using default: 777.',
    );
  });

  it('should throw error for an invalid number string if no default value', () => {
    process.env.INVALID_NUM_NO_DEFAULT = 'not_a_number';
    expect(() => getEnvNumber('INVALID_NUM_NO_DEFAULT')).toThrow(
      'Invalid number value "not_a_number" for required environment variable INVALID_NUM_NO_DEFAULT.',
    );
  });
});
