import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUS,
  COMMISSION_BASIS,
  COMMISSION_DIRECTION,
  COMMISSION_ENTRY_TYPE,
  COMMISSION_METHOD,
  LEDGER_DIRECTION,
  LEDGER_ENTRY_TYPE,
  MEMBER_STATUS,
  PAYMENT_METHOD,
  ROLES,
} from '../../src/domain/enums/roles.js';
import { DomainValidationError } from '../../src/domain/validators/schemaValidators.js';
import {
  buildCommissionReversalEntryId,
  buildEarnedCommissionEntryId,
  buildLedgerReversalEntryId,
  buildSettlementPaymentEntryId,
  validateCommissionEntryDoc,
  validateLedgerEntryDoc,
  validateSettlementInput,
} from '../../src/domain/validators/financeValidators.js';
import {
  computeFinanceSummary,
  computeSettlementCommissionSnapshot,
} from '../../src/domain/calculations/financeMetricsCalculator.js';
import {
  assertValidBookingTransition,
  canTransitionBookingStatus,
} from '../../src/domain/validators/bookingValidator.js';
import {
  canSettleBookings,
  canViewBusinessLedger,
  canViewCommissionEntry,
} from '../../src/domain/policies/accessPolicy.js';
import {
  recordCommissionAdjustmentUseCase,
  recordLedgerAdjustmentUseCase,
  requestSettlementReviewUseCase,
  settleBookingUseCase,
} from '../../src/application/use-cases/financeUseCases.js';

const BIZ_ID = 'biz-37';
const OWNER_UID = 'owner-1';
const OP_A_UID = 'op-a';

