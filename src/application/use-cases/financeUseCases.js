import { NOTIFICATION_TYPE } from '../../domain/enums/roles.js';
import {
  canSettleBookings,
  canViewBusinessLedger,
  isActiveMember,
} from '../../domain/policies/accessPolicy.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  recordCommissionAdjustmentTransaction,
  recordLedgerAdjustmentTransaction,
  requestSettlementReviewTransaction,
  settleBookingTransaction,
} from '../../data/repositories/financeRepository.js';
import { dispatchNotificationSafeUseCase } from './notificationUseCases.js';

function assertOnlineForFinance(isOnline) {
  if (isOnline === false) {
    throw new AppError({
      category: ERROR_CATEGORY.UNAVAILABLE,
      code: 'network/offline-write-blocked',
      message:
        'Operasi settlement dan pencatatan ledger/komisi wajib online agar commit atomik tervalidasi Firestore.',
      retryable: true,
    });
  }
}

function assertOwnerSettlementAuthority(member, actionLabel) {
  if (!canSettleBookings(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/owner-settlement-only',
      message: `Hanya Owner aktif yang berhak ${actionLabel}.`,
    });
  }
}

export async function settleBookingUseCase({
  member,
  bookingId,
  paymentMethod,
  paidAmountMinor,
  settlementReference = null,
  settlementNotes = null,
  isOnline = true,
}) {
  assertOnlineForFinance(isOnline);
  assertOwnerSettlementAuthority(member, 'melakukan final settlement booking');

  const result = await settleBookingTransaction({
    businessId: member.businessId,
    bookingId,
    paymentMethod,
    paidAmountMinor,
    settlementReference,
    settlementNotes,
    actorUid: member.uid,
    actorRole: member.role,
  });

  if (!result.idempotentReplay && result.booking) {
    const targetOpUid = result.commissionEntry?.operatorUid || result.booking.operatorUid || '';
    if (targetOpUid) {
      await dispatchNotificationSafeUseCase({
        member,
        recipientUids: [targetOpUid],
        studioId: result.booking.studioId,
        eventId: `booking.settled__${bookingId}`,
        type: NOTIFICATION_TYPE.BOOKING_SETTLED,
        entityType: 'settlement',
        entityId: bookingId,
        title: 'Settlement & Komisi Selesai',
        message: `Booking ${result.booking.customerSnapshot?.name || bookingId} (${result.booking.dateKey}) telah di-settle oleh Owner.`,
        actionPath: '/operator/commissions',
        isOnline,
      });
    }
  }

  return result;
}

export async function requestSettlementReviewUseCase({
  member,
  bookingId,
  reviewReason,
  isOnline = true,
}) {
  assertOnlineForFinance(isOnline);
  assertOwnerSettlementAuthority(member, 'menandai booking untuk review settlement');

  const updated = await requestSettlementReviewTransaction({
    businessId: member.businessId,
    bookingId,
    reviewReason,
    actorUid: member.uid,
    actorRole: member.role,
  });

  const targetOpUid = updated?.operatorUid || updated?.createdBy || '';
  if (targetOpUid) {
    await dispatchNotificationSafeUseCase({
      member,
      recipientUids: [targetOpUid],
      studioId: updated.studioId,
      eventId: `booking.settlement_review__${bookingId}`,
      type: NOTIFICATION_TYPE.SETTLEMENT_REVIEW_REQUIRED,
      entityType: 'settlement',
      entityId: bookingId,
      title: 'Perlu Review Settlement',
      message: `Booking ${updated.customerSnapshot?.name || bookingId}: ${reviewReason}.`,
      actionPath: '/operator/bookings',
      isOnline,
    });
  }

  return updated;
}

export async function recordLedgerAdjustmentUseCase({
  member,
  originalEntry,
  entryType,
  direction,
  amountMinor,
  reason,
  paymentMethod = null,
  isOnline = true,
}) {
  assertOnlineForFinance(isOnline);
  if (!canViewBusinessLedger(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/ledger-owner-only',
      message: 'Hanya Owner aktif yang dapat mencatat koreksi/refund ledger.',
    });
  }

  return recordLedgerAdjustmentTransaction({
    businessId: member.businessId,
    originalEntry,
    entryType,
    direction,
    amountMinor,
    reason,
    paymentMethod,
    actorUid: member.uid,
    actorRole: member.role,
  });
}

export async function recordCommissionAdjustmentUseCase({
  member,
  originalEntry,
  entryType,
  direction,
  amountMinor,
  reason,
  isOnline = true,
}) {
  assertOnlineForFinance(isOnline);
  assertOwnerSettlementAuthority(member, 'mencatat adjustment atau reversal komisi operator');

  if (!isActiveMember(member)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/inactive-member',
      message: 'Membership tidak aktif.',
    });
  }

  return recordCommissionAdjustmentTransaction({
    businessId: member.businessId,
    originalEntry,
    entryType,
    direction,
    amountMinor,
    reason,
    actorUid: member.uid,
    actorRole: member.role,
  });
}
