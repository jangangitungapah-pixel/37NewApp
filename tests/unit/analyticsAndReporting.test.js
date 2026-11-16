import { describe, expect, it, vi } from 'vitest';
import { loadDashboardAnalyticsUseCase } from '../../src/application/use-cases/analyticsUseCases.js';
import {
  ANALYTICS_PRESETS,
  MAX_ANALYTICS_RANGE_DAYS,
  bucketTrendPoints,
  computeDailyOpenMinutes,
  computeDashboardAnalytics,
  resolveAnalyticsDateWindow,
} from '../../src/domain/calculations/analyticsCalculator.js';
import {
  BOOKING_STATUS,
  COMMISSION_BASIS,
  COMMISSION_DIRECTION,
  COMMISSION_ENTRY_STATUS,
  COMMISSION_ENTRY_TYPE,
  COMMISSION_METHOD,
  LEDGER_DIRECTION,
  LEDGER_ENTRY_TYPE,
  MEMBER_STATUS,
  OWNER_DEFAULT_PERMISSIONS,
  OPERATOR_DEFAULT_PERMISSIONS,
  PAYMENT_METHOD,
  ROLES,
  STUDIO_STATUS,
} from '../../src/domain/enums/roles.js';
import {
  buildBookingsCsvReport,
  buildCommissionCsvReport,
  buildLedgerCsvReport,
  escapeCsvCell,
} from '../../src/domain/utils/csvExporter.js';

const OWNER_MEMBER = {
  uid: 'owner-1',
  businessId: 'biz-1',
  role: ROLES.OWNER,
  status: MEMBER_STATUS.ACTIVE,
  assignedStudioIds: [],
  permissions: OWNER_DEFAULT_PERMISSIONS,
};

const OPERATOR_A = {
  uid: 'op-a',
  businessId: 'biz-1',
  role: ROLES.OPERATOR,
  status: MEMBER_STATUS.ACTIVE,
  assignedStudioIds: ['studio-a'],
  permissions: OPERATOR_DEFAULT_PERMISSIONS,
};

const SAMPLE_STUDIOS = [
  {
    studioId: 'studio-a',
    name: 'Studio A (Live)',
    status: STUDIO_STATUS.ACTIVE,
    operatingHours: { openTime: '10:00', closeTime: '20:00' }, // 600 min/day
  },
  {
    studioId: 'studio-b',
    name: 'Studio B (Mastering)',
    status: STUDIO_STATUS.ACTIVE,
    operatingHours: { openTime: '12:00', closeTime: '22:00' }, // 600 min/day
  },
];

const SAMPLE_BOOKINGS = [
  {
    bookingId: 'bk-1',
    studioId: 'studio-a',
    studioName: 'Studio A (Live)',
    customerName: '=CMD|"/C calc"!A0',
    serviceId: 'svc-rehearsal',
    serviceName: 'Rehearsal Band',
    serviceCategory: 'rehearsal',
    dateKey: '2026-11-16',
    durationMinutes: 120,
    status: BOOKING_STATUS.SETTLED,
    priceSnapshot: { totalMinor: 300000 },
    paidAmountMinor: 300000,
    paymentMethod: PAYMENT_METHOD.QRIS,
  },
  {
    bookingId: 'bk-2',
    studioId: 'studio-a',
    studioName: 'Studio A (Live)',
    customerName: 'BandIndie, Jakarta',
    serviceId: 'svc-recording',
    serviceName: 'Recording Session',
    serviceCategory: 'recording',
    dateKey: '2026-11-16',
    durationMinutes: 180,
    status: BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT,
    priceSnapshot: { totalMinor: 450000 },
    paidAmountMinor: 0,
  },
  {
    bookingId: 'bk-3',
    studioId: 'studio-b',
    studioName: 'Studio B (Mastering)',
    customerName: 'Soloist',
    serviceId: 'svc-mastering',
    serviceName: 'Mastering',
    serviceCategory: 'mastering',
    dateKey: '2026-11-15',
    durationMinutes: 60,
    status: BOOKING_STATUS.SETTLED,
    priceSnapshot: { totalMinor: 500000 },
    paidAmountMinor: 500000,
    paymentMethod: PAYMENT_METHOD.TRANSFER,
  },
  {
    bookingId: 'bk-4',
    studioId: 'studio-a',
    studioName: 'Studio A (Live)',
    customerName: 'Cancelled Band',
    serviceId: 'svc-rehearsal',
    serviceName: 'Rehearsal Band',
    serviceCategory: 'rehearsal',
    dateKey: '2026-11-15',
    durationMinutes: 60,
    status: BOOKING_STATUS.CANCELLED,
    priceSnapshot: { totalMinor: 150000 },
    paidAmountMinor: 0,
  },
];

