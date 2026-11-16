import {
  BLOCKING_BOOKING_STATUSES,
  BOOKING_STATUS,
  LEDGER_ENTRY_TYPE,
  STUDIO_STATUS,
} from '../enums/roles.js';
import {
  canViewBusinessAnalytics,
  filterAccessibleStudios,
  filterBookingsForAnalytics,
  filterCommissionEntriesForAnalytics,
} from '../policies/accessPolicy.js';
import { parseTimeToMinutes } from '../validators/masterDataValidators.js';
import { DomainValidationError } from '../validators/schemaValidators.js';
import { computeFinanceSummary } from './financeMetricsCalculator.js';
import {
  addDaysToDateKey,
  formatDateKeyLabel,
  isValidDateKey,
} from './slotGenerator.js';

export const MAX_ANALYTICS_RANGE_DAYS = 90;

export const ANALYTICS_PRESETS = Object.freeze({
  TODAY: 'today',
  SEVEN_DAYS: '7d',
  THIRTY_DAYS: '30d',
  MONTH_TO_DATE: 'mtd',
  CUSTOM: 'custom',
});

const BLOCKING_STATUS_SET = new Set(BLOCKING_BOOKING_STATUSES);

/**
 * Computes inclusive calendar days between two YYYY-MM-DD keys (`start <= end`).
 * @param {string} startDateKey
 * @param {string} endDateKey
 * @returns {number}
 */
