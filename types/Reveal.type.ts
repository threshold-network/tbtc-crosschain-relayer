export type Reveal = {
  fundingOutputIndex: number;
  blindingFactor: string;
  walletPubKeyHash: string;
  refundPubKeyHash: string;
  refundLocktime: string;
  vault: string; // Assuming vault is a string, adjust if it's a different type
};