const SAMPLE_LEDGER = [
  {
    entryId: 'led-1',
    studioId: 'studio-a',
    bookingId: 'bk-1',
    dateKey: '2026-11-16',
    type: LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED,
    direction: LEDGER_DIRECTION.INFLOW,
    amountMinor: 300000,
    paymentMethod: PAYMENT_METHOD.QRIS,
    reference: 'QR-001',
    notes: 'Lunas',
  },
  {
    entryId: 'led-2',
    studioId: 'studio-b',
    bookingId: 'bk-3',
    dateKey: '2026-11-15',
    type: LEDGER_ENTRY_TYPE.PAYMENT_RECEIVED,
    direction: LEDGER_DIRECTION.INFLOW,
    amountMinor: 500000,
    paymentMethod: PAYMENT_METHOD.TRANSFER,
    reference: 'BCA-02',
    notes: 'Transfer',
  },
  {
    entryId: 'led-3',
    studioId: 'studio-b',
    bookingId: 'bk-3',
    dateKey: '2026-11-15',
    type: LEDGER_ENTRY_TYPE.REFUND,
    direction: LEDGER_DIRECTION.OUTFLOW,
    amountMinor: 50000,
    paymentMethod: PAYMENT_METHOD.TRANSFER,
    reason: 'Diskon koreksi pasca bayar',
  },
];

const SAMPLE_COMMISSIONS = [
  {
    entryId: 'comm-1',
    studioId: 'studio-a',
    bookingId: 'bk-1',
    dateKey: '2026-11-16',
    operatorUid: 'op-a',
    entryType: COMMISSION_ENTRY_TYPE.EARNED,
    direction: COMMISSION_DIRECTION.CREDIT,
    amountMinor: 30000,
    method: COMMISSION_METHOD.PERCENTAGE,
    basis: COMMISSION_BASIS.SETTLED_AMOUNT,
    status: COMMISSION_ENTRY_STATUS.RECORDED,
  },
  {
    entryId: 'comm-2',
    studioId: 'studio-b',
    bookingId: 'bk-3',
    dateKey: '2026-11-15',
    operatorUid: 'op-other',
    entryType: COMMISSION_ENTRY_TYPE.EARNED,
    direction: COMMISSION_DIRECTION.CREDIT,
    amountMinor: 90000,
    method: COMMISSION_METHOD.FIXED_PER_BOOKING,
    basis: COMMISSION_BASIS.SETTLED_AMOUNT,
    status: COMMISSION_ENTRY_STATUS.RECORDED,
  },
];

