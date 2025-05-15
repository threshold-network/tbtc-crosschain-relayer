export const L2BitcoinRedeemerABI = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes20",
                "name": "walletPubKey",
                "type": "bytes20"
            },
            {
                "indexed": false,
                "internalType": "struct BitcoinTx.UTXO",
                "name": "mainUtxo",
                "type": "tuple"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "redeemerOutputScript",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "uint64",
                "name": "amount",
                "type": "uint64"
            },
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