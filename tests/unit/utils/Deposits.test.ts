import {
  getDepositId,
  createDeposit,
  updateToInitializedDeposit,
  updateToFinalizedDeposit,
  updateToAwaitingWormholeVAA,
  updateToBridgedDeposit,
  updateLastActivity,
  createPartialDepositFromOnChainData,
} from '../../../utils/Deposits.js';
import { ethers } from 'ethers';
import { type FundingTransaction } from '../../../types/FundingTransaction.type.js';
import { type Reveal } from '../../../types/Reveal.type.js';
import { DepositStatus } from '../../../types/DepositStatus.enum.js';
import { type Deposit } from '../../../types/Deposit.type.js';
import * as GetTransactionHash from '../../../utils/GetTransactionHash.js';
import * as AuditLog from '../../../utils/AuditLog.js';
import * as DepositStore from '../../../utils/DepositStore.js';
import logger from '../../../utils/Logger.js';

describe('Deposits Util', () => {
  describe('getDepositId', () => {
    it('should generate a unique deposit ID correctly', () => {
      const fundingTxHash = '0x' + 'a'.repeat(64); // 64 char hex string
      const fundingOutputIndex = 0;
      // Reverse the hash for expected value
      const reversedHash = '0x' + fundingTxHash.slice(2).match(/.{2}/g)!.reverse().join('');
      const expectedDepositId = ethers.BigNumber.from(
        ethers.utils.solidityKeccak256(['bytes32', 'uint32'], [reversedHash, fundingOutputIndex]),
      ).toString();

      const depositId = getDepositId(fundingTxHash, fundingOutputIndex);
      expect(depositId).toBe(expectedDepositId);
    });

    it('should match tBTC v2 test vector', () => {
      // Example from https://github.com/threshold-network/tbtc-v2/blob/f702144f/solidity/test/integration/FullFlow.test.ts
      const fundingTxHash = '0x6fc25b8ebd5fcfdf6de60c39dbaa46cfb0d0e792c671edac4112cabb11fb72c8';
      const fundingOutputIndex = 0;
      const reversedHash = '0x' + fundingTxHash.slice(2).match(/.{2}/g)!.reverse().join('');
      const expectedDepositId = ethers.BigNumber.from(
        ethers.utils.solidityKeccak256(['bytes32', 'uint32'], [reversedHash, fundingOutputIndex]),
      ).toString();
      const depositId = getDepositId(fundingTxHash, fundingOutputIndex);
      expect(depositId).toBe(expectedDepositId);
    });

    it('should match tBTC v2 test vector', () => {
      // Example from https://github.com/threshold-network/tbtc-v2/blob/f702144f/solidity/test/data/deposit-sweep.ts
      const fundingTxHash = '0xd32586237f6a832c3aa324bb83151e43e6cca2e4312d676f14dbbd6b1f04f468';
      const fundingOutputIndex = 0;
      const reversedHash = '0x' + fundingTxHash.slice(2).match(/.{2}/g)!.reverse().join('');
      const expectedDepositId = ethers.BigNumber.from(
        ethers.utils.solidityKeccak256(['bytes32', 'uint32'], [reversedHash, fundingOutputIndex]),
      ).toString();
      const depositId = getDepositId(fundingTxHash, fundingOutputIndex);
      expect(depositId).toBe(expectedDepositId);
    });

    it('should generate different deposit IDs for different output indexes', () => {
      const fundingTxHash = '0x' + 'a'.repeat(64);
      const fundingOutputIndex1 = 0;
      const fundingOutputIndex2 = 1;
      const depositId1 = getDepositId(fundingTxHash, fundingOutputIndex1);
      const depositId2 = getDepositId(fundingTxHash, fundingOutputIndex2);
      expect(depositId1).not.toBe(depositId2);
    });

    it('should generate different deposit IDs for different funding tx hashes', () => {
      const fundingTxHash1 = '0x' + 'a'.repeat(64);
      const fundingTxHash2 = '0x' + 'b'.repeat(64);
      const fundingOutputIndex = 0;
      const depositId1 = getDepositId(fundingTxHash1, fundingOutputIndex);
      const depositId2 = getDepositId(fundingTxHash2, fundingOutputIndex);
      expect(depositId1).not.toBe(depositId2);
    });

    it('should throw an error if fundingTxHash is not a 66-character hex string', () => {
      expect(() => getDepositId('invalid-hash', 0)).toThrow(
        'fundingTxHash must be a 66-character hex string (e.g. 0x...)',
      );
      expect(() => getDepositId('0x' + 'a'.repeat(63), 0)).toThrow(
        'fundingTxHash must be a 66-character hex string (e.g. 0x...)',
      );
      expect(() => getDepositId('0x' + 'a'.repeat(65), 0)).toThrow(
        'fundingTxHash must be a 66-character hex string (e.g. 0x...)',
      );
      expect(() => getDepositId('ax' + 'a'.repeat(64), 0)).toThrow(
        'fundingTxHash must be a 66-character hex string (e.g. 0x...)',
      );
    });
  });

  describe('createDeposit', () => {
    const mockFundingTx: FundingTransaction = {
      version: '1',
      inputVector: JSON.stringify([
        {
          prevout: { hash: '0x' + 'a'.repeat(64), index: 0 },
          scriptSig: '0x' + 'b'.repeat(100),
        },
      ]),
      outputVector: JSON.stringify([{ value: '100000000', scriptPubKey: '0x' + 'c'.repeat(50) }]),
      locktime: '0',
    };
    let mockReveal: Reveal;
    const mockL2DepositOwner = '0x' + 'e'.repeat(40);
    const mockL2Sender = '0x' + 'f'.repeat(40);
    const mockChainId = '1';
    const mockTimestamp = 1678886400000; // March 15, 2023 12:00:00 PM UTC

    let getTransactionHashSpy: jest.SpyInstance;
    let logDepositCreatedSpy: jest.SpyInstance;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      // Mock dependencies
      getTransactionHashSpy = jest
        .spyOn(GetTransactionHash, 'getTransactionHash')
        .mockReturnValue('a'.repeat(64)); // No 0x prefix
      logDepositCreatedSpy = jest.spyOn(AuditLog, 'logDepositCreated').mockImplementation();
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      // Define mockReveal here so it uses the mocked Date.now() for its refundLocktime
      mockReveal = {
        fundingOutputIndex: 0,
        blindingFactor: '0x' + 'b'.repeat(64),
        walletPubKeyHash: '0x' + 'c'.repeat(40),
        refundPubKeyHash: '0x' + 'd'.repeat(40),
        refundLocktime: BigInt(Math.floor(mockTimestamp / 1000) + 3600).toString(), // Use mockTimestamp
        vault: 'some_vault_address', // Added vault property as per Reveal type
      };
    });

    afterEach(() => {
      // Restore all mocks
      jest.restoreAllMocks();
    });

    it('should create a deposit object with correct structure and values when reveal is an array', () => {
      const deposit = createDeposit(
        mockFundingTx,
        mockReveal,
        mockL2DepositOwner,
        mockL2Sender,
        mockChainId,
      );

      const expectedFundingTxHash = '0x' + 'a'.repeat(64);
      const expectedDepositId = getDepositId(expectedFundingTxHash, mockReveal.fundingOutputIndex);

      expect(deposit.id).toBe(expectedDepositId);
      expect(deposit.chainId).toBe(mockChainId);
      expect(deposit.fundingTxHash).toBe(expectedFundingTxHash);
      expect(deposit.outputIndex).toBe(mockReveal.fundingOutputIndex);
      expect(deposit.hashes.btc.btcTxHash).toBe('a'.repeat(64));
      expect(deposit.hashes.eth.initializeTxHash).toBeNull();
      expect(deposit.hashes.eth.finalizeTxHash).toBeNull();
      expect(deposit.hashes.solana.bridgeTxHash).toBeNull();
      expect(deposit.receipt.depositor).toBe(mockL2Sender);
      expect(deposit.receipt.blindingFactor).toBe(mockReveal.blindingFactor);
      expect(deposit.receipt.walletPublicKeyHash).toBe(mockReveal.walletPubKeyHash);
      expect(deposit.receipt.refundPublicKeyHash).toBe(mockReveal.refundPubKeyHash);
      expect(deposit.receipt.refundLocktime).toBe(mockReveal.refundLocktime);
      expect(deposit.receipt.extraData).toBe(mockL2DepositOwner);
      expect(deposit.L1OutputEvent.fundingTx).toEqual(mockFundingTx);
      expect(deposit.L1OutputEvent.reveal).toEqual(mockReveal);
      expect(deposit.L1OutputEvent.l2DepositOwner).toBe(mockL2DepositOwner);
      expect(deposit.L1OutputEvent.l2Sender).toBe(mockL2Sender);
      expect(deposit.owner).toBe(mockL2DepositOwner);
      expect(deposit.status).toBe(DepositStatus.QUEUED);
      expect(deposit.dates.createdAt).toBe(mockTimestamp);
      expect(deposit.dates.initializationAt).toBeNull();
      expect(deposit.dates.finalizationAt).toBeNull();
      expect(deposit.dates.lastActivityAt).toBe(mockTimestamp);
      expect(deposit.dates.awaitingWormholeVAAMessageSince).toBeNull();
      expect(deposit.dates.bridgedAt).toBeNull();
      expect(deposit.wormholeInfo.txHash).toBeNull();
      expect(deposit.wormholeInfo.transferSequence).toBeNull();
      expect(deposit.wormholeInfo.bridgingAttempted).toBe(false);
      expect(deposit.error).toBeNull();

      // getFundingTxHash is no longer used in createDeposit
      // expect(getFundingTxHashSpy).toHaveBeenCalledWith(mockFundingTx);
      expect(getTransactionHashSpy).toHaveBeenCalledWith(mockFundingTx);
      expect(logDepositCreatedSpy).toHaveBeenCalledWith(deposit);
      expect(dateNowSpy.mock.calls.length).toBeGreaterThanOrEqual(2); // For createdAt and lastActivityAt
    });

    it('should handle reveal as an object', () => {
      // This test case is now redundant as createDeposit always expects an object.
      // However, we can keep it to ensure direct object passing works.
      const revealObject: Reveal = {
        fundingOutputIndex: 0,
        blindingFactor: '0xblinding',
        walletPubKeyHash: '0xwallet',
        refundPubKeyHash: '0xrefund',
        refundLocktime: '12345',
        vault: '0xvault',
      };

      const deposit = createDeposit(
        mockFundingTx,
        revealObject,
        mockL2DepositOwner,
        mockL2Sender,
        mockChainId,
      );
      expect(deposit.outputIndex).toBe(revealObject.fundingOutputIndex);
      expect(deposit.receipt.blindingFactor).toBe(revealObject.blindingFactor);
      expect(deposit.receipt.walletPublicKeyHash).toBe(revealObject.walletPubKeyHash);
      expect(deposit.receipt.refundPublicKeyHash).toBe(revealObject.refundPubKeyHash);
      expect(deposit.receipt.refundLocktime).toBe(revealObject.refundLocktime);
      expect(logDepositCreatedSpy).toHaveBeenCalledWith(deposit);
    });
  });

  describe('updateToFinalizedDeposit', () => {
    const minimalMockFundingTx: FundingTransaction = {
      version: '1',
      inputVector: '[]',
      outputVector: '[]',
      locktime: '0',
    };
    const minimalMockReveal: Reveal = {
      fundingOutputIndex: 0,
      blindingFactor: '0x0',
      walletPubKeyHash: '0x0',
      refundPubKeyHash: '0x0',
      refundLocktime: '0',
      vault: '0x0',
    };
    const mockL1OutputEvent = {
      fundingTx: minimalMockFundingTx,
      reveal: minimalMockReveal,
      l2DepositOwner: '0xowner_mock',
      l2Sender: '0xsender_mock',
    };
    const mockInitialDeposit: Deposit = {
      id: 'deposit_final_123',
      chainId: '1',
      fundingTxHash: '0x' + 'a'.repeat(64),
      outputIndex: 0,
      hashes: {
        btc: { btcTxHash: '0x' + 'a'.repeat(64) },
        eth: { initializeTxHash: '0x' + 'init'.padEnd(64, '0'), finalizeTxHash: null },
        solana: { bridgeTxHash: null },
      },
      receipt: {
        depositor: '0x' + 'f'.repeat(40),
        blindingFactor: '0x' + 'b'.repeat(64),
        walletPublicKeyHash: '0x' + 'c'.repeat(40),
        refundPublicKeyHash: '0x' + 'd'.repeat(40),
        refundLocktime: BigInt(1234567890).toString(),
        extraData: '0x' + 'e'.repeat(40),
      },
      L1OutputEvent: mockL1OutputEvent,
      owner: '0x' + 'e'.repeat(40),
      status: DepositStatus.INITIALIZED,
      dates: {
        createdAt: 1678886000000,
        initializationAt: 1678886100000,
        finalizationAt: null,
        lastActivityAt: 1678886100000,
        awaitingWormholeVAAMessageSince: null,
        bridgedAt: null,
      },
      wormholeInfo: { txHash: null, transferSequence: null, bridgingAttempted: false },
      error: null,
    };
    const mockTx = { hash: '0x' + 'final_tx'.padEnd(64, '0') };
    const mockTimestamp = 1678886400000;

    let depositStoreUpdateSpy: jest.SpyInstance;
    let loggerInfoSpy: jest.SpyInstance;
    let logStatusChangeSpy: jest.SpyInstance;
    let logDepositFinalizedSpy: jest.SpyInstance;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      depositStoreUpdateSpy = jest.spyOn(DepositStore.DepositStore, 'update').mockResolvedValue();
      loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation();
      logStatusChangeSpy = jest.spyOn(AuditLog, 'logStatusChange').mockImplementation();
      logDepositFinalizedSpy = jest.spyOn(AuditLog, 'logDepositFinalized').mockImplementation();
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update deposit to FINALIZED with tx hash and log correctly', async () => {
      const depositToUpdate = { ...mockInitialDeposit };
      await updateToFinalizedDeposit(depositToUpdate, mockTx);

      expect(dateNowSpy).toHaveBeenCalledTimes(2); // finalizationAt, lastActivityAt
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.FINALIZED,
        dates: {
          ...depositToUpdate.dates,
          finalizationAt: mockTimestamp,
          lastActivityAt: mockTimestamp,
        },
        hashes: {
          ...depositToUpdate.hashes,
          eth: {
            ...depositToUpdate.hashes.eth,
            finalizeTxHash: mockTx.hash,
          },
        },
        error: null,
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.FINALIZED,
        DepositStatus.INITIALIZED,
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Deposit state change: ${DepositStatus[DepositStatus.INITIALIZED]} → ${DepositStatus[DepositStatus.FINALIZED]}`,
      );
      expect(logDepositFinalizedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should update deposit error and lastActivityAt if error is provided and no tx', async () => {
      const depositToUpdate = { ...mockInitialDeposit, status: DepositStatus.QUEUED };
      const errorMessage = 'Finalization failed';
      await updateToFinalizedDeposit(depositToUpdate, undefined, errorMessage);

      expect(dateNowSpy).toHaveBeenCalledTimes(1); // Only for lastActivityAt
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.QUEUED,
        dates: {
          ...depositToUpdate.dates,
          finalizationAt: null,
          lastActivityAt: mockTimestamp,
        },
        hashes: {
          ...depositToUpdate.hashes,
          eth: {
            ...depositToUpdate.hashes.eth,
            finalizeTxHash: null,
          },
        },
        error: errorMessage,
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(logDepositFinalizedSpy).not.toHaveBeenCalled();
    });

    it('should correctly update hash, dates, and logs if status is already FINALIZED and a new tx is provided', async () => {
      const depositAlreadyFinalized: Deposit = {
        ...mockInitialDeposit,
        status: DepositStatus.FINALIZED,
        dates: { ...mockInitialDeposit.dates, finalizationAt: mockTimestamp - 1000 },
        hashes: {
          ...mockInitialDeposit.hashes,
          eth: {
            ...mockInitialDeposit.hashes.eth,
            finalizeTxHash: '0xalready_finalized'.padEnd(64, '0'),
          },
        },
      };
      const newMockTx = { hash: '0x' + 'new_final_tx'.padEnd(64, '0') };

      await updateToFinalizedDeposit(depositAlreadyFinalized, newMockTx);

      expect(dateNowSpy).toHaveBeenCalledTimes(2);
      const expectedUpdatedDeposit: Deposit = {
        ...depositAlreadyFinalized,
        status: DepositStatus.FINALIZED,
        dates: {
          ...depositAlreadyFinalized.dates,
          finalizationAt: mockTimestamp,
          lastActivityAt: mockTimestamp,
        },
        hashes: {
          ...depositAlreadyFinalized.hashes,
          eth: {
            ...depositAlreadyFinalized.hashes.eth,
            finalizeTxHash: newMockTx.hash,
          },
        },
        error: null,
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      // When status is already FINALIZED, no "Deposit state change" log is emitted
      expect(logDepositFinalizedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should update only lastActivityAt if no tx and no error are provided', async () => {
      const depositToUpdate = { ...mockInitialDeposit, status: DepositStatus.INITIALIZED };
      await updateToFinalizedDeposit(depositToUpdate, undefined, undefined);

      expect(dateNowSpy).toHaveBeenCalledTimes(1);
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.INITIALIZED,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
        },
        error: null,
      };
      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(logDepositFinalizedSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateToInitializedDeposit', () => {
    const minimalMockFundingTx: FundingTransaction = {
      version: '1',
      inputVector: '[]',
      outputVector: '[]',
      locktime: '0',
    };
    const minimalMockReveal: Reveal = {
      fundingOutputIndex: 0,
      blindingFactor: '0x0',
      walletPubKeyHash: '0x0',
      refundPubKeyHash: '0x0',
      refundLocktime: '0',
      vault: '0x0',
    };
    const mockL1OutputEvent = {
      fundingTx: minimalMockFundingTx,
      reveal: minimalMockReveal,
      l2DepositOwner: '0xowner_mock',
      l2Sender: '0xsender_mock',
    };
    const mockInitialDeposit: Deposit = {
      id: 'deposit_123',
      chainId: '1',
      fundingTxHash: '0x' + 'a'.repeat(64),
      outputIndex: 0,
      hashes: {
        btc: { btcTxHash: '0x' + 'a'.repeat(64) },
        eth: { initializeTxHash: null, finalizeTxHash: null },
        solana: { bridgeTxHash: null },
      },
      receipt: {
        depositor: '0x' + 'f'.repeat(40),
        blindingFactor: '0x' + 'b'.repeat(64),
        walletPublicKeyHash: '0x' + 'c'.repeat(40),
        refundPublicKeyHash: '0x' + 'd'.repeat(40),
        refundLocktime: BigInt(1234567890).toString(),
        extraData: '0x' + 'e'.repeat(40),
      },
      L1OutputEvent: mockL1OutputEvent,
      owner: '0x' + 'e'.repeat(40),
      status: DepositStatus.QUEUED,
      dates: {
        createdAt: 1678886000000,
        initializationAt: null,
        finalizationAt: null,
        lastActivityAt: 1678886000000,
        awaitingWormholeVAAMessageSince: null,
        bridgedAt: null,
      },
      wormholeInfo: {
        txHash: null,
        transferSequence: null,
        bridgingAttempted: false,
      },
      error: null,
    };
    const mockTx = { hash: '0x' + 'init_tx'.padEnd(64, '0') };
    const mockTimestamp = 1678886400000;

    let depositStoreUpdateSpy: jest.SpyInstance;
    let loggerInfoSpy: jest.SpyInstance;
    let logStatusChangeSpy: jest.SpyInstance;
    let logDepositInitializedSpy: jest.SpyInstance;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      depositStoreUpdateSpy = jest.spyOn(DepositStore.DepositStore, 'update').mockResolvedValue();
      loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation();
      logStatusChangeSpy = jest.spyOn(AuditLog, 'logStatusChange').mockImplementation();
      logDepositInitializedSpy = jest.spyOn(AuditLog, 'logDepositInitialized').mockImplementation();
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update deposit to INITIALIZED with tx hash and log correctly', async () => {
      const depositToUpdate = { ...mockInitialDeposit };
      await updateToInitializedDeposit(depositToUpdate, mockTx);

      expect(dateNowSpy).toHaveBeenCalledTimes(2);
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.INITIALIZED,
        dates: {
          ...depositToUpdate.dates,
          initializationAt: mockTimestamp,
          lastActivityAt: mockTimestamp,
        },
        hashes: {
          ...depositToUpdate.hashes,
          eth: {
            ...depositToUpdate.hashes.eth,
            initializeTxHash: mockTx.hash,
          },
        },
        error: null,
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.INITIALIZED,
        DepositStatus.QUEUED,
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Deposit state change: ${DepositStatus[DepositStatus.QUEUED]} → ${DepositStatus[DepositStatus.INITIALIZED]}`,
      );
      expect(logDepositInitializedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should update deposit error and lastActivityAt if error is provided and no tx is given', async () => {
      const depositToUpdate = {
        ...mockInitialDeposit,
        status: DepositStatus.QUEUED,
      };
      const errorMessage = 'Initialization failed';
      await updateToInitializedDeposit(depositToUpdate, undefined, errorMessage);

      expect(dateNowSpy).toHaveBeenCalledTimes(1); // Only for lastActivityAt
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.QUEUED,
        dates: {
          ...depositToUpdate.dates,
          initializationAt: null,
          lastActivityAt: mockTimestamp,
        },
        hashes: {
          ...depositToUpdate.hashes,
          eth: {
            ...depositToUpdate.hashes.eth,
            initializeTxHash: null,
          },
        },
        error: errorMessage,
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(logDepositInitializedSpy).not.toHaveBeenCalled();
    });

    it('should correctly update hash, dates, and logs if status is already INITIALIZED and a new tx is provided', async () => {
      const mockInitialDepositAlreadyInitialized: Deposit = {
        id: 'deposit_456',
        chainId: '1',
        fundingTxHash: '0x' + 'a'.repeat(64),
        outputIndex: 0,
        hashes: {
          btc: { btcTxHash: '0x' + 'a'.repeat(64) },
          eth: { initializeTxHash: '0xalready_set'.padEnd(64, '0'), finalizeTxHash: null },
          solana: { bridgeTxHash: null },
        },
        receipt: {
          depositor: '0x' + 'f'.repeat(40),
          blindingFactor: '0x' + 'b'.repeat(64),
          walletPublicKeyHash: '0x' + 'c'.repeat(40),
          refundPublicKeyHash: '0x' + 'd'.repeat(40),
          refundLocktime: BigInt(1234567890).toString(),
          extraData: '0x' + 'e'.repeat(40),
        },
        L1OutputEvent: mockL1OutputEvent,
        owner: '0x' + 'e'.repeat(40),
        status: DepositStatus.INITIALIZED,
        dates: {
          createdAt: 1678885000000,
          initializationAt: mockTimestamp - 1000,
          finalizationAt: null,
          lastActivityAt: mockTimestamp - 1000,
          awaitingWormholeVAAMessageSince: null,
          bridgedAt: null,
        },
        wormholeInfo: {
          txHash: null,
          transferSequence: null,
          bridgingAttempted: false,
        },
        error: null,
      };
      const depositToUpdate = { ...mockInitialDepositAlreadyInitialized };
      const newMockTx = { hash: '0x' + 'new_init_tx'.padEnd(64, '0') };

      await updateToInitializedDeposit(depositToUpdate, newMockTx);

      expect(dateNowSpy).toHaveBeenCalledTimes(2); // initializationAt, lastActivityAt
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.INITIALIZED,
        dates: {
          ...depositToUpdate.dates,
          initializationAt: mockTimestamp,
          lastActivityAt: mockTimestamp,
        },
        hashes: {
          ...depositToUpdate.hashes,
          eth: {
            ...depositToUpdate.hashes.eth,
            initializeTxHash: newMockTx.hash,
          },
        },
        error: null,
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      // When status is already INITIALIZED, no "Deposit state change" log is emitted
      expect(logDepositInitializedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should set error and update lastActivityAt if error is provided, even if already INITIALIZED', async () => {
      const mockInitializedDepositWithError: Deposit = {
        id: 'deposit_789',
        chainId: '1',
        fundingTxHash: '0x' + 'a'.repeat(64),
        outputIndex: 0,
        hashes: {
          btc: { btcTxHash: '0x' + 'a'.repeat(64) },
          eth: { initializeTxHash: '0xexisting_hash'.padEnd(64, '0'), finalizeTxHash: null },
          solana: { bridgeTxHash: null },
        },
        receipt: {
          depositor: '0x' + 'f'.repeat(40),
          blindingFactor: '0x' + 'b'.repeat(64),
          walletPublicKeyHash: '0x' + 'c'.repeat(40),
          refundPublicKeyHash: '0x' + 'd'.repeat(40),
          refundLocktime: BigInt(1234567890).toString(),
          extraData: '0x' + 'e'.repeat(40),
        },
        L1OutputEvent: mockL1OutputEvent,
        owner: '0x' + 'e'.repeat(40),
        status: DepositStatus.INITIALIZED,
        dates: {
          createdAt: 1678885000000,
          initializationAt: mockTimestamp - 1000,
          finalizationAt: null,
          lastActivityAt: mockTimestamp - 1000,
          awaitingWormholeVAAMessageSince: null,
          bridgedAt: null,
        },
        wormholeInfo: {
          txHash: null,
          transferSequence: null,
          bridgingAttempted: false,
        },
        error: null,
      };
      const depositToUpdate = { ...mockInitializedDepositWithError };
      const errorMessage = 'Post-initialization error';

      await updateToInitializedDeposit(depositToUpdate, undefined, errorMessage);
      expect(dateNowSpy).toHaveBeenCalledTimes(1); // lastActivityAt

      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.INITIALIZED,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
        },
        error: errorMessage,
      };
      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(logDepositInitializedSpy).not.toHaveBeenCalled();
    });

    it('should update only lastActivityAt if no tx and no error are provided', async () => {
      const initialDeposit: Deposit = {
        id: 'deposit-1',
        chainId: '1',
        status: DepositStatus.INITIALIZED,
        dates: {
          createdAt: mockTimestamp - 10000,
          initializationAt: mockTimestamp - 5000,
          finalizationAt: null,
          lastActivityAt: mockTimestamp - 5000,
          awaitingWormholeVAAMessageSince: null,
          bridgedAt: null,
        },
        hashes: { eth: {}, btc: {}, solana: {} } as any,
        L1OutputEvent: {} as any,
        receipt: {} as any,
        owner: 'owner',
        fundingTxHash: 'hash',
        outputIndex: 0,
        wormholeInfo: { txHash: null, transferSequence: null, bridgingAttempted: false },
        error: 'some pre-existing error',
      };

      const expectedUpdatedDeposit: Deposit = {
        ...initialDeposit,
        dates: {
          ...initialDeposit.dates,
          lastActivityAt: mockTimestamp,
        },
        error: null,
      };
      await updateToInitializedDeposit(initialDeposit);
      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(logDepositInitializedSpy).not.toHaveBeenCalled();

      const initialDepositWithoutError: Deposit = {
        ...initialDeposit,
        error: null,
      };
      const expectedUpdatedDepositWithoutError: Deposit = {
        ...initialDepositWithoutError,
        dates: {
          ...initialDepositWithoutError.dates,
          lastActivityAt: mockTimestamp,
        },
      };
      await updateToInitializedDeposit(initialDepositWithoutError);
      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDepositWithoutError);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateToAwaitingWormholeVAA', () => {
    const minimalMockFundingTx: FundingTransaction = {
      version: '1',
      inputVector: '[]',
      outputVector: '[]',
      locktime: '0',
    };
    const minimalMockReveal: Reveal = {
      fundingOutputIndex: 0,
      blindingFactor: '0x0',
      walletPubKeyHash: '0x0',
      refundPubKeyHash: '0x0',
      refundLocktime: '0',
      vault: '0x0',
    };
    const mockL1OutputEvent = {
      fundingTx: minimalMockFundingTx,
      reveal: minimalMockReveal,
      l2DepositOwner: '0xowner_mock',
      l2Sender: '0xsender_mock',
    };
    const mockInitialDepositBase: Deposit = {
      id: 'deposit_wormhole_123',
      chainId: 'solana-1',
      fundingTxHash: '0x' + 'a'.repeat(64),
      outputIndex: 0,
      hashes: {
        btc: { btcTxHash: '0x' + 'a'.repeat(64) },
        eth: {
          initializeTxHash: '0xinit'.padEnd(64, '0'),
          finalizeTxHash: '0xfinal'.padEnd(64, '0'),
        },
        solana: { bridgeTxHash: null },
      },
      receipt: {
        depositor: '0xsender',
        blindingFactor: '0xblind',
        walletPublicKeyHash: '0xwallet',
        refundPublicKeyHash: '0xrefund',
        refundLocktime: BigInt(123).toString(),
        extraData: '0xextra',
      },
      L1OutputEvent: mockL1OutputEvent,
      owner: '0xowner',
      status: DepositStatus.FINALIZED,
      dates: {
        createdAt: 1678886000000,
        initializationAt: 1678886100000,
        finalizationAt: 1678886200000,
        lastActivityAt: 1678886200000,
        awaitingWormholeVAAMessageSince: null,
        bridgedAt: null,
      },
      wormholeInfo: { txHash: null, transferSequence: null, bridgingAttempted: false },
      error: 'some previous error',
    };
    const mockWormholeTxHash = '0x' + 'wormhole_tx_hash'.padEnd(64, '0');
    const mockTransferSequence = '12345';
    const mockTimestamp = 1678886400000;

    let depositStoreUpdateSpy: jest.SpyInstance;
    let loggerInfoSpy: jest.SpyInstance;
    let logStatusChangeSpy: jest.SpyInstance;
    let logDepositAwaitingWormholeVAASpy: jest.SpyInstance;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      depositStoreUpdateSpy = jest.spyOn(DepositStore.DepositStore, 'update').mockResolvedValue();
      loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation();
      logStatusChangeSpy = jest.spyOn(AuditLog, 'logStatusChange').mockImplementation();
      logDepositAwaitingWormholeVAASpy = jest
        .spyOn(AuditLog, 'logDepositAwaitingWormholeVAA')
        .mockImplementation();
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update deposit to AWAITING_WORMHOLE_VAA, set wormholeInfo, clear error, and log correctly', async () => {
      const depositToUpdate = JSON.parse(JSON.stringify(mockInitialDepositBase)); // Deep copy

      await updateToAwaitingWormholeVAA(mockWormholeTxHash, depositToUpdate, mockTransferSequence);

      expect(dateNowSpy).toHaveBeenCalledTimes(2); // awaitingWormholeVAAMessageSince, lastActivityAt
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.AWAITING_WORMHOLE_VAA,
        wormholeInfo: {
          txHash: mockWormholeTxHash,
          transferSequence: mockTransferSequence,
          bridgingAttempted: false,
        },
        error: null,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
          awaitingWormholeVAAMessageSince: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.AWAITING_WORMHOLE_VAA,
        DepositStatus.FINALIZED,
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Deposit state change: ${DepositStatus[DepositStatus.FINALIZED]} → ${DepositStatus[DepositStatus.AWAITING_WORMHOLE_VAA]}`,
      );
      expect(logDepositAwaitingWormholeVAASpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should set bridgingAttempted to true if provided', async () => {
      const depositToUpdate = JSON.parse(JSON.stringify(mockInitialDepositBase));
      await updateToAwaitingWormholeVAA(
        mockWormholeTxHash,
        depositToUpdate,
        mockTransferSequence,
        true,
      );

      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.AWAITING_WORMHOLE_VAA,
        wormholeInfo: {
          txHash: mockWormholeTxHash,
          transferSequence: mockTransferSequence,
          bridgingAttempted: true,
        },
        error: null,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
          awaitingWormholeVAAMessageSince: mockTimestamp,
        },
      };
      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.AWAITING_WORMHOLE_VAA,
        DepositStatus.FINALIZED,
      );
      expect(logDepositAwaitingWormholeVAASpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should not call logStatusChange if status is already AWAITING_WORMHOLE_VAA, but still update info', async () => {
      const alreadyAwaitingDeposit: Deposit = {
        ...mockInitialDepositBase,
        status: DepositStatus.AWAITING_WORMHOLE_VAA,
        wormholeInfo: {
          txHash: '0xold_hash'.padEnd(64, '0'),
          transferSequence: 'old_seq',
          bridgingAttempted: false,
        },
        dates: {
          ...mockInitialDepositBase.dates,
          awaitingWormholeVAAMessageSince: mockTimestamp - 1000,
          lastActivityAt: mockTimestamp - 1000,
        },
        error: null,
      };
      const depositToUpdate = JSON.parse(JSON.stringify(alreadyAwaitingDeposit));
      const newWormholeTxHash = '0x' + 'new_wormhole_tx'.padEnd(64, '0');
      const newTransferSequence = '67890';

      await updateToAwaitingWormholeVAA(
        newWormholeTxHash,
        depositToUpdate,
        newTransferSequence,
        true,
      );

      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.AWAITING_WORMHOLE_VAA,
        wormholeInfo: {
          txHash: newWormholeTxHash,
          transferSequence: newTransferSequence,
          bridgingAttempted: true,
        },
        error: null,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
          awaitingWormholeVAAMessageSince: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      // When status is already AWAITING_WORMHOLE_VAA, no "Deposit state change" log is emitted
      expect(logDepositAwaitingWormholeVAASpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });
  });

  describe('updateToBridgedDeposit', () => {
    const minimalMockFundingTx: FundingTransaction = {
      version: '1',
      inputVector: '[]',
      outputVector: '[]',
      locktime: '0',
    };
    const minimalMockReveal: Reveal = {
      fundingOutputIndex: 0,
      blindingFactor: '0x0',
      walletPubKeyHash: '0x0',
      refundPubKeyHash: '0x0',
      refundLocktime: '0',
      vault: '0x0',
    };
    const mockL1OutputEvent = {
      fundingTx: minimalMockFundingTx,
      reveal: minimalMockReveal,
      l2DepositOwner: '0xowner_mock',
      l2Sender: '0xsender_mock',
    };
    const mockInitialDeposit: Deposit = {
      id: 'deposit_bridged_123',
      chainId: 'solana-1',
      fundingTxHash: '0x' + 'a'.repeat(64),
      outputIndex: 0,
      hashes: {
        btc: { btcTxHash: '0x' + 'a'.repeat(64) },
        eth: { initializeTxHash: '0xinit', finalizeTxHash: '0xfinal' },
        solana: { bridgeTxHash: null },
      },
      receipt: {
        depositor: '0xsender',
        blindingFactor: '0xblind',
        walletPublicKeyHash: '0xwallet',
        refundPublicKeyHash: '0xrefund',
        refundLocktime: BigInt(123).toString(),
        extraData: '0xextra',
      },
      L1OutputEvent: mockL1OutputEvent,
      owner: '0xowner',
      status: DepositStatus.AWAITING_WORMHOLE_VAA,
      dates: {
        createdAt: 1678886000000,
        initializationAt: 1678886100000,
        finalizationAt: 1678886200000,
        lastActivityAt: 1678886300000,
        awaitingWormholeVAAMessageSince: 1678886300000,
        bridgedAt: null,
      },
      wormholeInfo: {
        txHash: '0xwormhole_tx',
        transferSequence: '12345',
        bridgingAttempted: false,
      },
      error: 'some pre-bridge error',
    };
    const mockSolanaTxSignature = 'solana_tx_signature_' + 'S'.repeat(50);
    const mockTimestamp = 1678886400000;

    let depositStoreUpdateSpy: jest.SpyInstance;
    let loggerInfoSpy: jest.SpyInstance;
    let logStatusChangeSpy: jest.SpyInstance;
    let logDepositBridgedSpy: jest.SpyInstance;
    let dateNowSpy: jest.SpyInstance;
    let loggerWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      depositStoreUpdateSpy = jest.spyOn(DepositStore.DepositStore, 'update').mockResolvedValue();
      loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation();
      logStatusChangeSpy = jest.spyOn(AuditLog, 'logStatusChange').mockImplementation();
      logDepositBridgedSpy = jest.spyOn(AuditLog, 'logDepositBridged').mockImplementation();
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update deposit to BRIDGED, set Solana tx hash, update wormholeInfo, clear error, and log correctly', async () => {
      const depositToUpdate = JSON.parse(JSON.stringify(mockInitialDeposit));

      await updateToBridgedDeposit(depositToUpdate, mockSolanaTxSignature);

      expect(dateNowSpy).toHaveBeenCalledTimes(2);
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.BRIDGED,
        hashes: {
          ...depositToUpdate.hashes,
          solana: {
            bridgeTxHash: mockSolanaTxSignature,
          },
        },
        wormholeInfo: {
          ...depositToUpdate.wormholeInfo,
          bridgingAttempted: true,
        },
        error: null,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
          bridgedAt: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.BRIDGED,
        DepositStatus.AWAITING_WORMHOLE_VAA,
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Deposit state change: ${DepositStatus[DepositStatus.AWAITING_WORMHOLE_VAA]} → ${DepositStatus[DepositStatus.BRIDGED]}`,
      );
      expect(logDepositBridgedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should not call logStatusChange if status is already BRIDGED, but still update info', async () => {
      const alreadyBridgedDeposit: Deposit = {
        ...mockInitialDeposit,
        status: DepositStatus.BRIDGED,
        hashes: { ...mockInitialDeposit.hashes, solana: { bridgeTxHash: 'old_sig' } },
        wormholeInfo: { ...mockInitialDeposit.wormholeInfo, bridgingAttempted: true },
        dates: {
          ...mockInitialDeposit.dates,
          bridgedAt: mockTimestamp - 1000,
          lastActivityAt: mockTimestamp - 1000,
        },
        error: null,
      };
      const depositToUpdate = JSON.parse(JSON.stringify(alreadyBridgedDeposit));
      const newSolanaTxSignature = 'new_solana_tx_signature_' + 'N'.repeat(48);

      await updateToBridgedDeposit(depositToUpdate, newSolanaTxSignature);

      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        status: DepositStatus.BRIDGED,
        hashes: {
          ...depositToUpdate.hashes,
          solana: { bridgeTxHash: newSolanaTxSignature },
        },
        wormholeInfo: {
          ...depositToUpdate.wormholeInfo,
          bridgingAttempted: true,
        },
        error: null,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
          bridgedAt: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(logStatusChangeSpy).not.toHaveBeenCalled();
      // When status is already BRIDGED, no "Deposit state change" log is emitted
      expect(logDepositBridgedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should update deposit to BRIDGED and set SUI tx hash for SUI chains', async () => {
      // Create a SUI-specific deposit
      const suiDeposit: Deposit = {
        ...mockInitialDeposit,
        chainId: 'SuiTestnet', // SUI chain identifier
        hashes: {
          ...mockInitialDeposit.hashes,
          sui: { l2BridgeTxHash: null }, // Add SUI hash structure
        },
      };
      const mockSuiTxSignature = 'sui_tx_digest_' + 'S'.repeat(50);

      await updateToBridgedDeposit(suiDeposit, mockSuiTxSignature);

      expect(dateNowSpy).toHaveBeenCalledTimes(2); // lastActivityAt and bridgedAt
      const expectedUpdatedDeposit: Deposit = {
        ...suiDeposit,
        status: DepositStatus.BRIDGED,
        wormholeInfo: {
          ...suiDeposit.wormholeInfo,
          bridgingAttempted: true,
        },
        hashes: {
          ...suiDeposit.hashes,
          sui: {
            l2BridgeTxHash: mockSuiTxSignature,
          },
        },
        error: null,
        dates: {
          ...suiDeposit.dates,
          lastActivityAt: mockTimestamp,
          bridgedAt: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Deposit state change: ${DepositStatus[DepositStatus.AWAITING_WORMHOLE_VAA]} → ${DepositStatus[DepositStatus.BRIDGED]}`,
      );
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.BRIDGED,
        DepositStatus.AWAITING_WORMHOLE_VAA,
      );
      expect(logDepositBridgedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
    });

    it('should default to Solana when chain detection is ambiguous', async () => {
      // Create a deposit with non-obvious chain ID
      const ambiguousDeposit: Deposit = {
        ...mockInitialDeposit,
        chainId: 'CustomChain', // Non-SUI, non-Solana chain
      };
      const mockTxSignature = 'ambiguous_tx_' + 'A'.repeat(50);

      await updateToBridgedDeposit(ambiguousDeposit, mockTxSignature);

      expect(dateNowSpy).toHaveBeenCalledTimes(2);
      const expectedUpdatedDeposit: Deposit = {
        ...ambiguousDeposit,
        status: DepositStatus.BRIDGED,
        wormholeInfo: {
          ...ambiguousDeposit.wormholeInfo,
          bridgingAttempted: true,
        },
        hashes: {
          ...ambiguousDeposit.hashes,
          solana: {
            bridgeTxHash: mockTxSignature, // Should default to Solana
          },
        },
        error: null,
        dates: {
          ...ambiguousDeposit.dates,
          lastActivityAt: mockTimestamp,
          bridgedAt: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Deposit state change: ${DepositStatus[DepositStatus.AWAITING_WORMHOLE_VAA]} → ${DepositStatus[DepositStatus.BRIDGED]}`,
      );
      expect(logStatusChangeSpy).toHaveBeenCalledWith(
        expectedUpdatedDeposit,
        DepositStatus.BRIDGED,
        DepositStatus.AWAITING_WORMHOLE_VAA,
      );
      expect(logDepositBridgedSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `[updateToBridgedDeposit] Unknown chainId: ${ambiguousDeposit.chainId}. Defaulting to Solana hash structure for backward compatibility.`,
      );
    });
  });

  describe('updateLastActivity', () => {
    const minimalMockFundingTx: FundingTransaction = {
      version: '1',
      inputVector: '[]',
      outputVector: '[]',
      locktime: '0',
    };
    const minimalMockReveal: Reveal = {
      fundingOutputIndex: 0,
      blindingFactor: '0x0',
      walletPubKeyHash: '0x0',
      refundPubKeyHash: '0x0',
      refundLocktime: '0',
      vault: '0x0',
    };
    const mockL1OutputEvent = {
      fundingTx: minimalMockFundingTx,
      reveal: minimalMockReveal,
      l2DepositOwner: '0xowner_mock',
      l2Sender: '0xsender_mock',
    };
    const mockInitialDeposit: Deposit = {
      id: 'deposit_activity_123',
      chainId: '1',
      fundingTxHash: '0x' + 'a'.repeat(64),
      outputIndex: 0,
      hashes: {
        btc: { btcTxHash: '0x' + 'a'.repeat(64) },
        eth: { initializeTxHash: null, finalizeTxHash: null },
        solana: { bridgeTxHash: null },
      },
      receipt: {
        depositor: '0xsender',
        blindingFactor: '0xblind',
        walletPublicKeyHash: '0xwallet',
        refundPublicKeyHash: '0xrefund',
        refundLocktime: BigInt(123).toString(),
        extraData: '0xextra',
      },
      L1OutputEvent: mockL1OutputEvent,
      owner: '0xowner',
      status: DepositStatus.QUEUED,
      dates: {
        createdAt: 1678886000000,
        initializationAt: null,
        finalizationAt: null,
        lastActivityAt: 1678886000000,
        awaitingWormholeVAAMessageSince: null,
        bridgedAt: null,
      },
      wormholeInfo: { txHash: null, transferSequence: null, bridgingAttempted: false },
      error: null,
    };
    const mockTimestamp = 1678886400000;

    let depositStoreUpdateSpy: jest.SpyInstance;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      depositStoreUpdateSpy = jest.spyOn(DepositStore.DepositStore, 'update').mockResolvedValue();
      dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update only the lastActivityAt timestamp and call DepositStore.update', async () => {
      const depositToUpdate = JSON.parse(JSON.stringify(mockInitialDeposit));

      const returnedDeposit = await updateLastActivity(depositToUpdate);

      expect(dateNowSpy).toHaveBeenCalledTimes(1);

      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(returnedDeposit).toEqual(expectedUpdatedDeposit);
    });

    it('should correctly update lastActivityAt even if other date fields are populated', async () => {
      const complexDeposit: Deposit = {
        ...mockInitialDeposit,
        dates: {
          createdAt: 1678880000000,
          initializationAt: 1678881000000,
          finalizationAt: 1678882000000,
          lastActivityAt: 1678883000000,
          awaitingWormholeVAAMessageSince: 1678884000000,
          bridgedAt: 1678885000000,
        },
      };
      const depositToUpdate = JSON.parse(JSON.stringify(complexDeposit));

      const returnedDeposit = await updateLastActivity(depositToUpdate);

      expect(dateNowSpy).toHaveBeenCalledTimes(1);
      const expectedUpdatedDeposit: Deposit = {
        ...depositToUpdate,
        dates: {
          ...depositToUpdate.dates,
          lastActivityAt: mockTimestamp,
        },
      };

      expect(depositStoreUpdateSpy).toHaveBeenCalledWith(expectedUpdatedDeposit);
      expect(returnedDeposit).toEqual(expectedUpdatedDeposit);
      expect(returnedDeposit.dates.createdAt).toBe(complexDeposit.dates.createdAt);
      expect(returnedDeposit.dates.initializationAt).toBe(complexDeposit.dates.initializationAt);
      expect(returnedDeposit.dates.finalizationAt).toBe(complexDeposit.dates.finalizationAt);
      expect(returnedDeposit.dates.awaitingWormholeVAAMessageSince).toBe(
        complexDeposit.dates.awaitingWormholeVAAMessageSince,
      );
      expect(returnedDeposit.dates.bridgedAt).toBe(complexDeposit.dates.bridgedAt);
    });
  });
});