describe('Phase 07 Spark-safe date windows, utilization & trend calculations', () => {
  it('resolves preset windows and rejects ranges exceeding 90 days or reversed dates', () => {
    const todayWin = resolveAnalyticsDateWindow({
      preset: ANALYTICS_PRESETS.TODAY,
      todayKey: '2026-11-16',
    });
    expect(todayWin).toMatchObject({
      startDateKey: '2026-11-16',
      endDateKey: '2026-11-16',
      dayCount: 1,
    });

    const sevenWin = resolveAnalyticsDateWindow({
      preset: ANALYTICS_PRESETS.SEVEN_DAYS,
      todayKey: '2026-11-16',
    });
    expect(sevenWin).toMatchObject({
      startDateKey: '2026-11-10',
      endDateKey: '2026-11-16',
      dayCount: 7,
    });

    const mtdWin = resolveAnalyticsDateWindow({
      preset: ANALYTICS_PRESETS.MONTH_TO_DATE,
      todayKey: '2026-11-16',
    });
    expect(mtdWin).toMatchObject({
      startDateKey: '2026-11-01',
      endDateKey: '2026-11-16',
      dayCount: 16,
    });

    expect(() =>
      resolveAnalyticsDateWindow({
        preset: ANALYTICS_PRESETS.CUSTOM,
        todayKey: '2026-11-16',
        customStartKey: '2026-11-10',
        customEndKey: '2026-11-01',
      }),
    ).toThrow(/lebih awal/i);

    expect(() =>
      resolveAnalyticsDateWindow({
        preset: ANALYTICS_PRESETS.CUSTOM,
        todayKey: '2026-11-16',
        customStartKey: '2026-07-01',
        customEndKey: '2026-11-16',
      }),
    ).toThrow(new RegExp(String(MAX_ANALYTICS_RANGE_DAYS)));
  });

  it('computes daily open minutes safely and downsamples 90-day trend points preserving totals', () => {
    expect(computeDailyOpenMinutes({ openTime: '09:00', closeTime: '21:00' })).toBe(720);
    expect(computeDailyOpenMinutes(null, { openTime: '11:00', closeTime: '21:00' })).toBe(600);

    const daily90 = Array.from({ length: 90 }, (_, idx) => ({
      dateKey: `d-${idx + 1}`,
      shortLabel: `Day ${idx + 1}`,
      totalBookings: 1,
      blockingBookings: 1,
      bookedMinutes: 60,
      settledRevenueMinor: 100000,
      netCashMinor: 100000,
    }));
    const bucketed = bucketTrendPoints(daily90, 31);
    expect(bucketed.length).toBeLessThanOrEqual(31);
    expect(bucketed.reduce((sum, item) => sum + item.blockingBookings, 0)).toBe(90);
    expect(bucketed.reduce((sum, item) => sum + item.settledRevenueMinor, 0)).toBe(9000000);
  });

  it('computes Owner business KPIs with separated revenue/cashflow/outstanding/commission and utilization', () => {
    const window = resolveAnalyticsDateWindow({
      preset: ANALYTICS_PRESETS.CUSTOM,
      todayKey: '2026-11-16',
      customStartKey: '2026-11-15',
      customEndKey: '2026-11-16',
    });

    const result = computeDashboardAnalytics({
      member: OWNER_MEMBER,
      todayKey: '2026-11-16',
      window,
      bookings: SAMPLE_BOOKINGS,
      ledgerEntries: SAMPLE_LEDGER,
      commissionEntries: SAMPLE_COMMISSIONS,
      studios: SAMPLE_STUDIOS,
      members: [
        { uid: 'op-a', displayName: 'Operator Andi' },
        { uid: 'op-other', displayName: 'Operator Budi' },
      ],
    });

    expect(result.scope).toBe('business_owner');
    // Recognized revenue: bk-1 (300k) + bk-3 (500k) = 800k
    expect(result.financeSummary.recognizedRevenueMinor).toBe(800000);
    // Payment received: 300k + 500k = 800k; Refund: 50k; Net Cash Collected: 750k
    expect(result.financeSummary.paymentReceivedMinor).toBe(800000);
    expect(result.financeSummary.refundTotalMinor).toBe(50000);
    expect(result.financeSummary.netCashCollectedMinor).toBe(750000);
    // Outstanding: bk-2 (450k) + bk-3 shortfall (500k contract - 450k net = 50k) = 500k
    expect(result.financeSummary.outstandingBalanceMinor).toBe(500000);
    expect(result.financeSummary.netCommissionMinor).toBe(120000);

    // Utilization over 2 days: Studio A (1200 cap, 300 booked = 25%), Studio B (1200 cap, 60 booked = 5%)
    const studioA = result.studioUtilization.find((s) => s.studioId === 'studio-a');
    expect(studioA.utilizationPercent).toBe(25);
    expect(studioA.recognizedRevenueMinor).toBe(300000);
    expect(result.operationsSummary.overallUtilizationPercent).toBe(15); // 360 / 2400

    expect(result.paymentMethodBreakdown).toEqual([
      { method: 'transfer', count: 1, amountMinor: 500000, sharePercent: 63 },
      { method: 'qris', count: 1, amountMinor: 300000, sharePercent: 38 },
    ]);
  });

  it('strictly scopes Operator analytics to assignedStudioIds and own UID, hiding global financials', () => {
    const window = resolveAnalyticsDateWindow({
      preset: ANALYTICS_PRESETS.CUSTOM,
      todayKey: '2026-11-16',
      customStartKey: '2026-11-15',
      customEndKey: '2026-11-16',
    });

    const result = computeDashboardAnalytics({
      member: OPERATOR_A,
      todayKey: '2026-11-16',
      window,
      bookings: SAMPLE_BOOKINGS,
      ledgerEntries: SAMPLE_LEDGER, // must be stripped
      commissionEntries: SAMPLE_COMMISSIONS, // contains op-a AND op-other
      studios: SAMPLE_STUDIOS,
    });

    expect(result.scope).toBe('operator_scoped');
    expect(result.financeSummary).toBeNull();
    expect(result.paymentMethodBreakdown).toEqual([]);
    // Only Studio A bookings included (bk-1, bk-2, bk-4 = 3; bk-3 on studio-b excluded!)
    expect(result.operationsSummary.totalBookings).toBe(3);
    expect(result.studioUtilization.map((s) => s.studioId)).toEqual(['studio-a']);
    expect(result.studioUtilization[0].recognizedRevenueMinor).toBeNull();
    // Commission includes ONLY op-a (30k), never op-other (90k)
    expect(result.personalCommissionSummary.netCommissionMinor).toBe(30000);
    expect(result.chartTrend[0].settledRevenueMinor).toBeNull();
  });
});

