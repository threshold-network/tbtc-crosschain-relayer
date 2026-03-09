import logger from './Logger.js';

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

export function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value !== undefined) {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    // Value is present but not a valid boolean string
    if (defaultValue !== undefined) {
      logger.warn(
        `Invalid boolean value "${value}" for environment variable ${key}. Using default: ${defaultValue}.`,
      );
      return defaultValue;
    }
    throw new Error(
      `Invalid boolean value "${value}" for required environment variable ${key}. Must be 'true' or 'false'.`,
    );
  }
  // Value is not present in env
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

export function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value !== undefined) {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      return num;
    }
    // Value is present but not a valid number string
    if (defaultValue !== undefined) {
      logger.warn(
        `Invalid number value "${value}" for environment variable ${key}. Using default: ${defaultValue}.`,
      );
      return defaultValue;
    }
    throw new Error(`Invalid number value "${value}" for required environment variable ${key}.`);
  }
  // Value is not present in env
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}
