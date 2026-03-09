import { ethers } from 'ethers';

/**
 * Enum representing the possible states of a redemption process
 */
export enum RedemptionStatus {
  PENDING = 0,
  VAA_FETCHED = 1,
  VAA_FAILED = 2,
  SUBMITTED = 3,
  FAILED = 4,
  COMPLETED = 5,
}

export type BitcoinTxUtxo = {
  txHash: string; // bytes32
  txOutputIndex: number; // uint32
  txOutputValue: string; // stringified BigNumber
};

export type RedemptionRequestedEventData = {
  redeemerOutputScript: string;
  // Store amount as a serializable shape to survive JSON persistence,
  // then rehydrate to BigNumber at usage time.
  amount: ethers.BigNumber | { _hex: string } | string; // uint64
  l2TransactionHash: string; // bytes32
};

export type Redemption = {
  id: string; // Unique identifier, e.g., l2TransactionHash
  chainId: string;
  event: RedemptionRequestedEventData;
  serializedVaaBytes: Uint8Array | null; // The actual serialized VAA bytes from Wormhole SDK
  vaaStatus: RedemptionStatus;
  l1SubmissionTxHash: string | null;
  status: RedemptionStatus;
  error: string | null;
  dates: {
    createdAt: number;
    vaaFetchedAt: number | null;
    l1SubmittedAt: number | null;
    completedAt: number | null;
    lastActivityAt: number;
  };
  logs?: string[];
};
