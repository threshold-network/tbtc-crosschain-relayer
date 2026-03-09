import {
  BaseContract,
  BigNumber,
  type BigNumberish,
  type BytesLike,
  type CallOverrides,
  type ContractTransaction,
  type Overrides,
  type PayableOverrides,
  type PopulatedTransaction,
  Signer,
  utils,
} from 'ethers';
import { FunctionFragment, type Result, EventFragment } from '@ethersproject/abi';
import { type Listener, type Provider } from '@ethersproject/providers';
import {
  type TypedEventFilter,
  type TypedEvent,
  type TypedListener,
  type OnEvent,
} from './common.js';

export type BitcoinTxInfoStruct = {
  version: BytesLike;
  inputVector: BytesLike;
  outputVector: BytesLike;
  locktime: BytesLike;
};

export type BitcoinTxInfoStructOutput = [string, string, string, string] & {
  version: string;
  inputVector: string;
  outputVector: string;
  locktime: string;
};

export type DepositRevealInfoStruct = {
  fundingOutputIndex: BigNumberish;
  blindingFactor: BytesLike;
  walletPubKeyHash: BytesLike;
  refundPubKeyHash: BytesLike;
  refundLocktime: BytesLike;
  vault: string;
};

export type DepositRevealInfoStructOutput = [number, string, string, string, string, string] & {
  fundingOutputIndex: number;
  blindingFactor: string;
  walletPubKeyHash: string;
  refundPubKeyHash: string;
  refundLocktime: string;
  vault: string;
};

export interface StarkNetBitcoinDepositorInterface extends utils.Interface {
  functions: {
    'MAX_FEE_BUFFER()': FunctionFragment;
    'SATOSHI_MULTIPLIER()': FunctionFragment;
    'bridge()': FunctionFragment;
    'deposits(uint256)': FunctionFragment;
    'feeBuffer()': FunctionFragment;
    'finalizeDeposit(uint256)': FunctionFragment;
    'finalizeDepositGasOffset()': FunctionFragment;
    'gasReimbursements(uint256)': FunctionFragment;
    'initialize(address,address,address,uint256,uint256)': FunctionFragment;
    'initializeDeposit((bytes4,bytes,bytes,bytes4),(uint32,bytes8,bytes20,bytes20,bytes4,address),bytes32)': FunctionFragment;
    'initializeDepositGasOffset()': FunctionFragment;
    'l1ToL2MessageFee()': FunctionFragment;
    'owner()': FunctionFragment;
    'quoteFinalizeDeposit(uint256)': FunctionFragment;
    'quoteFinalizeDepositDynamic()': FunctionFragment;
    'reimburseTxMaxFee()': FunctionFragment;
    'reimbursementAuthorizations(address)': FunctionFragment;
    'reimbursementPool()': FunctionFragment;
    'renounceOwnership()': FunctionFragment;
    'setReimburseTxMaxFee(bool)': FunctionFragment;
    'starkGateBridge()': FunctionFragment;
    'starkNetTBTCToken()': FunctionFragment;
    'tbtcToken()': FunctionFragment;
    'tbtcVault()': FunctionFragment;
    'transferOwnership(address)': FunctionFragment;
    'updateFeeBuffer(uint256)': FunctionFragment;
    'updateGasOffsetParameters(uint256,uint256)': FunctionFragment;
    'updateL1ToL2MessageFee(uint256)': FunctionFragment;
    'updateReimbursementAuthorization(address,bool)': FunctionFragment;
    'updateReimbursementPool(address)': FunctionFragment;
  };

