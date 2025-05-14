export const L2BitcoinRedeemerABI = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes20",
                "name": "walletPubKeyHash",
                "type": "bytes20"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "redeemerOutputScript",
                "type": "bytes"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "redeemer",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint64",
                "name": "requestedAmount",
                "type": "uint64"
            },
            {
                "indexed": false,
                "internalType": "uint64",
                "name": "treasuryFee",
                "type": "uint64"
            },
            {
                "indexed": false,
                "internalType": "uint64",
                "name": "txMaxFee",
                "type": "uint64"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "l2Identifier",
                "type": "uint256"
            }
        ],
        "name": "RedemptionRequested",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "bytes20",
                "name": "walletPubKeyHash",
                "type": "bytes20"
            },
            {
                "components": [
                    {
                        "internalType": "bytes32",
                        "name": "txHash",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "uint32",
                        "name": "txOutputIndex",
                        "type": "uint32"
                    },
                    {
                        "internalType": "uint64",
                        "name": "txOutputValue",
                        "type": "uint64"
                    }
                ],
                "internalType": "struct BitcoinTx.UTXO",
                "name": "mainUtxo",
                "type": "tuple"
            },
            {
                "internalType": "bytes",
                "name": "redeemerOutputScript",
                "type": "bytes"
            },
            {
                "internalType": "uint64",
                "name": "amount",
                "type": "uint64"
            }
        ],
        "name": "requestRedemption",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];