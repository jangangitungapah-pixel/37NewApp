import {
  ANALYTICS_PRESETS,
  computeDashboardAnalytics,
  resolveAnalyticsDateWindow,
} from '../../domain/calculations/analyticsCalculator.js';
import { getTodayDateKey } from '../../domain/calculations/slotGenerator.js';
import {
  canAccessStudio,
  canViewBusinessAnalytics,
  isActiveMember,
} from '../../domain/policies/accessPolicy.js';
import { AppError, ERROR_CATEGORY } from '../../data/firebase/errorMapper.js';
import {
  fetchBookingsAnalyticsSlice,
  fetchCommissionAnalyticsSlice,
  fetchLedgerAnalyticsSlice,
} from '../../data/repositories/analyticsRepository.js';

/**
 * Loads and computes Spark-safe dashboard analytics for either Owner or Operator.
 * Executes bounded on-demand `getDocs` queries (`<= 90` days, `limit(250)`) and enforces
 * strict Operator scoping both at query construction and domain aggregation level.
 */
export async function loadDashboardAnalyticsUseCase(
  {
    member,
    business,
    preset = ANALYTICS_PRESETS.THIRTY_DAYS,
    customStartKey = '',
    customEndKey = '',
    studioFilter = 'all',
    studios = [],
    scheduleSetting = null,
    members = [],
    isOnline = true,
  },
  deps = {},
) {
  if (!isActiveMember(member) || !member.businessId) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/inactive-member',
      message: 'Sesi membership aktif diperlukan untuk memuat analitik studio.',
    });
  }

  const timeZone = business?.timezone || 'Asia/Jakarta';
  const todayKey = deps.todayKey || getTodayDateKey(timeZone);

  const window = resolveAnalyticsDateWindow({
    preset,
    todayKey,
    customStartKey,
    customEndKey,
  });

  if (studioFilter && studioFilter !== 'all' && !canAccessStudio(member, studioFilter)) {
    throw new AppError({
      category: ERROR_CATEGORY.PERMISSION_DENIED,
      code: 'authz/analytics-studio-denied',
      message: 'Anda tidak memiliki akses analitik untuk studio yang dipilih.',
    });
  }

  const isOwner = canViewBusinessAnalytics(member);
  const fetchBookings = deps.fetchBookings || fetchBookingsAnalyticsSlice;
  const fetchLedger = deps.fetchLedger || fetchLedgerAnalyticsSlice;
  const fetchCommissions = deps.fetchCommissions || fetchCommissionAnalyticsSlice;

  const [bookingsSlice, ledgerSlice, commissionSlice] = await Promise.all([
    fetchBookings({
      businessId: member.businessId,
      member,
      studioId: studioFilter,
      startDateKey: window.startDateKey,
      endDateKey: window.endDateKey,
    }),
    isOwner
      ? fetchLedger({
          businessId: member.businessId,
          member,
          studioId: studioFilter,
          startDateKey: window.startDateKey,
          endDateKey: window.endDateKey,
        })
      : Promise.resolve({ items: [], reachedCap: false, capLimit: 0 }),
    fetchCommissions({
      businessId: member.businessId,
      member,
      startDateKey: window.startDateKey,
      endDateKey: window.endDateKey,
    }),
  ]);

  const rawBookings = bookingsSlice?.items || [];
  const rawLedger = isOwner ? ledgerSlice?.items || [] : [];
  const rawCommissionsAll = commissionSlice?.items || [];
  const rawCommissions =
    studioFilter && studioFilter !== 'all'
      ? rawCommissionsAll.filter((entry) => entry?.studioId === studioFilter)
      : rawCommissionsAll;

  const filteredStudios =
    studioFilter && studioFilter !== 'all'
      ? (studios || []).filter((studio) => studio?.studioId === studioFilter)
      : studios || [];

  const analytics = computeDashboardAnalytics({
    member,
    todayKey,
    window,
    bookings: rawBookings,
    ledgerEntries: rawLedger,
    commissionEntries: rawCommissions,
    studios: filteredStudios,
    scheduleSetting,
    members: isOwner ? members : [],
  });

  return {
    window,
    analytics,
    rawBookings,
    rawLedger,
    rawCommissions,
    warnings: {
      bookingsCapReached: Boolean(bookingsSlice?.reachedCap),
      ledgerCapReached: Boolean(isOwner && ledgerSlice?.reachedCap),
      commissionCapReached: Boolean(commissionSlice?.reachedCap),
      offlineStale: isOnline === false,
    },
  };
}