  encodeFunctionData(functionFragment: 'MAX_FEE_BUFFER', values?: undefined): string;
  encodeFunctionData(functionFragment: 'SATOSHI_MULTIPLIER', values?: undefined): string;
  encodeFunctionData(functionFragment: 'bridge', values?: undefined): string;
  encodeFunctionData(functionFragment: 'deposits', values: [BigNumberish]): string;
  encodeFunctionData(functionFragment: 'feeBuffer', values?: undefined): string;
  encodeFunctionData(functionFragment: 'finalizeDeposit', values: [BigNumberish]): string;
  encodeFunctionData(functionFragment: 'finalizeDepositGasOffset', values?: undefined): string;
  encodeFunctionData(functionFragment: 'gasReimbursements', values: [BigNumberish]): string;
  encodeFunctionData(
    functionFragment: 'initialize',
    values: [string, string, string, BigNumberish, BigNumberish],
  ): string;
  encodeFunctionData(
    functionFragment: 'initializeDeposit',
    values: [BitcoinTxInfoStruct, DepositRevealInfoStruct, BytesLike],
  ): string;
  encodeFunctionData(functionFragment: 'initializeDepositGasOffset', values?: undefined): string;
  encodeFunctionData(functionFragment: 'l1ToL2MessageFee', values?: undefined): string;
  encodeFunctionData(functionFragment: 'owner', values?: undefined): string;
  encodeFunctionData(functionFragment: 'quoteFinalizeDeposit', values: [BigNumberish]): string;
  encodeFunctionData(functionFragment: 'quoteFinalizeDepositDynamic', values?: undefined): string;
  encodeFunctionData(functionFragment: 'reimburseTxMaxFee', values?: undefined): string;
  encodeFunctionData(functionFragment: 'reimbursementAuthorizations', values: [string]): string;
  encodeFunctionData(functionFragment: 'reimbursementPool', values?: undefined): string;
  encodeFunctionData(functionFragment: 'renounceOwnership', values?: undefined): string;
  encodeFunctionData(functionFragment: 'setReimburseTxMaxFee', values: [boolean]): string;
  encodeFunctionData(functionFragment: 'starkGateBridge', values?: undefined): string;
  encodeFunctionData(functionFragment: 'starkNetTBTCToken', values?: undefined): string;
  encodeFunctionData(functionFragment: 'tbtcToken', values?: undefined): string;
  encodeFunctionData(functionFragment: 'tbtcVault', values?: undefined): string;
  encodeFunctionData(functionFragment: 'transferOwnership', values: [string]): string;
  encodeFunctionData(functionFragment: 'updateFeeBuffer', values: [BigNumberish]): string;
  encodeFunctionData(
    functionFragment: 'updateGasOffsetParameters',
    values: [BigNumberish, BigNumberish],
  ): string;
  encodeFunctionData(functionFragment: 'updateL1ToL2MessageFee', values: [BigNumberish]): string;
  encodeFunctionData(
    functionFragment: 'updateReimbursementAuthorization',
    values: [string, boolean],
  ): string;
  encodeFunctionData(functionFragment: 'updateReimbursementPool', values: [string]): string;

  decodeFunctionResult(functionFragment: 'MAX_FEE_BUFFER', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'SATOSHI_MULTIPLIER', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'bridge', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'deposits', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'feeBuffer', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'finalizeDeposit', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'finalizeDepositGasOffset', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'gasReimbursements', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'initialize', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'initializeDeposit', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'initializeDepositGasOffset', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'l1ToL2MessageFee', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'owner', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'quoteFinalizeDeposit', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'quoteFinalizeDepositDynamic', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'reimburseTxMaxFee', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'reimbursementAuthorizations', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'reimbursementPool', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'renounceOwnership', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'setReimburseTxMaxFee', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'starkGateBridge', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'starkNetTBTCToken', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'tbtcToken', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'tbtcVault', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'transferOwnership', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'updateFeeBuffer', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'updateGasOffsetParameters', data: BytesLike): Result;
  decodeFunctionResult(functionFragment: 'updateL1ToL2MessageFee', data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: 'updateReimbursementAuthorization',
    data: BytesLike,
  ): Result;
  decodeFunctionResult(functionFragment: 'updateReimbursementPool', data: BytesLike): Result;

  events: {
    'DepositFinalized(uint256,bytes32,address,uint256,uint256)': EventFragment;
    'DepositInitialized(uint256,bytes32,address)': EventFragment;
    'FeeBufferUpdated(uint256)': EventFragment;
    'GasOffsetParametersUpdated(uint256,uint256)': EventFragment;
    'Initialized(uint8)': EventFragment;
    'L1ToL2MessageFeeUpdated(uint256)': EventFragment;
    'OwnershipTransferred(address,address)': EventFragment;
    'ReimburseTxMaxFeeUpdated(bool)': EventFragment;
    'ReimbursementAuthorizationUpdated(address,bool)': EventFragment;
    'ReimbursementPoolUpdated(address)': EventFragment;
    'StarkNetBitcoinDepositorInitialized(address,uint256)': EventFragment;
    'TBTCBridgedToStarkNet(bytes32,uint256,uint256,uint256)': EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: 'DepositFinalized'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'DepositInitialized'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'FeeBufferUpdated'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'GasOffsetParametersUpdated'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'Initialized'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'L1ToL2MessageFeeUpdated'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'OwnershipTransferred'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'ReimburseTxMaxFeeUpdated'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'ReimbursementAuthorizationUpdated'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'ReimbursementPoolUpdated'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'StarkNetBitcoinDepositorInitialized'): EventFragment;
  getEvent(nameOrSignatureOrTopic: 'TBTCBridgedToStarkNet'): EventFragment;
}

