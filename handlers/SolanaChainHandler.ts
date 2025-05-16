import {
  Connection,
  Keypair,
} from '@solana/web3.js';
import { deserialize, serialize, signSendWait, Wormhole } from "@wormhole-foundation/sdk";
import { getSolanaSignAndSendSigner } from '@wormhole-foundation/sdk-solana';
import type {
  Chain,
  ChainContext,
  TBTCBridge,
} from '@wormhole-foundation/sdk-connect';
import { ethers } from 'ethers'; // For reading the 'transferSequence' from event logs
import {
  AnchorProvider,
  Idl,
  Program,
  setProvider,
  Wallet,
} from '@coral-xyz/anchor';

import { ChainConfig, CHAIN_TYPE, CHAIN_NAME } from '../types/ChainConfig.type';
import { LogMessage, LogWarning, LogError } from '../utils/Logs';
import { BaseChainHandler } from './BaseChainHandler';
import { Deposit } from '../types/Deposit.type';
import { DepositStatus } from '../types/DepositStatus.enum';
import wormholeGatewayIdl from '../target/idl/wormhole_gateway.json';
import { updateToAwaitingWormholeVAA, updateToBridgedDeposit } from '../utils/Deposits';
import { getAllJsonOperationsByStatus } from '../utils/JsonUtils';
import { WORMHOLE_GATEWAY_PROGRAM_ID } from '../utils/Constants';
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const TOKENS_TRANSFERRED_SIG = ethers.utils.id(
  'TokensTransferredWithPayload(uint256,bytes32,uint64)'
);
export class SolanaChainHandler extends BaseChainHandler {
  private connection?: Connection;
  private provider?: AnchorProvider;
  private wormholeGatewayProgram?: Program<Idl>;
  private wallet: Wallet;
  private ethereumWormholeContext: ChainContext<"Mainnet" | "Testnet" | "Devnet", Chain>;

  constructor(config: ChainConfig) {
    super(config);
    LogMessage(`Constructing SolanaChainHandler for ${this.config.chainName}`);
    if (config.chainType !== CHAIN_TYPE.SOLANA) {
      throw new Error(
        `Incorrect chain type ${config.chainType} provided to SolanaChainHandler.`
      );
    }
  }

