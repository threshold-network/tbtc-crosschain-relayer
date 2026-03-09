import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  AuditEventType,
  appendToAuditLog,
  getAuditLogs,
  getAuditLogsByDepositId,
  logDepositCreated,
  logStatusChange,
  logDepositInitialized,
  logDepositFinalized,
  logDepositDeleted,
  logApiRequest,
  logDepositError,
} from '../../../utils/AuditLog.js';
import { prisma } from '../../../utils/prisma.js';
import { DepositStatus as DepositStatusEnum } from '../../../types/DepositStatus.enum.js';

const testDeposit = {
  id: 'test-id',
  fundingTxHash: '0xfundingtxhash',
  outputIndex: 0,
  hashes: { btc: { btcTxHash: '0xbtc' }, eth: { initializeTxHash: null, finalizeTxHash: null } },
  receipt: {
    depositor: '0xdepositor',
    blindingFactor: '0xblinding',
    walletPublicKeyHash: '0xwallet',
    refundPublicKeyHash: '0xrefund',
    refundLocktime: '0xlock',
    extraData: '0xextra',
  },
  owner: '0xowner',
  status: DepositStatusEnum.QUEUED,
  L1OutputEvent: undefined,
  dates: {
    createdAt: Date.now(),
    initializationAt: null,
    finalizationAt: null,
    lastActivityAt: Date.now(),
  },
  error: null,
};

describe('AuditLog', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });
  afterEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  test('appendToAuditLog writes entry to DB', async () => {
    await appendToAuditLog(AuditEventType.DEPOSIT_CREATED, testDeposit.id, { foo: 'bar' });
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.DEPOSIT_CREATED);
    expect(logs[0].data).toMatchObject({ foo: 'bar' });
  });

  test('getAuditLogs returns all logs', async () => {
    await appendToAuditLog(AuditEventType.DEPOSIT_CREATED, testDeposit.id, { foo: 1 });
    await appendToAuditLog(AuditEventType.DEPOSIT_FINALIZED, testDeposit.id, { foo: 2 });
    const logs = await getAuditLogs();
    expect(logs.length).toBe(2);
    expect(logs.map((l: any) => l.eventType)).toContain(AuditEventType.DEPOSIT_CREATED);
    expect(logs.map((l: any) => l.eventType)).toContain(AuditEventType.DEPOSIT_FINALIZED);
  });

  test('getAuditLogsByDepositId returns only relevant logs', async () => {
    await appendToAuditLog(AuditEventType.DEPOSIT_CREATED, testDeposit.id, { foo: 1 });
    await appendToAuditLog(AuditEventType.DEPOSIT_FINALIZED, 'other-id', { foo: 2 });
    const logs = await getAuditLogsByDepositId(testDeposit.id);
    expect(logs.length).toBe(1);
    expect(logs[0].depositId).toBe(testDeposit.id);
  });

  test('logDepositCreated writes correct event', async () => {
    await logDepositCreated(testDeposit as any);
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.DEPOSIT_CREATED);
  });

  test('logStatusChange writes correct event', async () => {
    await logStatusChange(
      testDeposit as any,
      DepositStatusEnum.INITIALIZED,
      DepositStatusEnum.QUEUED,
    );
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.STATUS_CHANGED);
  });

  test('logDepositInitialized writes correct event', async () => {
    await logDepositInitialized(testDeposit as any);
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.DEPOSIT_INITIALIZED);
  });

  test('logDepositFinalized writes correct event', async () => {
    await logDepositFinalized(testDeposit as any);
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.DEPOSIT_FINALIZED);
  });

  test('logDepositDeleted writes correct event', async () => {
    await logDepositDeleted(testDeposit as any, 'test reason');
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.DEPOSIT_DELETED);
  });

  test('logApiRequest writes correct event', async () => {
    await logApiRequest('/api/test', 'POST', testDeposit.id, { test: 'payload' }, 201);
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.API_REQUEST);
  });

  test('logDepositError writes correct event', async () => {
    await logDepositError(testDeposit.id, 'A test error occurred', { code: 500 });
    const logs = await prisma.auditLog.findMany({ where: { depositId: testDeposit.id } });
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe(AuditEventType.ERROR);
    expect(logs[0].data).toMatchObject({ message: 'A test error occurred' });
    expect(logs[0].errorCode).toBe(500);
  });
});