describe('Phase 04 Settlement, Immutable Ledger, Commission & Metrics', () => {
  it('generates deterministic financial entry IDs and validates settlement transitions', () => {
    expect(buildSettlementPaymentEntryId('bk-99')).toBe('settlement_payment__bk-99');
    expect(buildEarnedCommissionEntryId('bk-99')).toBe('commission_earned__bk-99');
    expect(buildLedgerReversalEntryId('settlement_payment__bk-99')).toBe(
      'reversal__settlement_payment__bk-99',
    );
    expect(buildCommissionReversalEntryId('commission_earned__bk-99')).toBe(
      'comm_reversal__commission_earned__bk-99',
    );

    expect(
      canTransitionBookingStatus(
        BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
        BOOKING_STATUS.SETTLED,
      ),
    ).toBe(true);
    expect(
      canTransitionBookingStatus(
        BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
        BOOKING_STATUS.SETTLEMENT_REVIEW,
      ),
    ).toBe(true);
    expect(
      canTransitionBookingStatus(BOOKING_STATUS.SETTLEMENT_REVIEW, BOOKING_STATUS.SETTLED),
    ).toBe(true);
    expect(canTransitionBookingStatus(BOOKING_STATUS.SETTLED, BOOKING_STATUS.CANCELLED)).toBe(false);
    expect(() =>
      assertValidBookingTransition(BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.SETTLED),
    ).toThrow(DomainValidationError);
  });

  it('validates settlement input, immutable ledger entries, and commission entries with integer IDR', () => {
    expect(
      validateSettlementInput({
        paymentMethod: PAYMENT_METHOD.QRIS,
        paidAmountMinor: 300000,
        settlementReference: 'QR-123',
        settlementNotes: 'Lunas',
      }),
    ).toEqual({
      paymentMethod: PAYMENT_METHOD.QRIS,
      paidAmountMinor: 300000,
      settlementReference: 'QR-123',
      settlementNotes: 'Lunas',
    });

    expect(() =>
      validateSettlementInput({
        paymentMethod: 'crypto',
        paidAmountMinor: 300000,
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      validateLedgerEntryDoc({
        entryId: 'adj-1',
        businessId: BIZ_ID,
        bookingId: 'bk-1',
        studioId: 'studio-a',
        dateKey: '2026-11-16',
        type: LEDGER_ENTRY_TYPE.ADJUSTMENT,
        direction: LEDGER_DIRECTION.OUTFLOW,
        amountMinor: 50000,
        currency: 'IDR',
        relatedEntryId: null,
        reason: 'Missing parent',
        createdBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);

    const refundDoc = validateLedgerEntryDoc({
      entryId: 'ref-1',
      businessId: BIZ_ID,
      bookingId: 'bk-1',
      studioId: 'studio-a',
      dateKey: '2026-11-16',
      type: LEDGER_ENTRY_TYPE.REFUND,
      direction: LEDGER_DIRECTION.OUTFLOW,
      amountMinor: 50000,
      currency: 'IDR',
      paymentMethod: PAYMENT_METHOD.TRANSFER,
      relatedEntryId: 'settlement_payment__bk-1',
      reason: 'Kelebihan bayar transfer customer',
      createdBy: OWNER_UID,
    });
    expect(refundDoc.amountMinor).toBe(50000);

    expect(() =>
      validateCommissionEntryDoc({
        entryId: 'comm-bad',
        businessId: BIZ_ID,
        bookingId: 'bk-1',
        studioId: 'studio-a',
        dateKey: '2026-11-16',
        operatorUid: OP_A_UID,
        entryType: COMMISSION_ENTRY_TYPE.REVERSAL,
        direction: COMMISSION_DIRECTION.DEBIT,
        amountMinor: 25000,
        relatedEntryId: 'commission_earned__bk-1',
        reason: 'ok', // too short (<3)
        createdBy: OWNER_UID,
      }),
    ).toThrow(DomainValidationError);
  });

  it('computes final settlement commission from frozen historic booking snapshot rule', () => {
    const bookingWithSettledBasis = {
      priceSnapshot: { baseSubtotalMinor: 350000, totalMinor: 300000 },
      commissionSnapshot: {
        method: COMMISSION_METHOD.PERCENTAGE,
        rateOrValue: 10,
        basis: COMMISSION_BASIS.SETTLED_AMOUNT,
        source: 'service_override',
      },
    };
    const commPartial = computeSettlementCommissionSnapshot({
      booking: bookingWithSettledBasis,
      paidAmountMinor: 200000,
    });
    expect(commPartial.amountMinor).toBe(20000);
    expect(commPartial.basisAmountMinor).toBe(200000);
    expect(commPartial.source).toBe('service_override');

    const bookingWithSubtotalBasis = {
      priceSnapshot: { baseSubtotalMinor: 350000, totalMinor: 300000 },
      commissionSnapshot: {
        method: COMMISSION_METHOD.PERCENTAGE,
        rateOrValue: 10,
        basis: COMMISSION_BASIS.SUBTOTAL,
        source: 'business_default',
      },
    };
    const commSubtotal = computeSettlementCommissionSnapshot({
      booking: bookingWithSubtotalBasis,
      paidAmountMinor: 250000,
    });
    expect(commSubtotal.amountMinor).toBe(35000);
    expect(commSubtotal.basisAmountMinor).toBe(350000);
  });

  it('computes 6 strictly separated financial KPIs without conflating revenue, payments, refunds, adjustments, outstanding, or commissions', () => {
    const bookings = [
      {
        bookingId: 'bk-settled',
        status: BOOKING_STATUS.SETTLED,
        priceSnapshot: { totalMinor: 300000 },
      },
      {
        bookingId: 'bk-partial-settled',
        status: BOOKING_STATUS.SETTLED,
        priceSnapshot: { totalMinor: 200000 },
      },
      {
        bookingId: 'bk-pending',
        status: BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
        priceSnapshot: { totalMinor: 150000 },
      },
      {
        bookingId: 'bk-cancelled',
        status: BOOKING_STATUS.CANCELLED,
        priceSnapshot: { totalMinor: 500000 },
      },
    ];

    const ledgerEntries = [
      {
        entryId: 'settlement_payment__bk-settled',
        bookingId: 'bk-settled',
        type: LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED,
        direction: LEDGER_DIRECTION.INFLOW,
        amountMinor: 300000,
      },
      {
        entryId: 'settlement_payment__bk-partial-settled',
        bookingId: 'bk-partial-settled',
        type: LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED,
        direction: LEDGER_DIRECTION.INFLOW,
        amountMinor: 120000,
      },
      {
        entryId: 'ref-1',
        bookingId: 'bk-settled',
        type: LEDGER_ENTRY_TYPE.REFUND,
        direction: LEDGER_DIRECTION.OUTFLOW,
        amountMinor: 50000,
      },
      {
        entryId: 'adj-1',
        bookingId: 'bk-settled',
        type: LEDGER_ENTRY_TYPE.ADJUSTMENT,
        direction: LEDGER_DIRECTION.INFLOW,
        amountMinor: 10000,
      },
    ];

    const commissionEntries = [
      {
        entryId: 'commission_earned__bk-settled',
        bookingId: 'bk-settled',
        operatorUid: OP_A_UID,
        entryType: COMMISSION_ENTRY_TYPE.EARNED,
        direction: COMMISSION_DIRECTION.CREDIT,
        amountMinor: 30000,
      },
      {
        entryId: 'comm-adj-1',
        bookingId: 'bk-settled',
        operatorUid: OP_A_UID,
        entryType: COMMISSION_ENTRY_TYPE.ADJUSTMENT,
        direction: COMMISSION_DIRECTION.DEBIT,
        amountMinor: 5000,
      },
    ];

    const summary = computeFinanceSummary({ bookings, ledgerEntries, commissionEntries });

    // 1. Settled contract total = 300k + 200k = 500k (pending 150k & cancelled 500k excluded)
    expect(summary.recognizedRevenueMinor).toBe(500000);
    // 2. Payment received inflows = 300k + 120k = 420k
    expect(summary.paymentReceivedMinor).toBe(420000);
    // 3. Refunds = 50k
    expect(summary.refundTotalMinor).toBe(50000);
    // 4. Net adjustment = +10k
    expect(summary.netAdjustmentMinor).toBe(10000);
    // 5. Net cash collected = 420k - 50k + 10k = 380k
    expect(summary.netCashCollectedMinor).toBe(380000);
    // 6. Outstanding: bk-settled net paid = 260k (40k shortfall) + bk-partial shortfall (80k) + bk-pending (150k) = 270k
    expect(summary.outstandingBalanceMinor).toBe(270000);
    // 7. Commission = 30k - 5k = 25k
    expect(summary.netCommissionMinor).toBe(25000);
    expect(summary.commissionByOperator).toEqual([
      {
        operatorUid: OP_A_UID,
        earnedMinor: 30000,
        adjustedMinor: -5000,
        netCommissionMinor: 25000,
        bookingCount: 1,
      },
    ]);
  });

  it('enforces Owner-only settlement policies, Operator commission scoping, and offline write blocks', async () => {
    const owner = { role: ROLES.OWNER, status: MEMBER_STATUS.ACTIVE, businessId: BIZ_ID, uid: OWNER_UID };
    const opA = { role: ROLES.OPERATOR, status: MEMBER_STATUS.ACTIVE, businessId: BIZ_ID, uid: OP_A_UID };

    expect(canSettleBookings(owner)).toBe(true);
    expect(canSettleBookings(opA)).toBe(false);
    expect(canViewBusinessLedger(owner)).toBe(true);
    expect(canViewBusinessLedger(opA)).toBe(false);

    expect(canViewCommissionEntry(opA, { operatorUid: OP_A_UID })).toBe(true);
    expect(canViewCommissionEntry(opA, { operatorUid: 'op-b' })).toBe(false);
    expect(canViewCommissionEntry(owner, { operatorUid: 'op-b' })).toBe(true);

    // Operator denied before Firestore call even online
    await expect(
      settleBookingUseCase({
        member: opA,
        bookingId: 'bk-1',
        paymentMethod: PAYMENT_METHOD.CASH,
        paidAmountMinor: 100000,
        isOnline: true,
      }),
    ).rejects.toMatchObject({ code: 'authz/owner-settlement-only' });

    // Owner blocked when offline
    await expect(
      settleBookingUseCase({
        member: owner,
        bookingId: 'bk-1',
        paymentMethod: PAYMENT_METHOD.CASH,
        paidAmountMinor: 100000,
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    await expect(
      requestSettlementReviewUseCase({
        member: owner,
        bookingId: 'bk-1',
        reviewReason: 'Check receipt',
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    await expect(
      recordLedgerAdjustmentUseCase({
        member: owner,
        originalEntry: { entryId: 'e1' },
        entryType: LEDGER_ENTRY_TYPE.REFUND,
        direction: LEDGER_DIRECTION.OUTFLOW,
        amountMinor: 10000,
        reason: 'Offline',
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });

    await expect(
      recordCommissionAdjustmentUseCase({
        member: owner,
        originalEntry: { entryId: 'c1' },
        entryType: COMMISSION_ENTRY_TYPE.ADJUSTMENT,
        direction: COMMISSION_DIRECTION.DEBIT,
        amountMinor: 5000,
        reason: 'Offline',
        isOnline: false,
      }),
    ).rejects.toMatchObject({ code: 'network/offline-write-blocked' });
  });
});