export type DepositFinalizedEvent = TypedEvent<
  [BigNumber, BigNumberish, string, BigNumber, BigNumber],
  {
    depositKey: BigNumber;
    l2DepositOwner: BigNumberish;
    l1Sender: string;
    initialAmount: BigNumber;
    tbtcAmount: BigNumber;
  }
>;

export type DepositFinalizedEventFilter = TypedEventFilter<DepositFinalizedEvent>;

export type DepositInitializedEvent = TypedEvent<
  [BigNumber, BigNumberish, string],
  {
    depositKey: BigNumber;
    l2DepositOwner: BigNumberish;
    l1Sender: string;
  }
>;

export type DepositInitializedEventFilter = TypedEventFilter<DepositInitializedEvent>;

export type FeeBufferUpdatedEvent = TypedEvent<[BigNumber], { newBuffer: BigNumber }>;

export type FeeBufferUpdatedEventFilter = TypedEventFilter<FeeBufferUpdatedEvent>;

export type GasOffsetParametersUpdatedEvent = TypedEvent<
  [BigNumber, BigNumber],
  { initializeDepositGasOffset: BigNumber; finalizeDepositGasOffset: BigNumber }
>;

export type GasOffsetParametersUpdatedEventFilter =
  TypedEventFilter<GasOffsetParametersUpdatedEvent>;

export type InitializedEvent = TypedEvent<[number], { version: number }>;

export type InitializedEventFilter = TypedEventFilter<InitializedEvent>;

export type L1ToL2MessageFeeUpdatedEvent = TypedEvent<[BigNumber], { newFee: BigNumber }>;

export type L1ToL2MessageFeeUpdatedEventFilter = TypedEventFilter<L1ToL2MessageFeeUpdatedEvent>;

export type OwnershipTransferredEvent = TypedEvent<
  [string, string],
  { previousOwner: string; newOwner: string }
>;

export type OwnershipTransferredEventFilter = TypedEventFilter<OwnershipTransferredEvent>;

export type ReimburseTxMaxFeeUpdatedEvent = TypedEvent<[boolean], { reimburseTxMaxFee: boolean }>;

export type ReimburseTxMaxFeeUpdatedEventFilter = TypedEventFilter<ReimburseTxMaxFeeUpdatedEvent>;

export type ReimbursementAuthorizationUpdatedEvent = TypedEvent<
  [string, boolean],
  { _address: string; authorization: boolean }
>;

export type ReimbursementAuthorizationUpdatedEventFilter =
  TypedEventFilter<ReimbursementAuthorizationUpdatedEvent>;

export type ReimbursementPoolUpdatedEvent = TypedEvent<[string], { newReimbursementPool: string }>;

export type ReimbursementPoolUpdatedEventFilter = TypedEventFilter<ReimbursementPoolUpdatedEvent>;

export type StarkNetBitcoinDepositorInitializedEvent = TypedEvent<
  [string, BigNumber],
  { starkGateBridge: string; starkNetTBTCToken: BigNumber }
>;

export type StarkNetBitcoinDepositorInitializedEventFilter =
  TypedEventFilter<StarkNetBitcoinDepositorInitializedEvent>;

export type TBTCBridgedToStarkNetEvent = TypedEvent<
  [string, BigNumber, BigNumber, BigNumber],
  {
    depositKey: string;
    starkNetRecipient: BigNumber;
    amount: BigNumber;
    messageNonce: BigNumber;
  }
>;

export type TBTCBridgedToStarkNetEventFilter = TypedEventFilter<TBTCBridgedToStarkNetEvent>;

