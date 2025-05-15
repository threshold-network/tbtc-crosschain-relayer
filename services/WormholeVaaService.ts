import { ethers } from 'ethers';
import {
    wormhole,
    Wormhole,
    UniversalAddress,
    type Network,
    ChainId,
    chainIdToChain,
    WormholeMessageId,
    type Chain,
    type VAA,
} from '@wormhole-foundation/sdk';

import evmPlatform from "@wormhole-foundation/sdk/platforms/evm";
import solanaPlatform from "@wormhole-foundation/sdk/platforms/solana";

import { LogMessage, LogError } from '../utils/Logs';

type SignedVaa = Uint8Array;
type ParsedVaaWithPayload = VAA<"TokenBridge:Transfer"> | VAA<"TokenBridge:TransferWithPayload">;

const DEFAULT_WORMHOLE_NETWORK: Network = 'Testnet';
const DEFAULT_SDK_PLATFORMS_MODULES = [evmPlatform, solanaPlatform];
const MIN_VAA_CONSISTENCY_LEVEL = 1; // How long does the Guardian network need to wait before signing off on a VAA?
const VAA_FETCH_RETRY_DELAY_MS = parseInt(process.env.VAA_FETCH_RETRY_DELAY_MS || '60000');
const VAA_FETCH_MAX_RETRIES = parseInt(process.env.VAA_FETCH_MAX_RETRIES || '5');
const GET_VAA_TIMEOUT_MS = VAA_FETCH_MAX_RETRIES * VAA_FETCH_RETRY_DELAY_MS > 0 ? VAA_FETCH_MAX_RETRIES * VAA_FETCH_RETRY_DELAY_MS : 60000;
const DEFAULT_TARGET_L1_CHAIN_ID: ChainId = 2; // Ethereum Mainnet


export class WormholeVaaService {
    private l2Provider: ethers.providers.JsonRpcProvider;
    private wh!: Wormhole<Network>;

    private constructor(
        l2Rpc: string,
    ) {
        this.l2Provider = new ethers.providers.JsonRpcProvider(l2Rpc);
    }

    public static async create(
        l2Rpc: string,
        network: Network = DEFAULT_WORMHOLE_NETWORK,
        platformModules: any[] = DEFAULT_SDK_PLATFORMS_MODULES,
    ): Promise<WormholeVaaService> {
        const service = new WormholeVaaService(l2Rpc);
        service.wh = await wormhole(network, platformModules);
        LogMessage(`WormholeVaaService created. L2 RPC: ${l2Rpc}, Wormhole Network: ${network}`);
        return service;
    }

