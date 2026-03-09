// This ABI is from the StarkNet Bitcoin Depositor contract deployed on Sepolia
// Source: tbtc-v2/cross-chain/starknet/deployments/sepolia/StarkNetBitcoinDepositor.json
export const StarkNetBitcoinDepositorABI = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'depositKey',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'destinationChainDepositOwner',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'l1Sender',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'initialAmount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'tbtcAmount',
        type: 'uint256',
      },
    ],
    name: 'DepositFinalized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'depositKey',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'destinationChainDepositOwner',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'l1Sender',
        type: 'address',
      },
    ],
    name: 'DepositInitialized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'newBuffer',
        type: 'uint256',
      },
    ],
    name: 'FeeBufferUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'initializeDepositGasOffset',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'finalizeDepositGasOffset',
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
        indexed: false,
        internalType: 'uint256',
        name: 'newFee',
        type: 'uint256',
      },
    ],
    name: 'L1ToL2MessageFeeUpdated',
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
        indexed: false,
        internalType: 'bool',
        name: 'reimburseTxMaxFee',
        type: 'bool',
      },
    ],
    name: 'ReimburseTxMaxFeeUpdated',
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
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'starkGateBridge',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'starkNetTBTCToken',
        type: 'uint256',
      },
    ],
    name: 'StarkNetBitcoinDepositorInitialized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'depositKey',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'starkNetRecipient',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'messageNonce',
        type: 'uint256',
      },
    ],
    name: 'TBTCBridgedToStarkNet',
    type: 'event',
  },
  {
    inputs: [],
    name: 'MAX_FEE_BUFFER',
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
    name: 'bridge',
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
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    name: 'deposits',
    outputs: [
      {
        internalType: 'enum AbstractTBTCDepositor.DepositState',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feeBuffer',
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
        internalType: 'uint256',
        name: 'depositKey',
        type: 'uint256',
      },
    ],
    name: 'finalizeDeposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'finalizeDepositGasOffset',
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
        name: '_tbtcBridge',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_tbtcVault',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_starkGateBridge',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_starkNetTBTCToken',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_l1ToL2MessageFee',
        type: 'uint256',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'bytes4',
            name: 'version',
            type: 'bytes4',
          },
          {
            internalType: 'bytes',
            name: 'inputVector',
            type: 'bytes',
          },
          {
            internalType: 'bytes',
            name: 'outputVector',
            type: 'bytes',
          },
          {
            internalType: 'bytes4',
            name: 'locktime',
            type: 'bytes4',
          },
        ],
        internalType: 'struct IBridgeTypes.BitcoinTxInfo',
        name: 'fundingTx',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint32',
            name: 'fundingOutputIndex',
            type: 'uint32',
          },
          {
            internalType: 'bytes8',
            name: 'blindingFactor',
            type: 'bytes8',
          },
          {
            internalType: 'bytes20',
            name: 'walletPubKeyHash',
            type: 'bytes20',
          },
          {
            internalType: 'bytes20',
            name: 'refundPubKeyHash',
            type: 'bytes20',
          },
          {
            internalType: 'bytes4',
            name: 'refundLocktime',
            type: 'bytes4',
          },
          {
            internalType: 'address',
            name: 'vault',
            type: 'address',
          },
        ],
        internalType: 'struct IBridgeTypes.DepositRevealInfo',
        name: 'reveal',
        type: 'tuple',
      },
      {
        internalType: 'bytes32',
        name: 'destinationChainDepositOwner',
        type: 'bytes32',
      },
    ],
    name: 'initializeDeposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'initializeDepositGasOffset',
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
    name: 'l1ToL2MessageFee',
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
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    name: 'quoteFinalizeDeposit',
    outputs: [
      {
        internalType: 'uint256',
        name: 'cost',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'quoteFinalizeDepositDynamic',
    outputs: [
      {
        internalType: 'uint256',
        name: 'cost',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'reimburseTxMaxFee',
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
        internalType: 'bool',
        name: '_reimburseTxMaxFee',
        type: 'bool',
      },
    ],
    name: 'setReimburseTxMaxFee',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'starkGateBridge',
    outputs: [
      {
        internalType: 'contract IStarkGateBridge',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'starkNetTBTCToken',
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
        name: 'newBuffer',
        type: 'uint256',
      },
    ],
    name: 'updateFeeBuffer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_initializeDepositGasOffset',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_finalizeDepositGasOffset',
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
        internalType: 'uint256',
        name: 'newFee',
        type: 'uint256',
      },
    ],
    name: 'updateL1ToL2MessageFee',
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
        internalType: 'address',
        name: '_reimbursementPool',
        type: 'address',
      },
    ],
    name: 'updateReimbursementPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