describe('createPartialDepositFromOnChainData', () => {
  const mockDepositId =
    '36798305888235649988225211365882253459035954999386348233314415494390505703047';
  const mockL1Sender = '0x' + 'f'.repeat(40);
  const mockChainName = 'StarkNetTestnet';
  const mockInitializeTxHash = '0x' + 'init_tx'.padEnd(64, '0');
  const mockTimestamp = 1678886400000; // March 15, 2023 12:00:00 PM UTC

  let dateNowSpy: jest.SpyInstance;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a partial deposit object with correct structure and values', () => {
    const deposit = createPartialDepositFromOnChainData(
      mockDepositId,
      mockL1Sender,
      mockChainName,
      mockInitializeTxHash,
    );

    expect(deposit.id).toBe(mockDepositId);
    expect(deposit.chainId).toBe(mockChainName);
    expect(deposit.fundingTxHash).toBeNull();
    expect(deposit.outputIndex).toBeNull();
    expect(deposit.status).toBe(DepositStatus.INITIALIZED);
    expect(deposit.owner).toBe(mockL1Sender);

    expect(deposit.hashes.btc.btcTxHash).toBeNull();
    expect(deposit.hashes.eth.initializeTxHash).toBe(mockInitializeTxHash);
    expect(deposit.hashes.eth.finalizeTxHash).toBeNull();

    expect(deposit.dates.createdAt).toBe(mockTimestamp);
    expect(deposit.dates.initializationAt).toBe(mockTimestamp);
    expect(deposit.dates.lastActivityAt).toBe(mockTimestamp);
    expect(deposit.dates.finalizationAt).toBeNull();
  });
});