export interface StarkNetBitcoinDepositor extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: StarkNetBitcoinDepositorInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined,
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>,
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    MAX_FEE_BUFFER(overrides?: CallOverrides): Promise<[BigNumber]>;

    SATOSHI_MULTIPLIER(overrides?: CallOverrides): Promise<[BigNumber]>;

    bridge(overrides?: CallOverrides): Promise<[string]>;

    deposits(arg0: BigNumberish, overrides?: CallOverrides): Promise<[number]>;

    feeBuffer(overrides?: CallOverrides): Promise<[BigNumber]>;

    finalizeDeposit(
      depositKey: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    finalizeDepositGasOffset(overrides?: CallOverrides): Promise<[BigNumber]>;

    gasReimbursements(
      arg0: BigNumberish,
      overrides?: CallOverrides,
    ): Promise<[string, BigNumber] & { receiver: string; gasSpent: BigNumber }>;

    initialize(
      _tbtcBridge: string,
      _tbtcVault: string,
      _starkGateBridge: string,
      _starkNetTBTCToken: BigNumberish,
      _l1ToL2MessageFee: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    initializeDeposit(
      fundingTx: BitcoinTxInfoStruct,
      reveal: DepositRevealInfoStruct,
      l2DepositOwner: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    initializeDepositGasOffset(overrides?: CallOverrides): Promise<[BigNumber]>;

    l1ToL2MessageFee(overrides?: CallOverrides): Promise<[BigNumber]>;

    owner(overrides?: CallOverrides): Promise<[string]>;

    quoteFinalizeDeposit(arg0: BigNumberish, overrides?: CallOverrides): Promise<[BigNumber]>;

    quoteFinalizeDepositDynamic(overrides?: CallOverrides): Promise<[BigNumber]>;

    reimburseTxMaxFee(overrides?: CallOverrides): Promise<[boolean]>;

    reimbursementAuthorizations(arg0: string, overrides?: CallOverrides): Promise<[boolean]>;

    reimbursementPool(overrides?: CallOverrides): Promise<[string]>;

    renounceOwnership(
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    setReimburseTxMaxFee(
      _reimburseTxMaxFee: boolean,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    starkGateBridge(overrides?: CallOverrides): Promise<[string]>;

    starkNetTBTCToken(overrides?: CallOverrides): Promise<[BigNumber]>;

    tbtcToken(overrides?: CallOverrides): Promise<[string]>;

    tbtcVault(overrides?: CallOverrides): Promise<[string]>;

    transferOwnership(
      newOwner: string,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    updateFeeBuffer(
      newBuffer: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    updateGasOffsetParameters(
      _initializeDepositGasOffset: BigNumberish,
      _finalizeDepositGasOffset: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    updateL1ToL2MessageFee(
      newFee: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    updateReimbursementAuthorization(
      _address: string,
      authorization: boolean,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;

    updateReimbursementPool(
      _reimbursementPool: string,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<ContractTransaction>;
  };

  MAX_FEE_BUFFER(overrides?: CallOverrides): Promise<BigNumber>;

  SATOSHI_MULTIPLIER(overrides?: CallOverrides): Promise<BigNumber>;

  bridge(overrides?: CallOverrides): Promise<string>;

  deposits(arg0: BigNumberish, overrides?: CallOverrides): Promise<number>;

  feeBuffer(overrides?: CallOverrides): Promise<BigNumber>;

  finalizeDeposit(
    depositKey: BigNumberish,
    overrides?: PayableOverrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  finalizeDepositGasOffset(overrides?: CallOverrides): Promise<BigNumber>;

  gasReimbursements(
    arg0: BigNumberish,
    overrides?: CallOverrides,
  ): Promise<[string, BigNumber] & { receiver: string; gasSpent: BigNumber }>;

  initialize(
    _tbtcBridge: string,
    _tbtcVault: string,
    _starkGateBridge: string,
    _starkNetTBTCToken: BigNumberish,
    _l1ToL2MessageFee: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  initializeDeposit(
    fundingTx: BitcoinTxInfoStruct,
    reveal: DepositRevealInfoStruct,
    l2DepositOwner: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  initializeDepositGasOffset(overrides?: CallOverrides): Promise<BigNumber>;

  l1ToL2MessageFee(overrides?: CallOverrides): Promise<BigNumber>;

  owner(overrides?: CallOverrides): Promise<string>;

  quoteFinalizeDeposit(arg0: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

  quoteFinalizeDepositDynamic(overrides?: CallOverrides): Promise<BigNumber>;

  reimburseTxMaxFee(overrides?: CallOverrides): Promise<boolean>;

  reimbursementAuthorizations(arg0: string, overrides?: CallOverrides): Promise<boolean>;

  reimbursementPool(overrides?: CallOverrides): Promise<string>;

  renounceOwnership(
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  setReimburseTxMaxFee(
    _reimburseTxMaxFee: boolean,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  starkGateBridge(overrides?: CallOverrides): Promise<string>;

  starkNetTBTCToken(overrides?: CallOverrides): Promise<BigNumber>;

  tbtcToken(overrides?: CallOverrides): Promise<string>;

  tbtcVault(overrides?: CallOverrides): Promise<string>;

  transferOwnership(
    newOwner: string,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  updateFeeBuffer(
    newBuffer: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  updateGasOffsetParameters(
    _initializeDepositGasOffset: BigNumberish,
    _finalizeDepositGasOffset: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  updateL1ToL2MessageFee(
    newFee: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  updateReimbursementAuthorization(
    _address: string,
    authorization: boolean,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  updateReimbursementPool(
    _reimbursementPool: string,
    overrides?: Overrides & { from?: string | Promise<string> },
  ): Promise<ContractTransaction>;

  callStatic: {
    MAX_FEE_BUFFER(overrides?: CallOverrides): Promise<BigNumber>;

    SATOSHI_MULTIPLIER(overrides?: CallOverrides): Promise<BigNumber>;

    bridge(overrides?: CallOverrides): Promise<string>;

    deposits(arg0: BigNumberish, overrides?: CallOverrides): Promise<number>;

    feeBuffer(overrides?: CallOverrides): Promise<BigNumber>;

    finalizeDeposit(depositKey: BigNumberish, overrides?: CallOverrides): Promise<void>;

    finalizeDepositGasOffset(overrides?: CallOverrides): Promise<BigNumber>;

    gasReimbursements(
      arg0: BigNumberish,
      overrides?: CallOverrides,
    ): Promise<[string, BigNumber] & { receiver: string; gasSpent: BigNumber }>;

    initialize(
      _tbtcBridge: string,
      _tbtcVault: string,
      _starkGateBridge: string,
      _starkNetTBTCToken: BigNumberish,
      _l1ToL2MessageFee: BigNumberish,
      overrides?: CallOverrides,
    ): Promise<void>;

    initializeDeposit(
      fundingTx: BitcoinTxInfoStruct,
      reveal: DepositRevealInfoStruct,
      l2DepositOwner: BigNumberish,
      overrides?: CallOverrides,
    ): Promise<void>;

    initializeDepositGasOffset(overrides?: CallOverrides): Promise<BigNumber>;

    l1ToL2MessageFee(overrides?: CallOverrides): Promise<BigNumber>;

    owner(overrides?: CallOverrides): Promise<string>;

    quoteFinalizeDeposit(arg0: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

    quoteFinalizeDepositDynamic(overrides?: CallOverrides): Promise<BigNumber>;

    reimburseTxMaxFee(overrides?: CallOverrides): Promise<boolean>;

    reimbursementAuthorizations(arg0: string, overrides?: CallOverrides): Promise<boolean>;

    reimbursementPool(overrides?: CallOverrides): Promise<string>;

    renounceOwnership(overrides?: CallOverrides): Promise<void>;

    setReimburseTxMaxFee(_reimburseTxMaxFee: boolean, overrides?: CallOverrides): Promise<void>;

    starkGateBridge(overrides?: CallOverrides): Promise<string>;

    starkNetTBTCToken(overrides?: CallOverrides): Promise<BigNumber>;

    tbtcToken(overrides?: CallOverrides): Promise<string>;

    tbtcVault(overrides?: CallOverrides): Promise<string>;

    transferOwnership(newOwner: string, overrides?: CallOverrides): Promise<void>;

    updateFeeBuffer(newBuffer: BigNumberish, overrides?: CallOverrides): Promise<void>;

    updateGasOffsetParameters(
      _initializeDepositGasOffset: BigNumberish,
      _finalizeDepositGasOffset: BigNumberish,
      overrides?: CallOverrides,
    ): Promise<void>;

    updateL1ToL2MessageFee(newFee: BigNumberish, overrides?: CallOverrides): Promise<void>;

    updateReimbursementAuthorization(
      _address: string,
      authorization: boolean,
      overrides?: CallOverrides,
    ): Promise<void>;

    updateReimbursementPool(_reimbursementPool: string, overrides?: CallOverrides): Promise<void>;
  };

  filters: {
    'DepositFinalized(uint256,bytes32,address,uint256,uint256)'(
      depositKey?: BigNumberish | null,
      l2DepositOwner?: BigNumberish | null,
      l1Sender?: string | null,
      initialAmount?: null,
      tbtcAmount?: null,
    ): DepositFinalizedEventFilter;
    DepositFinalized(
      depositKey?: BigNumberish | null,
      l2DepositOwner?: BigNumberish | null,
      l1Sender?: string | null,
      initialAmount?: null,
      tbtcAmount?: null,
    ): DepositFinalizedEventFilter;

    'DepositInitialized(uint256,bytes32,address)'(
      depositKey?: BigNumberish | null,
      l2DepositOwner?: BigNumberish | null,
      l1Sender?: string | null,
    ): DepositInitializedEventFilter;
    DepositInitialized(
      depositKey?: BigNumberish | null,
      l2DepositOwner?: BigNumberish | null,
      l1Sender?: string | null,
    ): DepositInitializedEventFilter;

    'FeeBufferUpdated(uint256)'(newBuffer?: null): FeeBufferUpdatedEventFilter;
    FeeBufferUpdated(newBuffer?: null): FeeBufferUpdatedEventFilter;

    'GasOffsetParametersUpdated(uint256,uint256)'(
      initializeDepositGasOffset?: null,
      finalizeDepositGasOffset?: null,
    ): GasOffsetParametersUpdatedEventFilter;
    GasOffsetParametersUpdated(
      initializeDepositGasOffset?: null,
      finalizeDepositGasOffset?: null,
    ): GasOffsetParametersUpdatedEventFilter;

    'Initialized(uint8)'(version?: null): InitializedEventFilter;
    Initialized(version?: null): InitializedEventFilter;

    'L1ToL2MessageFeeUpdated(uint256)'(newFee?: null): L1ToL2MessageFeeUpdatedEventFilter;
    L1ToL2MessageFeeUpdated(newFee?: null): L1ToL2MessageFeeUpdatedEventFilter;

    'OwnershipTransferred(address,address)'(
      previousOwner?: string | null,
      newOwner?: string | null,
    ): OwnershipTransferredEventFilter;
    OwnershipTransferred(
      previousOwner?: string | null,
      newOwner?: string | null,
    ): OwnershipTransferredEventFilter;

    'ReimburseTxMaxFeeUpdated(bool)'(reimburseTxMaxFee?: null): ReimburseTxMaxFeeUpdatedEventFilter;
    ReimburseTxMaxFeeUpdated(reimburseTxMaxFee?: null): ReimburseTxMaxFeeUpdatedEventFilter;

    'ReimbursementAuthorizationUpdated(address,bool)'(
      _address?: string | null,
      authorization?: null,
    ): ReimbursementAuthorizationUpdatedEventFilter;
    ReimbursementAuthorizationUpdated(
      _address?: string | null,
      authorization?: null,
    ): ReimbursementAuthorizationUpdatedEventFilter;

    'ReimbursementPoolUpdated(address)'(
      newReimbursementPool?: null,
    ): ReimbursementPoolUpdatedEventFilter;
    ReimbursementPoolUpdated(newReimbursementPool?: null): ReimbursementPoolUpdatedEventFilter;

    'StarkNetBitcoinDepositorInitialized(address,uint256)'(
      starkGateBridge?: null,
      starkNetTBTCToken?: null,
    ): StarkNetBitcoinDepositorInitializedEventFilter;
    StarkNetBitcoinDepositorInitialized(
      starkGateBridge?: null,
      starkNetTBTCToken?: null,
    ): StarkNetBitcoinDepositorInitializedEventFilter;

    'TBTCBridgedToStarkNet(bytes32,uint256,uint256,uint256)'(
      depositKey?: BytesLike | null,
      starkNetRecipient?: BigNumberish | null,
      amount?: null,
      messageNonce?: null,
    ): TBTCBridgedToStarkNetEventFilter;
    TBTCBridgedToStarkNet(
      depositKey?: BytesLike | null,
      starkNetRecipient?: BigNumberish | null,
      amount?: null,
      messageNonce?: null,
    ): TBTCBridgedToStarkNetEventFilter;
  };

  estimateGas: {
    MAX_FEE_BUFFER(overrides?: CallOverrides): Promise<BigNumber>;

    SATOSHI_MULTIPLIER(overrides?: CallOverrides): Promise<BigNumber>;

    bridge(overrides?: CallOverrides): Promise<BigNumber>;

    deposits(arg0: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

    feeBuffer(overrides?: CallOverrides): Promise<BigNumber>;

    finalizeDeposit(
      depositKey: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    finalizeDepositGasOffset(overrides?: CallOverrides): Promise<BigNumber>;

    gasReimbursements(arg0: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

    initialize(
      _tbtcBridge: string,
      _tbtcVault: string,
      _starkGateBridge: string,
      _starkNetTBTCToken: BigNumberish,
      _l1ToL2MessageFee: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    initializeDeposit(
      fundingTx: BitcoinTxInfoStruct,
      reveal: DepositRevealInfoStruct,
      l2DepositOwner: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    initializeDepositGasOffset(overrides?: CallOverrides): Promise<BigNumber>;

    l1ToL2MessageFee(overrides?: CallOverrides): Promise<BigNumber>;

    owner(overrides?: CallOverrides): Promise<BigNumber>;

    quoteFinalizeDeposit(arg0: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

    quoteFinalizeDepositDynamic(overrides?: CallOverrides): Promise<BigNumber>;

    reimburseTxMaxFee(overrides?: CallOverrides): Promise<BigNumber>;

    reimbursementAuthorizations(arg0: string, overrides?: CallOverrides): Promise<BigNumber>;

    reimbursementPool(overrides?: CallOverrides): Promise<BigNumber>;

    renounceOwnership(
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    setReimburseTxMaxFee(
      _reimburseTxMaxFee: boolean,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    starkGateBridge(overrides?: CallOverrides): Promise<BigNumber>;

    starkNetTBTCToken(overrides?: CallOverrides): Promise<BigNumber>;

    tbtcToken(overrides?: CallOverrides): Promise<BigNumber>;

    tbtcVault(overrides?: CallOverrides): Promise<BigNumber>;

    transferOwnership(
      newOwner: string,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    updateFeeBuffer(
      newBuffer: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    updateGasOffsetParameters(
      _initializeDepositGasOffset: BigNumberish,
      _finalizeDepositGasOffset: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    updateL1ToL2MessageFee(
      newFee: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    updateReimbursementAuthorization(
      _address: string,
      authorization: boolean,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;

    updateReimbursementPool(
      _reimbursementPool: string,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    MAX_FEE_BUFFER(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    SATOSHI_MULTIPLIER(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    bridge(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    deposits(arg0: BigNumberish, overrides?: CallOverrides): Promise<PopulatedTransaction>;

    feeBuffer(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    finalizeDeposit(
      depositKey: BigNumberish,
      overrides?: PayableOverrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    finalizeDepositGasOffset(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    gasReimbursements(arg0: BigNumberish, overrides?: CallOverrides): Promise<PopulatedTransaction>;

    initialize(
      _tbtcBridge: string,
      _tbtcVault: string,
      _starkGateBridge: string,
      _starkNetTBTCToken: BigNumberish,
      _l1ToL2MessageFee: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    initializeDeposit(
      fundingTx: BitcoinTxInfoStruct,
      reveal: DepositRevealInfoStruct,
      l2DepositOwner: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    initializeDepositGasOffset(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    l1ToL2MessageFee(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    owner(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    quoteFinalizeDeposit(
      arg0: BigNumberish,
      overrides?: CallOverrides,
    ): Promise<PopulatedTransaction>;

    quoteFinalizeDepositDynamic(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    reimburseTxMaxFee(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    reimbursementAuthorizations(
      arg0: string,
      overrides?: CallOverrides,
    ): Promise<PopulatedTransaction>;

    reimbursementPool(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    renounceOwnership(
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    setReimburseTxMaxFee(
      _reimburseTxMaxFee: boolean,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    starkGateBridge(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    starkNetTBTCToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    tbtcToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    tbtcVault(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    transferOwnership(
      newOwner: string,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    updateFeeBuffer(
      newBuffer: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    updateGasOffsetParameters(
      _initializeDepositGasOffset: BigNumberish,
      _finalizeDepositGasOffset: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    updateL1ToL2MessageFee(
      newFee: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    updateReimbursementAuthorization(
      _address: string,
      authorization: boolean,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;

    updateReimbursementPool(
      _reimbursementPool: string,
      overrides?: Overrides & { from?: string | Promise<string> },
    ): Promise<PopulatedTransaction>;
  };
}
