import { ethers } from 'ethers';
import { WormholeVaaService } from './WormholeVaaService';
import { L1RedemptionHandler } from '../handlers/L1RedemptionHandler';
import { LogMessage, LogError } from '../utils/Logs';
import { L2BitcoinRedeemerABI } from '../interfaces/L2BitcoinRedeemer';
import { ChainId } from '@wormhole-foundation/sdk';

export interface BitcoinTxUtxo {
    txHash: string; // bytes32
    txOutputIndex: number; // uint32
    txOutputValue: ethers.BigNumber; // uint64
}

export interface RedemptionRequestedEventData {
    walletPubKeyHash: string; // bytes20, from event name 
    mainUtxo: BitcoinTxUtxo; // struct BitcoinTx.UTXO, from event
    redeemerOutputScript: string; // bytes, from event
    amount: ethers.BigNumber; // uint64, from event
    l2TransactionHash: string; // bytes32, derived from event, used for VAA fetching
}

export class L2RedemptionService {
    private l2Provider: ethers.providers.JsonRpcProvider;
    private l2RpcUrl: string;
    private l2BitcoinRedeemerContract: ethers.Contract;
    private wormholeVaaService: WormholeVaaService;
    private l1RedemptionHandler: L1RedemptionHandler;

    private l2WormholeChainId: number;
    private l2WormholeGatewayAddress: string; // Emitter address on L2 for VAA fetching

    constructor(
        l2RpcUrl: string,
        l2BitcoinRedeemerAddress: string,
        relayerL1PrivateKey: string,
        l1RpcUrl: string,
        l1BitcoinRedeemerAddress: string,
        l2WormholeChainId: number,
        l2WormholeGatewayAddress: string,
    ) {
        this.l2RpcUrl = l2RpcUrl;
        this.l2Provider = new ethers.providers.JsonRpcProvider(l2RpcUrl);
        this.l2BitcoinRedeemerContract = new ethers.Contract(l2BitcoinRedeemerAddress, L2BitcoinRedeemerABI, this.l2Provider);

        this.l2WormholeChainId = l2WormholeChainId;
        this.l2WormholeGatewayAddress = l2WormholeGatewayAddress;

        this.l1RedemptionHandler = new L1RedemptionHandler(
            l1RpcUrl,
            l1BitcoinRedeemerAddress,
            relayerL1PrivateKey
        );

        LogMessage(
            `L2RedemptionService initialized for L2 contract ${l2BitcoinRedeemerAddress} on ${l2RpcUrl}. Listening for 'RedemptionRequested' event.`
        );
        LogMessage(`Wormhole VAA Service configured for L2 Wormhole Gateway: ${l2WormholeGatewayAddress} on chain ID: ${l2WormholeChainId}.`);
        LogMessage(`L1 Redemption Handler configured for L1BitcoinRedeemer: ${l1BitcoinRedeemerAddress} on ${l1RpcUrl}.`);
    }
    
    public async initialize(): Promise<void> {
        this.wormholeVaaService = await WormholeVaaService.create(this.l2RpcUrl);
    }

    public startListening(): void {
        if (!this.l2BitcoinRedeemerContract.interface.events['RedemptionRequested']) {
            LogError("L2 contract ABI does not seem to contain 'RedemptionRequested' event. Cannot listen for events.", new Error('Missing RedemptionRequested in ABI'));
            return;
        }
        LogMessage(`Starting to listen for 'RedemptionRequested' events from ${this.l2BitcoinRedeemerContract.address}`);

        this.l2BitcoinRedeemerContract.on('RedemptionRequested', async (
            walletPubKeyHash: string,           // event.args[0] - bytes20
            mainUtxo: BitcoinTxUtxo,            // event.args[1] - struct BitcoinTx.UTXO
            redeemerOutputScript: string,       // event.args[2] - bytes
            amount: ethers.BigNumber,           // event.args[3] - uint64
            rawEvent: ethers.Event              // The full event object from ethers.js
        ) => {
            const eventData: RedemptionRequestedEventData = {
                walletPubKeyHash,
                mainUtxo,
                redeemerOutputScript,
                amount,
                l2TransactionHash: rawEvent.transactionHash,
            };

            LogMessage(JSON.stringify({
                message: "Received RedemptionRequested event",
                l2TransactionHash: rawEvent.transactionHash,
                l2BlockNumber: rawEvent.blockNumber,
                rawArgs: rawEvent.args ? JSON.stringify(rawEvent.args, (key, value) =>
                    typeof value === 'bigint' ? value.toString() :
                    ethers.BigNumber.isBigNumber(value) ? value.toString() : value
                ) : "N/A",
                parsedEventData: eventData
            }));

            await this.handleRedemptionRequest(eventData);
        });

        this.l2Provider.on('error', (error) => {
            LogError('L2 Provider emitted an error:', error);
        });
    }

    public stopListening(): void {
        LogMessage(`Stopping 'RedemptionRequested' event listener for ${this.l2BitcoinRedeemerContract.address}.`);
        this.l2BitcoinRedeemerContract.removeAllListeners('RedemptionRequested');
    }

    private async handleRedemptionRequest(eventData: RedemptionRequestedEventData): Promise<void> {
        LogMessage(`Processing redemption request triggered by L2 tx: ${eventData.l2TransactionHash}. Data: ${JSON.stringify(eventData)}`);

        try {
            const vaaDetails = await this.wormholeVaaService.fetchAndVerifyVaaForL2Event(
                eventData.l2TransactionHash,
                this.l2WormholeChainId as ChainId,
                this.l2WormholeGatewayAddress
            );

            if (!vaaDetails || !vaaDetails.vaaBytes || !vaaDetails.parsedVaa) {
                LogError(
                    `Failed to fetch or verify VAA for L2 transaction ${eventData.l2TransactionHash}. Halting process for this event.`,
                    new Error('VAA fetch or verification failed')
                );
                return;
            }

            // Log details from the parsed VAA for better traceability
            LogMessage(
                `Successfully fetched and verified VAA for L2 Tx: ${eventData.l2TransactionHash}. ` +
                `VAA Sequence: ${vaaDetails.parsedVaa.sequence}, ` +
                `Emitter: ${vaaDetails.parsedVaa.emitterAddress.toString()}, ` +
                `Consistency: ${vaaDetails.parsedVaa.consistencyLevel}.`
            );

            // VAA is fetched and verified, now proceed to L1 submission.
            // The VAA itself (vaaDetails.vaaBytes) is not passed to submitRedemptionDataToL1
            // as per the current design where L1BitcoinRedeemer does not take VAA as direct input.
            // The VAA fetch and verification acts as a gate.
            const success = await this.l1RedemptionHandler.submitRedemptionDataToL1(
                eventData
            );

            if (success) {
                LogMessage(`Successfully submitted VAA to L1 and initiated redemption for L2 Tx: ${eventData.l2TransactionHash}.`);
            } else {
                LogError(`Failed to submit VAA to L1 or L1 redemption failed for L2 Tx: ${eventData.l2TransactionHash}.`, new Error('L1 submission/redemption failed'));
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            LogError(`Unhandled error during redemption request processing for L2 Tx: ${eventData.l2TransactionHash}. Error: ${err.message}`, err);
        }
    }
}