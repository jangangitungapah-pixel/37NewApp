import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MEMBER_STATUS, OWNER_DEFAULT_PERMISSIONS, ROLES } from '../../src/domain/enums/roles.js';

const mockUseAuthSession = vi.fn();
const mockLoadAnalytics = vi.fn();

vi.mock('../../src/app/providers/authSessionContext.js', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

vi.mock('../../src/data/repositories/studioRepository.js', () => ({
  subscribeStudiosForMember: ({ onData }) => {
    onData([{ studioId: 'studio-a', name: 'Studio A', status: 'active' }], { fromCache: false });
    return () => {};
  },
}));

vi.mock('../../src/data/repositories/businessProfileRepository.js', () => ({
  subscribeBusinessSettings: ({ onData }) => {
    // Regression guard: repository emits an object map keyed by settingId, NOT an array
    onData(
      {
        schedule: {
          settingId: 'schedule',
          defaultOperatingHours: { openTime: '10:00', closeTime: '22:00' },
        },
      },
      { fromCache: false },
    );
    return () => {};
  },
}));

vi.mock('../../src/data/repositories/teamRepository.js', () => ({
  subscribeBusinessMembers: ({ onData }) => {
    onData([], { fromCache: false });
    return () => {};
  },
}));

vi.mock('../../src/application/use-cases/analyticsUseCases.js', () => ({
  loadDashboardAnalyticsUseCase: (...args) => mockLoadAnalytics(...args),
}));

import { DashboardOverviewPage } from '../../src/features/dashboard/DashboardOverviewPage.jsx';

describe('DashboardOverviewPage settingsMap regression guard', () => {
  it('renders cleanly when subscribeBusinessSettings emits an object map keyed by settingId', async () => {
    mockUseAuthSession.mockReturnValue({
      member: {
        uid: 'owner-1',
        businessId: 'biz-1',
        role: ROLES.OWNER,
        status: MEMBER_STATUS.ACTIVE,
        assignedStudioIds: [],
        permissions: OWNER_DEFAULT_PERMISSIONS,
      },
      business: { name: '37 Music Studio', timezone: 'Asia/Jakarta' },
      isOnline: true,
    });

    mockLoadAnalytics.mockResolvedValue({
      window: {
        preset: '30d',
        startDateKey: '2026-10-18',
        endDateKey: '2026-11-16',
        dayCount: 30,
        label: '30 Hari Terakhir',
      },
      analytics: {
        scope: 'business_owner',
        window: { startDateKey: '2026-10-18', endDateKey: '2026-11-16', dayCount: 30 },
        financeSummary: {
          recognizedRevenueMinor: 1200000,
          paymentReceivedMinor: 1200000,
          refundTotalMinor: 0,
          netAdjustmentMinor: 0,
          netCashCollectedMinor: 1200000,
          outstandingBalanceMinor: 0,
          netCommissionMinor: 120000,
          commissionByOperator: [],
        },
        personalCommissionSummary: {
          netCommissionMinor: 0,
          earnedMinor: 0,
          adjustedMinor: 0,
          bookingCount: 0,
        },
        operationsSummary: {
          totalBookings: 2,
          pendingConfirmationCount: 0,
          confirmedCount: 0,
          inProgressCount: 0,
          awaitingSettlementCount: 0,
          settledCount: 2,
          cancelledCount: 0,
          noShowCount: 0,
          cancelledOrNoShowCount: 0,
          cancellationOrNoShowRatePercent: 0,
          overallUtilizationPercent: 20,
        },
        todaySummary: {
          dateKey: '2026-11-16',
          totalToday: 1,
          confirmedToday: 0,
          inProgressToday: 0,
          pendingToday: 0,
          awaitingSettlementToday: 0,
        },
        studioUtilization: [],
        paymentMethodBreakdown: [],
        serviceBreakdown: [],
        dailyTrend: [],
        chartTrend: [],
      },
      rawBookings: [],
      rawLedger: [],
      rawCommissions: [],
      warnings: {
        bookingsCapReached: false,
        ledgerCapReached: false,
        commissionCapReached: false,
        offlineStale: false,
      },
    });

    render(
      <MemoryRouter>
        <DashboardOverviewPage portalRole={ROLES.OWNER} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Owner Analytics & Ringkasan Bisnis/i)).toBeInTheDocument();
      expect(mockLoadAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleSetting: expect.objectContaining({
            settingId: 'schedule',
          }),
        }),
      );
    });
  });
});
