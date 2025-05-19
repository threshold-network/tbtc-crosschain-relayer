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
  walletPubKeyHash: string; // bytes20
  mainUtxo: BitcoinTxUtxo;
  redeemerOutputScript: string;
  amount: ethers.BigNumber; // uint64
  l2TransactionHash: string; // bytes32
};

export type Redemption = {
  id: string; // Unique identifier, e.g., l2TransactionHash
  event: RedemptionRequestedEventData;
  vaaBytes: string | null; // Hex string or base64
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