  /**
   * Called by `initializeChain()` in Core.ts
   * Sets up Solana connection, Anchor provider, and loads your Wormhole Gateway program.
   */
  protected async initializeL2(): Promise<void> {
    LogMessage(`Initializing Solana L2 components for ${this.config.chainName}`);

    if (!this.config.l2Rpc) {
      LogWarning(
        `Solana L2 RPC not configured for ${this.config.chainName}. L2 features disabled.`
      );
      return;
    }

    try {
      this.connection = new Connection(this.config.l2Rpc, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
        wsEndpoint: this.config.l2WsRpc, // TODO: Populate this with the correct WebSocket URL from Alchemy
      });

      const secretKeyBase64 = this.config.solanaSignerKeyBase;
      if (!secretKeyBase64) throw new Error('Missing solanaSignerKeyBase');

      const secretKeyBytes = new Uint8Array(secretKeyBase64.split(',').map(Number));
      const keypair = Keypair.fromSecretKey(secretKeyBytes);
      const wallet = new Wallet(keypair);
      this.wallet = wallet;

      this.provider = new AnchorProvider(
        this.connection,
        wallet,
        {}
      );

      setProvider(this.provider);

      this.wormholeGatewayProgram = new Program<Idl>(
        wormholeGatewayIdl as unknown as Idl,
        WORMHOLE_GATEWAY_PROGRAM_ID,
        this.provider
      );

      LogMessage(
        `Solana L2/Anchor provider and Wormhole Gateway program loaded for ${this.config.chainName}`
      );

      this.ethereumWormholeContext = this.wormhole.getChain(CHAIN_NAME.ETHEREUM as Chain);
    } catch (error: any) {
      LogError(`Error initializing Solana L2 for ${this.config.chainName}`, error);
      throw error;
    }
  }

  /**
   * Called by `setupListeners()` in BaseChainHandler (if !useEndpoint).
   * If you plan to do L2 event listening, implement it here.
   */
  protected async setupL2Listeners(): Promise<void> {
    if (this.config.useEndpoint) {
      LogMessage(
        `Solana L2 Listeners skipped for ${this.config.chainName} (using Endpoint).`
      );
      return;
    }
    LogWarning(
      `Solana L2 Listener setup NOT YET IMPLEMENTED for ${this.config.chainName}.`
    );
  }

  /**
   * Get the latest Solana slot (block) if you need to do on-chain queries for missed deposits.
   */
  async getLatestBlock(): Promise<number> {
    if (this.config.useEndpoint) return 0; // Skip if using endpoint mode
    if (!this.connection) {
      LogWarning(`No Solana connection established. Returning 0.`);
      return 0;
    }
    try {
      return await this.connection.getSlot('confirmed');
    } catch (error: any) {
      LogError('Error getting latest Solana slot', error);
      return 0;
    }
  }

  /**
   * Example "checkForPastDeposits" if you wanted to scan logs or transactions on Solana.
   * Not yet implemented in this skeleton.
   */
  async checkForPastDeposits(options: {
    pastTimeInMinutes: number;
    latestBlock: number;
  }): Promise<void> {
    if (this.config.useEndpoint) return; // no direct chain scanning
    LogWarning(
      `Solana checkForPastDeposits NOT YET IMPLEMENTED for ${this.config.chainName}.`
    );
  }

  /**
   * Override finalizeDeposit to:
   *  1) finalize on L1 (super call)
   *  2) parse Wormhole transferSequence from logs
   *  3) update deposit to AWAITING_WORMHOLE_VAA
   */
  async finalizeDeposit(deposit: Deposit): Promise<void> {
    const finalizedDeposit = await super.finalizeDeposit(deposit);
  
    if (!finalizedDeposit?.receipt) {
      return;
    }
    LogMessage(`Finalizing deposit ${deposit.id} on Solana...`);
  
    const l1Receipt = finalizedDeposit.receipt;
    if (!l1Receipt) {
      LogWarning(
        `No finalize receipt found for deposit ${deposit.id}; cannot parse logs.`
      );
      return;
    }
    
    let transferSequence: string | null = null;
    try {
      const logs = l1Receipt.logs || [];
  
      for (const log of logs) {
        if (log.topics[0] === TOKENS_TRANSFERRED_SIG) {
          const parsedLog = this.l1BitcoinDepositor.interface.parseLog(log);
          const { transferSequence: seq } = parsedLog.args;
          transferSequence = seq.toString();
          break;
        }
      }
    } catch (error: any) {
      LogError(`Error parsing L1 logs for deposit ${deposit.id}`, error);
    }
  
    if (!transferSequence) {
      LogWarning(
        `Could not find transferSequence in logs for deposit ${deposit.id}.`
      );
      return;
    }

    await updateToAwaitingWormholeVAA(l1Receipt.transactionHash, deposit, transferSequence);
    LogMessage(`Deposit ${deposit.id} now awaiting Wormhole VAA.`);
  }

  public async bridgeSolanaDeposit(deposit: Deposit): Promise<void> {
    if (!this.connection || !this.provider || !this.wallet) {
      // Solana connection not initialized
      LogWarning(`Solana connection not initialized. Cannot bridge deposit ${deposit.id}.`);
      return;
    }

    if (!this.wormholeGatewayProgram) {
      LogWarning(`Wormhole Gateway program not initialized. Cannot bridge deposit ${deposit.id}.`);
      return;
    }

    if (deposit.status !== DepositStatus.AWAITING_WORMHOLE_VAA) return;

    const secretKeyBase64 = this.config.solanaSignerKeyBase;
    if (!secretKeyBase64) throw new Error('Missing solanaSignerKeyBase');

    const signerSecretKeyBytes = new Uint8Array(secretKeyBase64.split(',').map(Number));
    const signerKeypair = Keypair.fromSecretKey(signerSecretKeyBytes);
    const signerSecretKeyBase58 = bs58.encode(signerKeypair.secretKey);
    const wormholeSolanaSigner = await getSolanaSignAndSendSigner(
      this.connection,
      signerSecretKeyBase58,
      {
        debug: true,
        priorityFee: {
          percentile: 0.5,
          percentileMultiple: 2,
          min: 1,
          max: 1000,
        },
        retries: 3,
        sendOpts: {
          skipPreflight: true,
        },
      }
    );
    const sender = Wormhole.parseAddress(wormholeSolanaSigner.chain(), wormholeSolanaSigner.address());

    const toChain = this.wormhole.getChain(CHAIN_NAME.SOLANA as Chain);

    LogMessage(`Bridging deposit ${deposit.id} on Solana...`);
  
    const [ wormholeMessageId ] = await this.ethereumWormholeContext.parseTransaction(deposit.wormholeInfo.txHash!);

    if (!wormholeMessageId) {
      LogWarning(`No Wormhole message found for deposit ${deposit.id}`);
      return;
    }
  
    try {
      LogMessage(`Attempting to fetch VAA for deposit ${deposit.id}`);
      const vaa = await this.wormhole.getVaa(
        wormholeMessageId,
        "TBTCBridge:GatewayTransfer",
        60_000,
      ) as TBTCBridge.VAA
      
      if (!vaa) {
        LogWarning(`VAA message is not yet signed by the guardians`);
        return;
      }

      // If no error thrown, we have the VAA.
      LogMessage(`VAA found for deposit ${deposit.id}. Posting VAA to Solana...`);

      let unsignedTransactions;
      if (vaa.payloadLiteral === "TBTCBridge:GatewayTransfer") {
        const bridge = await toChain.getTBTCBridge();

        unsignedTransactions = bridge.redeem(sender, vaa);
      } else {
        const tokenBridge = await toChain.getTokenBridge();

        // This is really a TokenBridge:Transfer VAA
        const serialized = serialize(vaa);
        const tbVaa = deserialize("TokenBridge:Transfer", serialized);
        unsignedTransactions = tokenBridge.redeem(sender, tbVaa);
      }

      const destinationTransactionIds = await signSendWait(toChain, unsignedTransactions, wormholeSolanaSigner);
      LogMessage(`Solana bridging success for deposit ${deposit.id}, txids=${destinationTransactionIds}`);

      updateToBridgedDeposit(deposit, destinationTransactionIds[1].txid);
    } catch (error: any) {
      // Either the VAA isn't available yet, or some other bridging error occurred
      const reason = error.message || 'Unknown bridging error';
      LogWarning(`Wormhole bridging not ready for deposit ${deposit.id}: ${reason}`);
    }
  }

  /**
   * Process all deposits that are in the AWAITING_WORMHOLE_VAA status.
   * This function will attempt to bridge the deposits using the Wormhole protocol.
   */
  public async processWormholeBridging() {
    const bridgingDeposits = await getAllJsonOperationsByStatus(
      DepositStatus.AWAITING_WORMHOLE_VAA
    );
    if (bridgingDeposits.length === 0) return;

    for (const deposit of bridgingDeposits) {
      if (!deposit.wormholeInfo || !deposit.wormholeInfo.transferSequence) {
        LogWarning(
          `Deposit ${deposit.id} is missing transferSequence. Skipping.`
        );
        continue;
      }
      await this.bridgeSolanaDeposit(deposit);
    }
  }
}