export function diffDateKeysInclusive(startDateKey, endDateKey) {
  if (!isValidDateKey(startDateKey)) {
    throw new DomainValidationError(`Tanggal mulai analitik tidak valid: ${startDateKey}`, 'startDateKey');
  }
  if (!isValidDateKey(endDateKey)) {
    throw new DomainValidationError(`Tanggal akhir analitik tidak valid: ${endDateKey}`, 'endDateKey');
  }
  const [sy, sm, sd] = startDateKey.split('-').map(Number);
  const [ey, em, ed] = endDateKey.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  if (endMs < startMs) {
    throw new DomainValidationError(
      'Tanggal akhir tidak boleh lebih awal dari tanggal mulai.',
      'endDateKey',
    );
  }
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

/**
 * Resolves a Spark-safe bounded date window (`<= 90` days) from a preset or custom dates.
 * @param {{
 *   preset?: string,
 *   todayKey: string,
 *   customStartKey?: string,
 *   customEndKey?: string,
 * }} params
 */
export function resolveAnalyticsDateWindow({
  preset = ANALYTICS_PRESETS.THIRTY_DAYS,
  todayKey,
  customStartKey = '',
  customEndKey = '',
}) {
  if (!isValidDateKey(todayKey)) {
    throw new DomainValidationError(`Tanggal acuan hari ini tidak valid: ${todayKey}`, 'todayKey');
  }

  let startDateKey = todayKey;
  let endDateKey = todayKey;
  let label = 'Hari Ini';

  switch (preset) {
    case ANALYTICS_PRESETS.TODAY:
      startDateKey = todayKey;
      endDateKey = todayKey;
      label = 'Hari Ini';
      break;
    case ANALYTICS_PRESETS.SEVEN_DAYS:
      startDateKey = addDaysToDateKey(todayKey, -6);
      endDateKey = todayKey;
      label = '7 Hari Terakhir';
      break;
    case ANALYTICS_PRESETS.MONTH_TO_DATE:
      startDateKey = `${todayKey.slice(0, 8)}01`;
      endDateKey = todayKey;
      label = 'Bulan Ini (MTD)';
      break;
    case ANALYTICS_PRESETS.CUSTOM:
      startDateKey = String(customStartKey || '').trim();
      endDateKey = String(customEndKey || '').trim();
      label = 'Rentang Kustom';
      break;
    case ANALYTICS_PRESETS.THIRTY_DAYS:
    default:
      startDateKey = addDaysToDateKey(todayKey, -29);
      endDateKey = todayKey;
      label = '30 Hari Terakhir';
      break;
  }

  const dayCount = diffDateKeysInclusive(startDateKey, endDateKey);
  if (dayCount > MAX_ANALYTICS_RANGE_DAYS) {
    throw new DomainValidationError(
      `Rentang analitik maksimal ${MAX_ANALYTICS_RANGE_DAYS} hari untuk menjaga kuota Spark (dipilih ${dayCount} hari).`,
      'dateRange',
    );
  }

  return {
    preset: Object.values(ANALYTICS_PRESETS).includes(preset)
      ? preset
      : ANALYTICS_PRESETS.THIRTY_DAYS,
    startDateKey,
    endDateKey,
    dayCount,
    label,
  };
}

/**
 * Generates inclusive list of consecutive `YYYY-MM-DD` strings for chart & trend zero-filling.
 */
export function buildDateKeysBetween(startDateKey, endDateKey) {
  const dayCount = diffDateKeysInclusive(startDateKey, endDateKey);
  if (dayCount > MAX_ANALYTICS_RANGE_DAYS) {
    throw new DomainValidationError(
      `Rentang tanggal melebihi batas maksimal ${MAX_ANALYTICS_RANGE_DAYS} hari.`,
      'dateRange',
    );
  }
  return Array.from({ length: dayCount }, (_, idx) => addDaysToDateKey(startDateKey, idx));
}

/**
 * Safely derives daily operating minutes from studio/business `operatingHours`.
 */
export function computeDailyOpenMinutes(
  operatingHours,
  fallbackHours = { openTime: '10:00', closeTime: '22:00' },
) {
  const tryHours = (hours) => {
    if (!hours?.openTime || !hours?.closeTime) {
      return null;
    }
    try {
      const openMins = parseTimeToMinutes(hours.openTime, 'openTime');
      const closeMins = parseTimeToMinutes(hours.closeTime, 'closeTime');
      return closeMins > openMins ? closeMins - openMins : null;
    } catch {
      return null;
    }
  };

  return tryHours(operatingHours) ?? tryHours(fallbackHours) ?? 720;
}

/**
 * Downsamples >31 daily bars into equal-size buckets so SVG trend charts remain legible up to 90 days.
 */
export function bucketTrendPoints(dailyPoints, maxBars = 31) {
  if (!Array.isArray(dailyPoints) || dailyPoints.length <= maxBars) {
    return Array.isArray(dailyPoints) ? dailyPoints : [];
  }
  const bucketSize = Math.ceil(dailyPoints.length / maxBars);
  const buckets = [];
  for (let i = 0; i < dailyPoints.length; i += bucketSize) {
    const slice = dailyPoints.slice(i, i + bucketSize);
    const first = slice[0];
    const last = slice[slice.length - 1];
    const hasRevenue = first.settledRevenueMinor !== null;
    buckets.push({
      dateKey: `${first.dateKey}..${last.dateKey}`,
      shortLabel: slice.length === 1 ? first.shortLabel : `${first.dateKey.slice(5)}–${last.dateKey.slice(5)}`,
      totalBookings: slice.reduce((acc, p) => acc + p.totalBookings, 0),
      blockingBookings: slice.reduce((acc, p) => acc + p.blockingBookings, 0),
      bookedMinutes: slice.reduce((acc, p) => acc + p.bookedMinutes, 0),
      settledRevenueMinor: hasRevenue
        ? slice.reduce((acc, p) => acc + (p.settledRevenueMinor || 0), 0)
        : null,
      netCashMinor: hasRevenue
        ? slice.reduce((acc, p) => acc + (p.netCashMinor || 0), 0)
        : null,
    });
  }
  return buckets;
}

/**
 * Pure deterministic analytics aggregator shared across Owner & Operator dashboards.
 * Enforces strict RBAC privacy: ledger totals & global business revenues are NEVER populated for Operators.
 */
export function computeDashboardAnalytics({
  member,
  todayKey,
  window,
  bookings = [],
  ledgerEntries = [],
  commissionEntries = [],
  studios = [],
  scheduleSetting = null,
  members = [],
}) {
  const isOwner = canViewBusinessAnalytics(member);
  const scopedBookings = filterBookingsForAnalytics(member, bookings);
  const scopedLedger = isOwner && Array.isArray(ledgerEntries) ? ledgerEntries : [];
  const scopedCommissions = filterCommissionEntriesForAnalytics(member, commissionEntries);
  const scopedStudios = filterAccessibleStudios(member, studios);

  const rawFinance = computeFinanceSummary({
    bookings: scopedBookings,
    ledgerEntries: scopedLedger,
    commissionEntries: scopedCommissions,
  });

  const memberNameMap = new Map();
  for (const m of members || []) {
    if (m?.uid) {
      memberNameMap.set(m.uid, m.displayName || m.email || m.uid);
    }
  }

  const financeSummary = isOwner
    ? {
        ...rawFinance,
        commissionByOperator: rawFinance.commissionByOperator
          .map((row) => ({
            ...row,
            operatorName: memberNameMap.get(row.operatorUid) || row.operatorUid,
          }))
          .sort((a, b) => b.netCommissionMinor - a.netCommissionMinor),
      }
    : null;

  const personalCommissionSummary = {
    netCommissionMinor: rawFinance.netCommissionMinor,
    earnedMinor: rawFinance.commissionByOperator.reduce((acc, r) => acc + r.earnedMinor, 0),
    adjustedMinor: rawFinance.commissionByOperator.reduce((acc, r) => acc + r.adjustedMinor, 0),
    bookingCount: rawFinance.commissionByOperator.reduce((acc, r) => acc + r.bookingCount, 0),
  };

  // Booking status breakdown & daily accumulators
  const statusCounts = {
    totalBookings: scopedBookings.length,
    pendingConfirmationCount: 0,
    confirmedCount: 0,
    inProgressCount: 0,
    completedPendingSettlementCount: 0,
    settlementReviewCount: 0,
    settledCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    blockingBookingsCount: 0,
    bookedMinutesTotal: 0,
  };

  const todaySummary = {
    dateKey: todayKey,
    totalToday: 0,
    confirmedToday: 0,
    inProgressToday: 0,
    pendingToday: 0,
    awaitingSettlementToday: 0,
  };

  const dateKeys = buildDateKeysBetween(window.startDateKey, window.endDateKey);
  const trendMap = new Map(
    dateKeys.map((dateKey) => {
      const { shortLabel } = formatDateKeyLabel(dateKey);
      return [
        dateKey,
        {
          dateKey,
          shortLabel,
          totalBookings: 0,
          blockingBookings: 0,
          bookedMinutes: 0,
          settledRevenueMinor: isOwner ? 0 : null,
          netCashMinor: isOwner ? 0 : null,
        },
      ];
    }),
  );

  const studioBuckets = new Map();
  for (const studio of scopedStudios) {
    studioBuckets.set(studio.studioId, {
      studioId: studio.studioId,
      studioName: studio.name || studio.studioId,
      status: studio.status || STUDIO_STATUS.ACTIVE,
      dailyOpenMinutes: computeDailyOpenMinutes(
        studio.operatingHours,
        scheduleSetting?.defaultOperatingHours,
      ),
      totalBookings: 0,
      blockingBookings: 0,
      settledBookings: 0,
      cancelledOrNoShowBookings: 0,
      bookedMinutes: 0,
      recognizedRevenueMinor: isOwner ? 0 : null,
    });
  }

  const serviceBuckets = new Map();

  for (const booking of scopedBookings) {
    const duration = Number(booking.durationMinutes || 0);
    const isBlocking = BLOCKING_STATUS_SET.has(booking.status);

    switch (booking.status) {
      case BOOKING_STATUS.PENDING_CONFIRMATION:
        statusCounts.pendingConfirmationCount += 1;
        break;
      case BOOKING_STATUS.CONFIRMED:
        statusCounts.confirmedCount += 1;
        break;
      case BOOKING_STATUS.IN_PROGRESS:
        statusCounts.inProgressCount += 1;
        break;
      case BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT:
        statusCounts.completedPendingSettlementCount += 1;
        break;
      case BOOKING_STATUS.SETTLEMENT_REVIEW:
        statusCounts.settlementReviewCount += 1;
        break;
      case BOOKING_STATUS.SETTLED:
        statusCounts.settledCount += 1;
        break;
      case BOOKING_STATUS.CANCELLED:
        statusCounts.cancelledCount += 1;
        break;
      case BOOKING_STATUS.NO_SHOW:
        statusCounts.noShowCount += 1;
        break;
      default:
        break;
    }

    if (isBlocking) {
      statusCounts.blockingBookingsCount += 1;
      statusCounts.bookedMinutesTotal += duration;
    }

    if (booking.dateKey === todayKey) {
      todaySummary.totalToday += 1;
      if (booking.status === BOOKING_STATUS.CONFIRMED) todaySummary.confirmedToday += 1;
      if (booking.status === BOOKING_STATUS.IN_PROGRESS) todaySummary.inProgressToday += 1;
      if (booking.status === BOOKING_STATUS.PENDING_CONFIRMATION) todaySummary.pendingToday += 1;
      if (
        booking.status === BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT ||
        booking.status === BOOKING_STATUS.SETTLEMENT_REVIEW
      ) {
        todaySummary.awaitingSettlementToday += 1;
      }
    }

    const dayBucket = trendMap.get(booking.dateKey);
    if (dayBucket) {
      dayBucket.totalBookings += 1;
      if (isBlocking) {
        dayBucket.blockingBookings += 1;
        dayBucket.bookedMinutes += duration;
      }
      if (isOwner && booking.status === BOOKING_STATUS.SETTLED) {
        dayBucket.settledRevenueMinor += Number(booking.priceSnapshot?.totalMinor || 0);
      }
    }

    const sid = booking.studioId || 'unknown';
    if (!studioBuckets.has(sid)) {
      studioBuckets.set(sid, {
        studioId: sid,
        studioName: booking.studioName || sid,
        status: STUDIO_STATUS.ACTIVE,
        dailyOpenMinutes: computeDailyOpenMinutes(scheduleSetting?.defaultOperatingHours),
        totalBookings: 0,
        blockingBookings: 0,
        settledBookings: 0,
        cancelledOrNoShowBookings: 0,
        bookedMinutes: 0,
        recognizedRevenueMinor: isOwner ? 0 : null,
      });
    }
    const studioRow = studioBuckets.get(sid);
    studioRow.totalBookings += 1;
    if (isBlocking) {
      studioRow.blockingBookings += 1;
      studioRow.bookedMinutes += duration;
    } else {
      studioRow.cancelledOrNoShowBookings += 1;
    }
    if (booking.status === BOOKING_STATUS.SETTLED) {
      studioRow.settledBookings += 1;
      if (isOwner) {
        studioRow.recognizedRevenueMinor += Number(booking.priceSnapshot?.totalMinor || 0);
      }
    }

    if (isBlocking) {
      const serviceKey = booking.serviceId || booking.serviceName || 'unknown';
      if (!serviceBuckets.has(serviceKey)) {
        serviceBuckets.set(serviceKey, {
          serviceId: serviceKey,
          serviceName: booking.serviceName || serviceKey,
          category: booking.serviceCategory || '-',
          bookingCount: 0,
          bookedMinutes: 0,
          recognizedRevenueMinor: isOwner ? 0 : null,
        });
      }
      const svcRow = serviceBuckets.get(serviceKey);
      svcRow.bookingCount += 1;
      svcRow.bookedMinutes += duration;
      if (isOwner && booking.status === BOOKING_STATUS.SETTLED) {
        svcRow.recognizedRevenueMinor += Number(booking.priceSnapshot?.totalMinor || 0);
      }
    }
  }

  // Payment method breakdown & daily net cash for Owner only
  const paymentMethodMap = new Map();
  let totalMethodAmountMinor = 0;

  if (isOwner) {
    for (const entry of scopedLedger) {
      const amount = Number(entry.amountMinor || 0);
      const signed = entry.direction === 'inflow' ? amount : -amount;
      const dayBucket = trendMap.get(entry.dateKey);
      if (dayBucket) {
        dayBucket.netCashMinor += signed;
      }

      if (entry.type === LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED) {
        const methodKey = entry.paymentMethod || 'other';
        if (!paymentMethodMap.has(methodKey)) {
          paymentMethodMap.set(methodKey, { method: methodKey, count: 0, amountMinor: 0 });
        }
        const mRow = paymentMethodMap.get(methodKey);
        mRow.count += 1;
        mRow.amountMinor += amount;
        totalMethodAmountMinor += amount;
      }
    }
  }

  const paymentMethodBreakdown = isOwner
    ? Array.from(paymentMethodMap.values())
        .map((row) => ({
          ...row,
          sharePercent:
            totalMethodAmountMinor > 0
              ? Math.round((row.amountMinor * 100) / totalMethodAmountMinor)
              : 0,
        }))
        .sort((a, b) => b.amountMinor - a.amountMinor)
    : [];

  let totalCapacityMinutes = 0;
  let activeCapacityBookedMinutes = 0;
  const studioUtilization = Array.from(studioBuckets.values())
    .map((row) => {
      const capacityMinutes = row.dailyOpenMinutes * window.dayCount;
      if (row.status === STUDIO_STATUS.ACTIVE) {
        totalCapacityMinutes += capacityMinutes;
        activeCapacityBookedMinutes += row.bookedMinutes;
      }
      const utilizationPercent =
        capacityMinutes > 0 ? Math.min(100, Math.round((row.bookedMinutes * 100) / capacityMinutes)) : 0;
      return {
        ...row,
        capacityMinutes,
        utilizationPercent,
      };
    })
    .sort((a, b) => b.bookedMinutes - a.bookedMinutes);

  const overallUtilizationPercent =
    totalCapacityMinutes > 0
      ? Math.min(100, Math.round((activeCapacityBookedMinutes * 100) / totalCapacityMinutes))
      : 0;

  const cancelledOrNoShowCount = statusCounts.cancelledCount + statusCounts.noShowCount;
  const cancellationOrNoShowRatePercent =
    statusCounts.totalBookings > 0
      ? Math.round((cancelledOrNoShowCount * 100) / statusCounts.totalBookings)
      : 0;
  const awaitingSettlementCount =
    statusCounts.completedPendingSettlementCount + statusCounts.settlementReviewCount;

  const serviceBreakdown = Array.from(serviceBuckets.values()).sort(
    (a, b) => b.bookingCount - a.bookingCount,
  );

  const dailyTrend = Array.from(trendMap.values());

  return {
    scope: isOwner ? 'business_owner' : 'operator_scoped',
    window,
    financeSummary,
    personalCommissionSummary,
    operationsSummary: {
      ...statusCounts,
      awaitingSettlementCount,
      cancelledOrNoShowCount,
      cancellationOrNoShowRatePercent,
      overallUtilizationPercent,
      totalCapacityMinutes,
    },
    todaySummary,
    studioUtilization,
    paymentMethodBreakdown,
    serviceBreakdown,
    dailyTrend,
    chartTrend: bucketTrendPoints(dailyTrend, 31),
  };
}
