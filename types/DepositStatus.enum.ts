/**
 * Enum representing the possible states of a deposit in the L1BitcoinDepositor contract
 */
export enum DepositStatus {
  QUEUED = 0,
  INITIALIZED = 1,
  FINALIZED = 2,
  AWAITING_WORMHOLE_VAA = 3,
  BRIDGED = 4,
}
