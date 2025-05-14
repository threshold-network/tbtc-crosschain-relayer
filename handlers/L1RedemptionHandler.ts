import { ethers } from 'ethers';
import { RedemptionRequestedEventData } from '../services/L2RedemptionService';
import { LogMessage, LogError } from '../utils/Logs';
import { L1_TX_CONFIRMATION_TIMEOUT_MS } from '../services/Core';
import { L1BitcoinRedeemerABI } from '../interfaces/L1BitcoinRedeemer';

const GAS_ESTIMATE_MULTIPLIER = 1.2; // Add 20% buffer to gas estimate
const DEFAULT_L1_CONFIRMATIONS = 1; // Default number of confirmations to wait for

export class L1RedemptionHandler {
    private l1Provider: ethers.providers.JsonRpcProvider;
    private l1Signer: ethers.Wallet;
    private l1BitcoinRedeemer: ethers.Contract;

    constructor(
        l1RpcUrl: string,
        l1BitcoinRedeemerAddress: string,
        relayerL1PrivateKey: string
    ) {
        this.l1Provider = new ethers.providers.JsonRpcProvider(l1RpcUrl);
        this.l1Signer = new ethers.Wallet(relayerL1PrivateKey, this.l1Provider);
        this.l1BitcoinRedeemer = new ethers.Contract(l1BitcoinRedeemerAddress, L1BitcoinRedeemerABI, this.l1Signer);
        LogMessage(
            `L1RedemptionHandler initialized for L1BitcoinRedeemer at ${l1BitcoinRedeemerAddress} on ${l1RpcUrl}. Relayer L1 address: ${this.l1Signer.address}`
        );
    }

    /**
     * Submits data (derived from L2 event and validated by VAA) to the L1BitcoinRedeemer contract 
     * to finalize the redemption.
     */
    public async submitRedemptionDataToL1(
        redemptionData: RedemptionRequestedEventData // This comes from the L2 event listener
    ): Promise<boolean> {
        LogMessage(JSON.stringify({ // Stringify complex object
            message: 'Attempting to finalize L2 redemption on L1',
            l2TransactionHash: redemptionData.l2TransactionHash,
            l2Identifier: redemptionData.l2Identifier.toString(),
            relayerAddress: this.l1Signer.address,
            l1Contract: this.l1BitcoinRedeemer.address,
            walletPubKeyHash: redemptionData.walletPubKeyHash,
            requestedAmount: redemptionData.requestedAmount.toString(),
        }));

        try {
            // Convert walletPubKeyHash (bytes20 hex string) to bytes32 hex string if necessary
            let walletPubKeyHashBytes32 = redemptionData.walletPubKeyHash;
            if (walletPubKeyHashBytes32.startsWith('0x')) {
                walletPubKeyHashBytes32 = walletPubKeyHashBytes32.substring(2);
            }
            walletPubKeyHashBytes32 = '0x' + walletPubKeyHashBytes32.padEnd(64, '0');

            const args = [
                ethers.utils.hexZeroPad(redemptionData.l2Identifier.toHexString(), 32),
                walletPubKeyHashBytes32,
                redemptionData.redeemerOutputScript,
                redemptionData.requestedAmount,
                redemptionData.treasuryFee,
                redemptionData.txMaxFee,
                redemptionData.redeemer
            ];

            LogMessage(`Estimating gas for finalizeL2Redemption with args: ${JSON.stringify(args)}`);
            const estimatedGas = await this.l1BitcoinRedeemer.estimateGas.finalizeL2Redemption(...args);
            const gasLimit = ethers.BigNumber.from(estimatedGas).mul(ethers.BigNumber.from(Math.round(GAS_ESTIMATE_MULTIPLIER * 100))).div(100);
            LogMessage(`Estimated gas: ${estimatedGas.toString()}, Gas limit with multiplier (${GAS_ESTIMATE_MULTIPLIER}x): ${gasLimit.toString()}`);

            const tx = await this.l1BitcoinRedeemer.finalizeL2Redemption(...args, {
                gasLimit: gasLimit,
                // gasPrice: await this.l1Provider.getGasPrice(), // Optional: for non-EIP1559 chains or specific control
            });

            LogMessage(JSON.stringify({ // Stringify complex object
                message: 'L1 finalizeL2Redemption transaction submitted, awaiting confirmation...',
                l1TransactionHash: tx.hash,
                l2TransactionHash: redemptionData.l2TransactionHash,
            }));

            // Wait for transaction confirmation with timeout
            // tx.wait() can take (confirmations?: number, timeout?: number)
            // However, ethers v5 tx.wait() timeout parameter is not for the wait itself but for the provider response per block.
            // For a true overall timeout, we need to race Promise.race([tx.wait(), timeoutPromise])
            LogMessage(`Awaiting L1 transaction confirmation for ${tx.hash}. Confirmations: ${DEFAULT_L1_CONFIRMATIONS}, Timeout: ${L1_TX_CONFIRMATION_TIMEOUT_MS}ms`);
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Timeout waiting for L1 transaction ${tx.hash} confirmation after ${L1_TX_CONFIRMATION_TIMEOUT_MS}ms`)), L1_TX_CONFIRMATION_TIMEOUT_MS)
            );

            const receipt = await Promise.race([
                tx.wait(DEFAULT_L1_CONFIRMATIONS),
                timeoutPromise
            ]) as ethers.providers.TransactionReceipt;

            if (receipt.status === 1) {
                LogMessage(JSON.stringify({ // Stringify complex object
                    message: 'L1 finalizeL2Redemption transaction successful!',
                    l1TransactionHash: tx.hash,
                    l2TransactionHash: redemptionData.l2TransactionHash,
                    l1BlockNumber: receipt.blockNumber,
                }));
                return true;
            } else {
                LogError(JSON.stringify({ // Stringify complex object
                    message: 'L1 finalizeL2Redemption transaction failed (reverted on-chain).',
                    l1TransactionHash: tx.hash,
                    l2TransactionHash: redemptionData.l2TransactionHash,
                    receiptStatus: receipt.status,
                    receipt,
                }), new Error(`L1 tx ${tx.hash} reverted`));
                return false;
            }
        } catch (error: any) {
            const err = error instanceof Error ? error : new Error(String(error));
            LogError(JSON.stringify({ // Stringify complex object
                message: 'Error in finalizeL2Redemption on L1.',
                l2TransactionHash: redemptionData.l2TransactionHash,
                errorName: err.name,
                errorMessage: err.message,
                errorStack: err.stack,
                errorDetails: error.error, 
                transaction: error.transaction, 
                receipt: error.receipt 
            }), err);
            return false;
        }
    }
}