    /**
     * Fetches and verifies a VAA for a given L2 transaction hash.
     * 
     * @param l2TransactionHash - The hash of the L2 transaction to fetch the VAA for.
     * @param emitterChainId - The ID of the L2 chain where the RedemptionRequested event occurred.
     * @param emitterAddress - The address of the emitter on the L2 chain.
     * @returns A tuple containing the VAA bytes and the parsed VAA object.
     */
    public async fetchAndVerifyVaaForL2Event(
        l2TransactionHash: string,
        emitterChainId: ChainId,
        emitterAddress: string,
        targetL1ChainId: ChainId = DEFAULT_TARGET_L1_CHAIN_ID
    ): Promise<{ vaaBytes: SignedVaa; parsedVaa: ParsedVaaWithPayload } | null> {
        const emitterChainName = chainIdToChain(emitterChainId);
        LogMessage(
            `Attempting to fetch VAA for L2 transaction: ${l2TransactionHash}, EmitterChain: ${emitterChainName}, EmitterAddr: ${emitterAddress}`
        );

        try {
            const receipt = await this.l2Provider.getTransactionReceipt(l2TransactionHash);
            if (!receipt) {
                LogError(`Failed to get L2 transaction receipt for ${l2TransactionHash}.`, new Error('L2 tx receipt fetch failed'));
                return null;
            }
            if (receipt.status === 0) {
                LogError(`L2 transaction ${l2TransactionHash} failed (reverted), cannot fetch VAA. Receipt: ${JSON.stringify(receipt)}`, new Error('L2 tx reverted'));
                return null;
            }

            LogMessage(`Successfully fetched L2 transaction receipt for ${l2TransactionHash}. TxHash for parse: ${receipt.transactionHash}`);

            const chainContext = this.wh.getChain(emitterChainName);
            const wormholeMessageIds: WormholeMessageId[] = await chainContext.parseTransaction(receipt.transactionHash);

            if (!wormholeMessageIds || wormholeMessageIds.length === 0) {
                LogError(`No Wormhole messages found in L2 transaction ${l2TransactionHash}. Chain: ${emitterChainName}.`, new Error('parseTransaction returned no messages'));
                return null;
            }

            const emitterUA = new UniversalAddress(emitterAddress);
            const messageId = wormholeMessageIds.find(whm => whm.emitter.equals(emitterUA) && whm.chain === emitterChainName);

            if (!messageId) {
                LogError(
                    `Could not find Wormhole message from emitter ${emitterAddress} on chain ${emitterChainName} in L2 transaction ${l2TransactionHash}. Found messages: ${JSON.stringify(wormholeMessageIds)}`,
                    new Error('Relevant WormholeMessageId not found')
                );
                return null;
            }

            LogMessage(`Successfully parsed Wormhole message ID: Chain: ${messageId.chain}, Emitter: ${messageId.emitter.toString()}, Sequence: ${messageId.sequence}.`);

            // TODO: Which discriminator to use? Test it
            const discriminator = "TokenBridge:TransferWithPayload";
            // const discriminator = "TokenBridge:Transfer";

            let fetchedParsedVaa: ParsedVaaWithPayload | null = null;
            try {
                const vaa = await this.wh.getVaa(
                    messageId,
                    discriminator,
                    GET_VAA_TIMEOUT_MS
                );
                fetchedParsedVaa = vaa as ParsedVaaWithPayload;
            } catch (e: any) {
                LogError(`Error fetching VAA using this.wh.getVaa with discriminator: ${discriminator}: ${e.message}`, e);
                return null;
            }

            if (!fetchedParsedVaa) {
                LogError(
                    `this.wh.getVaa did not return a VAA for message ID ${JSON.stringify(messageId)} (tried TokenBridge discriminators)`,
                    new Error('this.wh.getVaa failed or returned null VAA')
                );
                return null;
            }

            if (!this.verifyParsedVaa(fetchedParsedVaa, emitterChainId, emitterAddress)) {
                LogError(`Initial VAA verification (emitter check) failed for ${l2TransactionHash}.`, new Error('Initial VAA verification failed'));
                return null;
            }

            const targetL1ChainName = chainIdToChain(targetL1ChainId);
            const l1ChainContext = this.wh.getChain(targetL1ChainName);

            try {
                const tokenBridge = await l1ChainContext.getTokenBridge();
                if (fetchedParsedVaa.payloadName === "Transfer" || fetchedParsedVaa.payloadName === "TransferWithPayload") {
                    const isCompleted = await tokenBridge.isTransferCompleted(fetchedParsedVaa);
                    if (!isCompleted) {
                        LogError(`Token bridge transfer VAA not completed on L1 (${targetL1ChainName}) for ${l2TransactionHash}. VAA Seq: ${fetchedParsedVaa.sequence}, Type: ${fetchedParsedVaa.payloadName}`, new Error('VAA transfer not completed on L1'));
                        return null;
                    }
                    LogMessage(`Token bridge transfer VAA confirmed completed on L1 (${targetL1ChainName}) for ${l2TransactionHash}. Type: ${fetchedParsedVaa.payloadName}`);
                }

            } catch (e: any) {
                LogError(`Error checking VAA completion on L1 (${targetL1ChainName}): ${e.message}`, e);
                return null;
            }

            let signedVaaBytes: SignedVaa | null = null;
            if ('bytes' in fetchedParsedVaa && (fetchedParsedVaa as any).bytes instanceof Uint8Array) {
                signedVaaBytes = (fetchedParsedVaa as any).bytes;
            } else if (typeof (fetchedParsedVaa as any).serialize === 'function') {
                signedVaaBytes = (fetchedParsedVaa as any).serialize();
            }

            if (!signedVaaBytes || signedVaaBytes.length === 0) {
                LogError(`Could not extract VAA bytes from fetched VAA object (tried .bytes and .serialize()). VAA: ${JSON.stringify(fetchedParsedVaa)}`, new Error('VAA bytes extraction failed'));
                return null;
            }
            LogMessage(`Successfully obtained VAA object and its bytes. VAA Length: ${signedVaaBytes.length}`);

            LogMessage(`VAA fetched and verified (including L1 completion) for ${l2TransactionHash}.`);
            return { vaaBytes: signedVaaBytes, parsedVaa: fetchedParsedVaa };

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            LogError(
                `Error fetching and verifying VAA for L2 event ${l2TransactionHash}. EmitterChain: ${emitterChainName}, EmitterAddr: ${emitterAddress}. Error: ${err.message}`,
                err
            );
            return null;
        }
    }

    private verifyParsedVaa(
        parsedVaa: VAA<any>,
        expectedEmitterChainId: ChainId,
        expectedEmitterAddress: string
    ): boolean {
        const expectedEmitterChainName = chainIdToChain(expectedEmitterChainId);
        const actualEmitterChainName = parsedVaa.emitterChain as Chain;

        LogMessage(`Attempting to verify parsed VAA. Expected Emitter: ${expectedEmitterChainName} / ${expectedEmitterAddress}. Actual Emitter: ${actualEmitterChainName} / ${parsedVaa.emitterAddress.toString()}`);

        if (actualEmitterChainName !== expectedEmitterChainName) {
            LogError(
                `VAA verification failed: Emitter chain mismatch. Expected: ${expectedEmitterChainName} (Id: ${expectedEmitterChainId}), Got: ${actualEmitterChainName} (SDK value: ${parsedVaa.emitterChain})`,
                new Error('VAA emitter chain mismatch')
            );
            return false;
        }

        const expectedEmitterUA = new UniversalAddress(expectedEmitterAddress);
        if (!parsedVaa.emitterAddress.equals(expectedEmitterUA)) {
            LogError(
                `VAA verification failed: Emitter address mismatch. Expected: ${expectedEmitterAddress} (Native: ${expectedEmitterUA.toNative(expectedEmitterChainName).toString()}), Got: ${parsedVaa.emitterAddress.toString()} (Native: ${parsedVaa.emitterAddress.toNative(actualEmitterChainName).toString()})`,
                new Error('VAA emitter address mismatch')
            );
            return false;
        }

        if (parsedVaa.consistencyLevel < MIN_VAA_CONSISTENCY_LEVEL) {
            LogError(
                `VAA verification warning: Low consistency level. Expected >= ${MIN_VAA_CONSISTENCY_LEVEL}, Got: ${parsedVaa.consistencyLevel}. VAA Seq: ${parsedVaa.sequence}`,
                new Error('VAA consistency level too low')
            );
            return false;
        }

        // TODO: What are the other checks we need to do? Using the parsed VAA object?

        LogMessage(
            `Parsed VAA verified successfully. Emitter: ${actualEmitterChainName} / ${parsedVaa.emitterAddress.toString()}, Sequence: ${parsedVaa.sequence}, Consistency: ${parsedVaa.consistencyLevel}`
        );
        return true;
    }
} 