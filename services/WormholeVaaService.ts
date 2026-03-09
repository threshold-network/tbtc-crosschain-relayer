import { ethers } from 'ethers';
import {
  wormhole,
  Wormhole,
  UniversalAddress,
  type Network,
  type ChainId,
  chainIdToChain,
  type WormholeMessageId,
  type Chain,
  type VAA,
  serialize,
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import logger, { logErrorContext } from '../utils/Logger.js';

type SignedVaa = Uint8Array;
type ParsedVaaWithPayload = VAA<'TokenBridge:Transfer'> | VAA<'TokenBridge:TransferWithPayload'>;

const DEFAULT_WORMHOLE_NETWORK: Network = 'Testnet';
const DEFAULT_SDK_PLATFORMS_MODULES = [evm, solana];
const MIN_VAA_CONSISTENCY_LEVEL = 1; // How long does the Guardian network need to wait before signing off on a VAA?
const VAA_FETCH_RETRY_DELAY_MS = parseInt(process.env.VAA_FETCH_RETRY_DELAY_MS || '60000');
const VAA_FETCH_MAX_RETRIES = parseInt(process.env.VAA_FETCH_MAX_RETRIES || '5');
const GET_VAA_TIMEOUT_MS =
  VAA_FETCH_MAX_RETRIES * VAA_FETCH_RETRY_DELAY_MS > 0
    ? VAA_FETCH_MAX_RETRIES * VAA_FETCH_RETRY_DELAY_MS
    : 60000;
const DEFAULT_TARGET_L1_CHAIN_ID: ChainId = 2; // Ethereum Mainnet

export class WormholeVaaService {
  private l2Provider: ethers.providers.JsonRpcProvider;
  private wh!: Wormhole<Network>;

  private constructor(l2Rpc: string) {
    this.l2Provider = new ethers.providers.JsonRpcProvider(l2Rpc);
  }

  public static async create(
    l2Rpc: string,
    network: Network = DEFAULT_WORMHOLE_NETWORK,
    platformModules: any[] = DEFAULT_SDK_PLATFORMS_MODULES,
  ): Promise<WormholeVaaService> {
    const service = new WormholeVaaService(l2Rpc);
    logger.info('Platform Modules:', platformModules);
    service.wh = await wormhole(network, platformModules);
    logger.info(`WormholeVaaService created. L2 RPC: ${l2Rpc}, Wormhole Network: ${network}`);
    return service;
  }

  /**
   * Fetches and verifies a VAA for a given L2 transaction hash.
   *
   * @param l2TransactionHash - The hash of the L2 transaction to fetch the VAA for.
   * @param emitterChainId - The ID of the L2 chain where the RedemptionRequestedOnL2 event occurred.
   * @param emitterAddress - The address of the emitter on the L2 chain.
   * @returns A tuple containing the VAA bytes and the parsed VAA object.
   */
  public async fetchAndVerifyVaaForL2Event(
    l2TransactionHash: string,
    emitterChainId: ChainId,
    emitterAddress: string,
    targetL1ChainId: ChainId = DEFAULT_TARGET_L1_CHAIN_ID,
  ): Promise<{ vaaBytes: SignedVaa; parsedVaa: ParsedVaaWithPayload } | null> {
    const emitterChainName = chainIdToChain(emitterChainId);
    logger.info(
      `Attempting to fetch VAA for L2 transaction: ${l2TransactionHash}, EmitterChain: ${emitterChainName}, EmitterAddr: ${emitterAddress}`,
    );

    try {
      const receipt = await this.l2Provider.getTransactionReceipt(l2TransactionHash);
      if (!receipt) {
        logErrorContext(
          `Failed to get L2 transaction receipt for ${l2TransactionHash}.`,
          new Error('L2 tx receipt fetch failed'),
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }
      if (receipt.status === 0) {
        logErrorContext(
          `L2 transaction ${l2TransactionHash} failed (reverted), cannot fetch VAA. Receipt: ${JSON.stringify(receipt)}`,
          new Error('L2 tx reverted'),
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      logger.info(
        `Successfully fetched L2 transaction receipt for ${l2TransactionHash}. TxHash for parse: ${receipt.transactionHash}`,
      );

      const chainContext = this.wh.getChain(emitterChainName);
      const wormholeMessageIds: WormholeMessageId[] = await chainContext.parseTransaction(
        receipt.transactionHash,
      );

      if (!wormholeMessageIds || wormholeMessageIds.length === 0) {
        logErrorContext(
          `No Wormhole messages found in L2 transaction ${l2TransactionHash}. Chain: ${emitterChainName}.`,
          new Error('parseTransaction returned no messages'),
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      const emitterUA = new UniversalAddress(emitterAddress);
      const messageId = wormholeMessageIds.find(
        (whm) => whm.emitter.equals(emitterUA) && whm.chain === emitterChainName,
      );

      if (!messageId) {
        logErrorContext(
          `Could not find Wormhole message from emitter ${emitterAddress} on chain ${emitterChainName} in L2 transaction ${l2TransactionHash}. Found messages: ${JSON.stringify(wormholeMessageIds)}`,
          new Error('Relevant WormholeMessageId not found'),
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      logger.info(
        `Successfully parsed Wormhole message ID: Chain: ${messageId.chain}, Emitter: ${messageId.emitter.toString()}, Sequence: ${messageId.sequence}.`,
      );

      // TODO: Which discriminator to use? Test it
      const discriminator = 'TokenBridge:TransferWithPayload';
      // const discriminator = "TokenBridge:Transfer";

      let fetchedParsedVaa: ParsedVaaWithPayload | null = null;
      try {
        const vaa = await this.wh.getVaa(messageId, discriminator, GET_VAA_TIMEOUT_MS);
        fetchedParsedVaa = vaa as ParsedVaaWithPayload;
      } catch (e: any) {
        logErrorContext(
          `Error fetching VAA using this.wh.getVaa with discriminator: ${discriminator}: ${e.message}`,
          e,
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      if (!fetchedParsedVaa) {
        logErrorContext(
          `this.wh.getVaa did not return a VAA for message ID ${JSON.stringify(messageId)} (tried TokenBridge discriminators)`,
          new Error('this.wh.getVaa failed or returned null VAA'),
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      if (!this.verifyParsedVaa(fetchedParsedVaa, emitterChainId, emitterAddress)) {
        logErrorContext(
          `Initial VAA verification (emitter check) failed for ${l2TransactionHash}.`,
          new Error('Initial VAA verification failed'),
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      const targetL1ChainName = chainIdToChain(targetL1ChainId);
      const l1ChainContext = this.wh.getChain(targetL1ChainName);

      try {
        const tokenBridge = await l1ChainContext.getTokenBridge();
        if (
          fetchedParsedVaa.payloadName === 'Transfer' ||
          fetchedParsedVaa.payloadName === 'TransferWithPayload'
        ) {
          const isCompleted = await tokenBridge.isTransferCompleted(fetchedParsedVaa);
          if (!isCompleted) {
            logErrorContext(
              `Token bridge transfer VAA not completed on L1 (${targetL1ChainName}) for ${l2TransactionHash}. VAA Seq: ${fetchedParsedVaa.sequence}, Type: ${fetchedParsedVaa.payloadName}`,
              new Error('VAA transfer not completed on L1'),
              { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
            );
            return null;
          }
          logger.info(
            `Token bridge transfer VAA confirmed completed on L1 (${targetL1ChainName}) for ${l2TransactionHash}. Type: ${fetchedParsedVaa.payloadName}`,
          );
        }
      } catch (e: any) {
        logErrorContext(
          `Error checking VAA completion on L1 (${targetL1ChainName}): ${e.message}`,
          e,
          { l2TxHash: l2TransactionHash, redemptionId: l2TransactionHash },
        );
        return null;
      }

      let signedVaaBytes: SignedVaa | null = null;
      if ('bytes' in fetchedParsedVaa && (fetchedParsedVaa as any).bytes instanceof Uint8Array) {
        signedVaaBytes = (fetchedParsedVaa as any).bytes;
      } else if (typeof (fetchedParsedVaa as any).serialize === 'function') {
        signedVaaBytes = (fetchedParsedVaa as any).serialize();
      }

      if (!signedVaaBytes || signedVaaBytes.length === 0) {
        logErrorContext(
          `Could not extract VAA bytes from fetched VAA object (tried .bytes and .serialize()). VAA: ${JSON.stringify(fetchedParsedVaa)}`,
          new Error('VAA bytes extraction failed'),
        );
        return null;
      }
      logger.info(
        `Successfully obtained VAA object and its bytes. VAA Length: ${signedVaaBytes.length}`,
      );

      logger.info(`VAA fetched and verified (including L1 completion) for ${l2TransactionHash}.`);
      return { vaaBytes: signedVaaBytes, parsedVaa: fetchedParsedVaa };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logErrorContext(
        `Error fetching and verifying VAA for L2 event ${l2TransactionHash}. EmitterChain: ${emitterChainName}, EmitterAddr: ${emitterAddress}. Error: ${err.message}`,
        err,
      );
      return null;
    }
  }

  private verifyParsedVaa(
    parsedVaa: VAA<any>,
    expectedEmitterChainId: ChainId,
    expectedEmitterAddress: string,
  ): boolean {
    const expectedEmitterChainName = chainIdToChain(expectedEmitterChainId);
    const actualEmitterChainName = parsedVaa.emitterChain as Chain;

    logger.info(
      `Attempting to verify parsed VAA. Expected Emitter: ${expectedEmitterChainName} / ${expectedEmitterAddress}. Actual Emitter: ${actualEmitterChainName} / ${parsedVaa.emitterAddress.toString()}`,
    );

    if (actualEmitterChainName !== expectedEmitterChainName) {
      logErrorContext(
        `VAA verification failed: Emitter chain mismatch. Expected: ${expectedEmitterChainName} (Id: ${expectedEmitterChainId}), Got: ${actualEmitterChainName} (SDK value: ${parsedVaa.emitterChain})`,
        new Error('VAA emitter chain mismatch'),
      );
      return false;
    }

    const expectedEmitterUA = new UniversalAddress(expectedEmitterAddress);
    if (!parsedVaa.emitterAddress.equals(expectedEmitterUA)) {
      logErrorContext(
        `VAA verification failed: Emitter address mismatch. Expected: ${expectedEmitterAddress} (Native: ${expectedEmitterUA.toNative(expectedEmitterChainName).toString()}), Got: ${parsedVaa.emitterAddress.toString()} (Native: ${parsedVaa.emitterAddress.toNative(actualEmitterChainName).toString()})`,
        new Error('VAA emitter address mismatch'),
      );
      return false;
    }

    if (parsedVaa.consistencyLevel === MIN_VAA_CONSISTENCY_LEVEL) {
      logger.warn(
        `VAA verification warning: Low consistency level. Expected ${MIN_VAA_CONSISTENCY_LEVEL}, Got: ${parsedVaa.consistencyLevel}. VAA details: emitter ${parsedVaa.emitterAddress.toString()}, seq ${parsedVaa.sequence}, chain ${actualEmitterChainName}.`,
      );
    }

    logger.info(
      `VAA verification passed for emitter: ${parsedVaa.emitterAddress.toString()}, chain: ${actualEmitterChainName}, sequence: ${parsedVaa.sequence}.`,
    );
    return true;
  }

  /**
   * Fetches and serializes a VAA for redemption requests, following the exact flow
   * from completeRedemptionRequest.ts
   *
   * @param l2TransactionHash - The hash of the L2 transaction containing the redemption request
   * @param l2ChainId - The Wormhole chain ID of the L2 chain
   * @param timeout - Timeout in milliseconds for VAA retrieval (default 15 minutes)
   * @returns The serialized VAA bytes and parsed VAA, or null if failed
   */
  public async fetchVaaForRedemption(
    l2TransactionHash: string,
    l2ChainId: ChainId,
    timeout: number = 900000, // 15 minutes default
  ): Promise<{
    serializedVaa: Uint8Array;
    parsedVaa: VAA<'TokenBridge:TransferWithPayload'>;
  } | null> {
    try {
      logger.info(`Parsing L2 transaction for redemption: ${l2TransactionHash}`);

      // Get the chain context for the L2 chain
      const l2ChainName = chainIdToChain(l2ChainId);
      const sourceChain = this.wh.getChain(l2ChainName);

      // Parse the transaction to get Wormhole messages
      const messages = await sourceChain.parseTransaction(l2TransactionHash);
      if (!messages || messages.length === 0) {
        logErrorContext(
          `No Wormhole messages found in transaction ${l2TransactionHash}`,
          new Error('No Wormhole messages in transaction'),
        );
        return null;
      }

      const whm = messages[0];
      logger.info(`Wormhole message found for redemption:`, {
        chain: whm.chain,
        emitter: whm.emitter.toString(),
        sequence: whm.sequence.toString(),
      });

      // Wait for VAA with the specific discriminator for redemptions
      logger.info(`Waiting for VAA to be signed (timeout: ${timeout}ms)...`);
      const vaa = await this.wh.getVaa(whm, 'TokenBridge:TransferWithPayload', timeout);

      if (!vaa) {
        logErrorContext(
          `Failed to obtain VAA for redemption after timeout`,
          new Error('VAA timeout'),
        );
        return null;
      }

      logger.info('VAA obtained successfully for redemption!', {
        emitterChain: vaa.emitterChain,
        sequence: vaa.sequence.toString(),
        tokenAmount: vaa.payload.token.amount.toString(),
        payloadLength: vaa.payload.payload.length,
      });

      // Serialize the VAA
      const serializedVaa = serialize(vaa);
      logger.info(`VAA serialized for redemption, length: ${serializedVaa.length} bytes`);

      return { serializedVaa, parsedVaa: vaa };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logErrorContext(
        `Error fetching VAA for redemption from transaction ${l2TransactionHash}`,
        err,
      );
      return null;
    }
  }
}