describe('Phase 07 analytics use case & formula-safe CSV exporter', () => {
  it('blocks unauthorized studio filter for Operator, skips ledger fetch, and surfaces Spark cap warnings', async () => {
    const fetchLedgerSpy = vi.fn();

    await expect(
      loadDashboardAnalyticsUseCase(
        {
          member: OPERATOR_A,
          business: { timezone: 'Asia/Jakarta' },
          preset: ANALYTICS_PRESETS.SEVEN_DAYS,
          studioFilter: 'studio-b',
          studios: SAMPLE_STUDIOS,
        },
        {
          todayKey: '2026-11-16',
          fetchLedger: fetchLedgerSpy,
        },
      ),
    ).rejects.toThrow(/tidak memiliki akses/i);
    expect(fetchLedgerSpy).not.toHaveBeenCalled();

    const opBundle = await loadDashboardAnalyticsUseCase(
      {
        member: OPERATOR_A,
        business: { timezone: 'Asia/Jakarta' },
        preset: ANALYTICS_PRESETS.SEVEN_DAYS,
        studios: SAMPLE_STUDIOS,
      },
      {
        todayKey: '2026-11-16',
        fetchBookings: async () => ({ items: SAMPLE_BOOKINGS, reachedCap: true, capLimit: 250 }),
        fetchLedger: fetchLedgerSpy,
        fetchCommissions: async () => ({ items: SAMPLE_COMMISSIONS, reachedCap: false, capLimit: 250 }),
      },
    );

    expect(fetchLedgerSpy).not.toHaveBeenCalled();
    expect(opBundle.warnings.bookingsCapReached).toBe(true);
    expect(opBundle.warnings.ledgerCapReached).toBe(false);
    expect(opBundle.analytics.personalCommissionSummary.netCommissionMinor).toBe(30000);
  });

  it('escapes formula injection safely and restricts financial CSV reports by role', () => {
    expect(escapeCsvCell('=CMD|"/C calc"!A0')).toBe(`"'=CMD|""/C calc""!A0"`);
    expect(escapeCsvCell('+1+2')).toBe("'+1+2");
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell(150000)).toBe('150000');
    expect(escapeCsvCell("O'Brien")).toBe("O'Brien");

    expect(() =>
      buildLedgerCsvReport({ member: OPERATOR_A, ledgerEntries: SAMPLE_LEDGER }),
    ).toThrow(/Hanya Owner/i);

    const ownerBookingsCsv = buildBookingsCsvReport({
      member: OWNER_MEMBER,
      bookings: SAMPLE_BOOKINGS,
    });
    expect(ownerBookingsCsv.startsWith('\uFEFF')).toBe(true);
    expect(ownerBookingsCsv).toContain('Total Kontrak (IDR)');
    expect(ownerBookingsCsv).toContain("'=CMD|");

    const opBookingsCsv = buildBookingsCsvReport({
      member: OPERATOR_A,
      bookings: SAMPLE_BOOKINGS,
    });
    expect(opBookingsCsv).not.toContain('Total Kontrak (IDR)');
    expect(opBookingsCsv).not.toContain('studio-b');

    const opCommCsv = buildCommissionCsvReport({
      member: OPERATOR_A,
      commissionEntries: SAMPLE_COMMISSIONS,
    });
    expect(opCommCsv).toContain('comm-1');
    expect(opCommCsv).not.toContain('op-other');
  });
});
