import { z } from 'zod';

const hexString = (length: number) =>
  z.string().regex(new RegExp(`^0x[0-9a-fA-F]{${length}}$`), {
    message: `Must be a valid hex string with a 0x prefix and ${length} characters`,
  });

// TODO: Add request validation to other endpoints
export const RevealRequestSchema = z.object({
  fundingTx: z.object({
    version: z.string(),
    inputVector: z.string(),
    outputVector: z.string(),
    locktime: z.string(),
  }),
  reveal: z.object({
    fundingOutputIndex: z.number().int().nonnegative(),
    blindingFactor: hexString(16),
    walletPubKeyHash: hexString(40),
    refundPubKeyHash: hexString(40),
    refundLocktime: hexString(8),
    vault: hexString(40),
  }),
  l2DepositOwner: z.string(),
  l2Sender: z.string(),
});

/**
 * Schema for gasless deposit notification from backend.
 * Backend has already initialized the deposit on L1 and notifies the relayer
 * to track the deposit for finalization.
 *
 * This is used in the gasless flow where:
 * 1. Backend initializes deposit on L1
 * 2. Backend notifies relayer via POST /api/:chainName/deposit/notify
 * 3. Relayer verifies on-chain and creates deposit record
 * 4. Relayer finalizes deposit when ready
 */
export const DepositNotificationSchema = z.object({
  depositKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/, {
    message: 'depositKey must be a 32-byte hex string with 0x prefix',
  }),
  fundingTx: z.object({
    version: z.string(),
    inputVector: z.string(),
    outputVector: z.string(),
    locktime: z.string(),
  }),
  reveal: z.object({
    fundingOutputIndex: z.number().int().nonnegative(),
    blindingFactor: hexString(16),
    walletPubKeyHash: hexString(40),
    refundPubKeyHash: hexString(40),
    refundLocktime: hexString(8),
    vault: hexString(40),
  }),
  destinationChainDepositOwner: z.string().regex(/^0x[0-9a-fA-F]{40}$|^0x[0-9a-fA-F]{64}$/, {
    message:
      'destinationChainDepositOwner must be a 20-byte address (0x + 40 hex) or 32-byte hex (0x + 64 hex)',
  }),
  initTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, {
    message: 'initTxHash must be a transaction hash with 0x prefix',
  }),
  backendAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, {
    message: 'backendAddress must be a valid Ethereum address (0x + 40 hex characters)',
  }),
});
