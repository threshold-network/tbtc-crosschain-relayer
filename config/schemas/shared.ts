import { z } from 'zod';

export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

export type EthereumAddress = z.infer<typeof EthereumAddressSchema>;

// Sui Object ID validation schema - validates standard Sui object format
export const SuiObjectIdSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid Sui object ID: must be 0x followed by 64 hex characters');

export type SuiObjectId = z.infer<typeof SuiObjectIdSchema>;

// Sui Type validation schema - validates Sui type format like "package::module::Type"
export const SuiTypeSchema = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{64}::[a-zA-Z_][a-zA-Z0-9_]*::[a-zA-Z_][a-zA-Z0-9_]*$/,
    'Invalid Sui type format: must be "0x{package_id}::{module_name}::{type_name}"',
  );

export type SuiType = z.infer<typeof SuiTypeSchema>;
