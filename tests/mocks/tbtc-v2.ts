export type DestinationChainName = 'Arbitrum' | 'Base';

class RedemptionsMock {
  async relayRedemptionRequestToL1() {
    return { targetChainTxHash: { toString: () => '0xmockedtxhash' } } as any;
  }
}

export class TBTC {
  static async initializeSepolia() {
    const instance = new TBTC();
    return instance as any;
  }
  static async initializeMainnet() {
    const instance = new TBTC();
    return instance as any;
  }
  redemptions = new RedemptionsMock() as any;
  async initializeCrossChain(_dest: DestinationChainName, _signer: any) {
    return;
  }
}


