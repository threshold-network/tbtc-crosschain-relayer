import { ethers, Wallet, providers } from 'ethers';
import { TBTC, DestinationChainName } from '@keep-network/tbtc-v2.ts';
import type { BigNumber } from 'ethers';
import logger, { logErrorContext } from '../utils/Logger.js';
import { NETWORK } from '../config/schemas/common.schema.js';
import { L1RedemptionHandlerInterface } from '../interfaces/L1RedemptionHandler.interface.js';
import { EvmChainConfig } from '../config/schemas/evm.chain.schema.js';

const destinationChainName: Record<string, DestinationChainName> = {
  ArbitrumMainnet: 'Arbitrum',
  ArbitrumSepolia: 'Arbitrum',
  BaseMainnet: 'Base',
  BaseSepolia: 'Base',
};

const L1_TX_CONFIRMATION_TIMEOUT_MS = parseInt(
  process.env.L1_TX_CONFIRMATION_TIMEOUT_MS || '300000',
);
const DEFAULT_L1_CONFIRMATIONS = 1; // Default number of confirmations to wait for

export class L1RedemptionHandler implements L1RedemptionHandlerInterface {
  private l1Signer: Wallet;
  private sdk: TBTC;
  public config: EvmChainConfig;

  constructor(config: EvmChainConfig) {
    this.config = config;
    logger.debug(`Constructing L1RedemptionHandler for ${this.config.chainName}`);
  }

  public async initialize(): Promise<void> {
    logger.debug(`Initializing L1RedemptionHandler for ${this.config.chainName}`);
    // --- L1 Setup ---
    // Common L1 configuration checks
    if (!this.config.l1Rpc || !this.config.network || !this.config.privateKey) {
      throw new Error(
        `Missing required L1 RPC/Contract/Vault/Network configuration for ${this.config.chainName}`,
      );
    }
    const provider = new providers.JsonRpcProvider(this.config.l1Rpc);
    this.l1Signer = new Wallet(this.config.privateKey, provider);

    if (this.config.network === NETWORK.TESTNET) {
      // On an Ethereum testnet, we connect to the Bitcoin testnet
      this.sdk = await TBTC.initializeSepolia(this.l1Signer as any, true);
    } else {
      // On Ethereum mainnet, we connect to the Bitcoin mainnet
      this.sdk = await TBTC.initializeMainnet(this.l1Signer as any, true);
    }

    logger.info(
      `L1RedemptionHandler created for L1 at ${this.config.l1Rpc}. Relayer L1 address: ${this.l1Signer.address}`,
    );

    try {
      const l2Provider = new providers.JsonRpcProvider(this.config.l2Rpc);
      // Use the same private key for L2 as for L1, assuming it's the same relayer identity
      const l2Signer = new Wallet(this.config.privateKey, l2Provider);
      await this.sdk.initializeCrossChain(
        destinationChainName[this.config.chainName as keyof typeof destinationChainName],
        l2Signer as any,
      );
      logger.info(
        `Initialized cross-chain support for ${this.config.chainName} in L1RedemptionHandler`,
      );
    } catch (error) {
      logErrorContext(
        `Failed to initialize cross-chain support for ${this.config.chainName} in L1RedemptionHandler`,
        error,
      );
    }
  }

  public async relayRedemptionToL1(
    amount: BigNumber,
    signedVaa: Uint8Array,
    l2ChainName: string,
    l2TransactionHash: string,
  ): Promise<string | null> {
    logger.info(
      JSON.stringify({
        message: 'Attempting to relay L2 redemption to L1 using tBTC SDK',
        l2TransactionHash: l2TransactionHash,
        relayerAddress: this.l1Signer.address,
        amount: amount.toString(),
        l2ChainName: l2ChainName,
      }),
    );

    try {
      const redemptionsAny: any = this.sdk.redemptions as any;
      const result = await redemptionsAny.relayRedemptionRequestToL1(
        amount,
        signedVaa,
        destinationChainName[this.config.chainName as keyof typeof destinationChainName],
      );

      // Normalize tx hash to 0x-prefixed string
      let l1TxHashStr: string;
      const rawTxHash: any = result?.targetChainTxHash;
      if (rawTxHash && typeof rawTxHash.toPrefixedString === 'function') {
        l1TxHashStr = rawTxHash.toPrefixedString();
      } else if (rawTxHash && typeof rawTxHash.toString === 'function') {
        const s = rawTxHash.toString();
        l1TxHashStr = s.startsWith('0x') ? s : `0x${s}`;
      } else {
        const s = String(rawTxHash ?? '');
        l1TxHashStr = s.startsWith('0x') ? s : `0x${s}`;
      }

      logger.info(
        JSON.stringify({
          message: 'L1 Redemption relay transaction submitted, awaiting confirmation...',
          l1TransactionHash: l1TxHashStr,
          l2TransactionHash: l2TransactionHash,
        }),
      );

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout waiting for L1 transaction ${result.targetChainTxHash.toString()} confirmation after ${L1_TX_CONFIRMATION_TIMEOUT_MS}ms`,
              ),
            ),
          L1_TX_CONFIRMATION_TIMEOUT_MS,
        ),
      );

      const receipt = (await Promise.race([
        this.l1Signer.provider.waitForTransaction(l1TxHashStr, DEFAULT_L1_CONFIRMATIONS),
        timeoutPromise,
      ])) as ethers.providers.TransactionReceipt;

      if (receipt && receipt.status === 1) {
        logger.info(
          JSON.stringify({
            message: 'L1 redemption relay transaction successful!',
            l1TransactionHash: l1TxHashStr,
            l2TransactionHash: l2TransactionHash,
            l1BlockNumber: receipt.blockNumber,
          }),
        );
        return l1TxHashStr;
      } else {
        logErrorContext(
          JSON.stringify({
            message: 'L1 redemption relay transaction failed (reverted on-chain).',
            l1TransactionHash: l1TxHashStr,
            l2TransactionHash: l2TransactionHash,
            receiptStatus: receipt?.status,
            receipt,
          }),
          new Error(`L1 tx ${l1TxHashStr} reverted`),
        );
        return null;
      }
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      logErrorContext(
        JSON.stringify({
          message: 'Error in relayRedemptionToL1.',
          l2TransactionHash,
          errorName: err.name,
          errorMessage: err.message,
          errorStack: err.stack,
          errorDetails: error.error,
          transaction: error.transaction,
          receipt: error.receipt,
        }),
        err,
      );
      // Common issues from example script
      if (err.message.includes('VAA was already executed')) {
        logger.error('This VAA has already been redeemed.');
      } else if (err.message.includes('insufficient funds')) {
        logger.error('Insufficient funds for gas on L1.');
      }
      return null;
    }
  }
}
