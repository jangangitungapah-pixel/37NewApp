import {
  BOOKING_STATUS,
  COMMISSION_BASIS,
  COMMISSION_DIRECTION,
  COMMISSION_METHOD,
  LEDGER_DIRECTION,
  LEDGER_ENTRY_TYPE,
} from '../enums/roles.js';
import { calculateOperatorCommission } from './commissionCalculator.js';
import { requireSafeInt } from '../validators/masterDataValidators.js';

/**
 * Re-evaluates commission at settlement using the booking's frozen historic rule
 * (`booking.commissionSnapshot`) so changes in master settings never rewrite historic deals.
 *
 * @param {{ booking: Record<string, any>, paidAmountMinor: number }} params
 */
export function computeSettlementCommissionSnapshot({ booking, paidAmountMinor }) {
  const paid = requireSafeInt(paidAmountMinor, 'paidAmountMinor', { min: 0 });
  const frozenRule = booking?.commissionSnapshot || {};
  const grossSubtotalMinor = Number(booking?.priceSnapshot?.baseSubtotalMinor ?? paid);

  const syntheticService = {
    commissionMethod: frozenRule.method || COMMISSION_METHOD.NONE,
    commissionValue: Number(frozenRule.rateOrValue ?? 0),
  };
  const syntheticSetting = {
    basis:
      frozenRule.basis === COMMISSION_BASIS.SUBTOTAL
        ? COMMISSION_BASIS.SUBTOTAL
        : COMMISSION_BASIS.SETTLED_AMOUNT,
  };

  const recomputed = calculateOperatorCommission({
    service: syntheticService,
    commissionSetting: syntheticSetting,
    grossAmountMinor: grossSubtotalMinor,
    netAmountMinor: paid,
  });

  return Object.freeze({
    ...recomputed,
    source: frozenRule.source || 'booking_snapshot',
  });
}

/**
 * Computes clearly separated Owner & Operator financial KPIs (integer IDR):
 * - recognizedRevenueMinor (sum of `priceSnapshot.totalMinor` across `SETTLED` bookings)
 * - paymentReceivedMinor (gross `PAYMENT_RECEIVED` inflows in ledger)
 * - refundTotalMinor (`REFUND` outflows in ledger)
 * - netAdjustmentMinor (net inflows - outflows for `ADJUSTMENT` & `REVERSAL` entries)
 * - netCashCollectedMinor (`paymentReceivedMinor - refundTotalMinor + netAdjustmentMinor`)
 * - outstandingBalanceMinor (unsettled contracted amount for `COMPLETED_PENDING_SETTLEMENT` / `SETTLEMENT_REVIEW` plus any unpaid shortfall on settled bookings)
 * - netCommissionMinor (`CREDIT - DEBIT` across commission entries)
 */
export function computeFinanceSummary({
  bookings = [],
  ledgerEntries = [],
  commissionEntries = [],
}) {
  let recognizedRevenueMinor = 0;
  let paymentReceivedMinor = 0;
  let refundTotalMinor = 0;
  let adjustmentInflowMinor = 0;
  let adjustmentOutflowMinor = 0;
  let outstandingBalanceMinor = 0;

  const netPaidByBooking = new Map();
  const reversedLedgerEntryIds = new Set();

  for (const entry of ledgerEntries) {
    const amount = Number(entry.amountMinor || 0);
    const signedDelta = entry.direction === LEDGER_DIRECTION.INFLOW ? amount : -amount;
    netPaidByBooking.set(
      entry.bookingId,
      (netPaidByBooking.get(entry.bookingId) || 0) + signedDelta,
    );

    if (entry.type === LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED) {
      paymentReceivedMinor += amount;
    } else if (entry.type === LEDGER_ENTRY_TYPE.REFUND) {
      refundTotalMinor += amount;
    } else {
      if (entry.direction === LEDGER_DIRECTION.INFLOW) {
        adjustmentInflowMinor += amount;
      } else {
        adjustmentOutflowMinor += amount;
      }
      if (entry.type === LEDGER_ENTRY_TYPE.REVERSAL && entry.relatedEntryId) {
        reversedLedgerEntryIds.add(entry.relatedEntryId);
      }
    }
  }

  for (const booking of bookings) {
    const contractTotal = Number(booking.priceSnapshot?.totalMinor || 0);
    if (booking.status === BOOKING_STATUS.SETTLED) {
      recognizedRevenueMinor += contractTotal;
      const recordedNet = netPaidByBooking.get(booking.bookingId) || 0;
      if (recordedNet < contractTotal) {
        outstandingBalanceMinor += contractTotal - recordedNet;
      }
    } else if (
      booking.status === BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT ||
      booking.status === BOOKING_STATUS.SETTLEMENT_REVIEW
    ) {
      const recordedNet = Math.max(0, netPaidByBooking.get(booking.bookingId) || 0);
      outstandingBalanceMinor += Math.max(0, contractTotal - recordedNet);
    }
  }

  let netCommissionMinor = 0;
  const reversedCommissionEntryIds = new Set();
  const byOperatorMap = new Map();

  for (const comm of commissionEntries) {
    const amt = Number(comm.amountMinor || 0);
    const signed = comm.direction === COMMISSION_DIRECTION.CREDIT ? amt : -amt;
    netCommissionMinor += signed;

    if (comm.entryType === 'REVERSAL' && comm.relatedEntryId) {
      reversedCommissionEntryIds.add(comm.relatedEntryId);
    }

    const opKey = comm.operatorUid || 'unassigned';
    if (!byOperatorMap.has(opKey)) {
      byOperatorMap.set(opKey, {
        operatorUid: opKey,
        earnedMinor: 0,
        adjustedMinor: 0,
        netCommissionMinor: 0,
        bookingIds: new Set(),
      });
    }
    const bucket = byOperatorMap.get(opKey);
    if (comm.entryType === 'EARNED') {
      bucket.earnedMinor += amt;
    } else {
      bucket.adjustedMinor += signed;
    }
    bucket.netCommissionMinor += signed;
    if (comm.bookingId) {
      bucket.bookingIds.add(comm.bookingId);
    }
  }

  const commissionByOperator = Array.from(byOperatorMap.values()).map((row) => ({
    operatorUid: row.operatorUid,
    earnedMinor: row.earnedMinor,
    adjustedMinor: row.adjustedMinor,
    netCommissionMinor: row.netCommissionMinor,
    bookingCount: row.bookingIds.size,
  }));

  const netAdjustmentMinor = adjustmentInflowMinor - adjustmentOutflowMinor;
  const netCashCollectedMinor = paymentReceivedMinor - refundTotalMinor + netAdjustmentMinor;

  return {
    recognizedRevenueMinor,
    paymentReceivedMinor,
    refundTotalMinor,
    adjustmentInflowMinor,
    adjustmentOutflowMinor,
    netAdjustmentMinor,
    netCashCollectedMinor,
    outstandingBalanceMinor,
    netCommissionMinor,
    commissionByOperator,
    reversedLedgerEntryIds,
    reversedCommissionEntryIds,
  };
}
