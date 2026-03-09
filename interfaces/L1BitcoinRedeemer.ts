export const L1BitcoinRedeemerABI = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'requestRedemptionGasOffset',
        type: 'uint256',
      },
    ],
    name: 'GasOffsetParametersUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint8',
        name: 'version',
        type: 'uint8',
      },
    ],
    name: 'Initialized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'previousOwner',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'newOwner',
        type: 'address',
      },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'redemptionKey',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'bytes20',
        name: 'walletPubKeyHash',
        type: 'bytes20',
      },
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'txHash',
            type: 'bytes32',
          },
          {
            internalType: 'uint32',
            name: 'txOutputIndex',
            type: 'uint32',
          },
          {
            internalType: 'uint64',
            name: 'txOutputValue',
            type: 'uint64',
          },
        ],
        indexed: false,
        internalType: 'struct BitcoinTx.UTXO',
        name: 'mainUtxo',
        type: 'tuple',
      },
      {
        indexed: true,
        internalType: 'bytes',
        name: 'redemptionOutputScript',
        type: 'bytes',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'RedemptionRequested',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bool',
        name: 'authorization',
        type: 'bool',
      },
    ],
    name: 'ReimbursementAuthorizationUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'newReimbursementPool',
        type: 'address',
      },
    ],
    name: 'ReimbursementPoolUpdated',
    type: 'event',
  },
  {
    inputs: [],
    name: 'SATOSHI_MULTIPLIER',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'bank',
    outputs: [
      {
        internalType: 'contract IBank',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    name: 'gasReimbursements',
    outputs: [
      {
        internalType: 'address',
        name: 'receiver',
        type: 'address',
      },
      {
        internalType: 'uint96',
        name: 'gasSpent',
        type: 'uint96',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_thresholdBridge',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_wormholeTokenBridge',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_tbtcToken',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_bank',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_tbtcVault',
        type: 'address',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'reimbursementAuthorizations',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reimbursementPool',
    outputs: [
      {
        internalType: 'contract ReimbursementPool',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes20',
        name: 'walletPubKeyHash',
        type: 'bytes20',
      },
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'txHash',
            type: 'bytes32',
          },
          {
            internalType: 'uint32',
            name: 'txOutputIndex',
            type: 'uint32',
          },
          {
            internalType: 'uint64',
            name: 'txOutputValue',
            type: 'uint64',
          },
        ],
        internalType: 'struct BitcoinTx.UTXO',
        name: 'mainUtxo',
        type: 'tuple',
      },
      {
        internalType: 'bytes',
        name: 'encodedVm',
        type: 'bytes',
      },
    ],
    name: 'requestRedemption',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'requestRedemptionGasOffset',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'rescueTbtc',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tbtcToken',
    outputs: [
      {
        internalType: 'contract IERC20Upgradeable',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tbtcVault',
    outputs: [
      {
        internalType: 'contract ITBTCVault',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'thresholdBridge',
    outputs: [
      {
        internalType: 'contract IBridge',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newOwner',
        type: 'address',
      },
    ],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_requestRedemptionGasOffset',
        type: 'uint256',
      },
    ],
    name: 'updateGasOffsetParameters',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_address',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: 'authorization',
        type: 'bool',
      },
    ],
    name: 'updateReimbursementAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract ReimbursementPool',
        name: '_reimbursementPool',
        type: 'address',
      },
    ],
    name: 'updateReimbursementPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'wormholeTokenBridge',
    outputs: [
      {
        internalType: 'contract IWormholeTokenBridge',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
