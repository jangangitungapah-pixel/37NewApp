import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  performSessionAction: vi.fn(),
}));

vi.mock('../../src/application/use-cases/bookingSessionUseCases.js', () => ({
  performBookingSessionActionUseCase: mocks.performSessionAction,
}));

vi.mock('../../src/shared/hooks/useRegistrySubscription.js', () => ({
  useRegistrySubscription: () => ({
    data: [],
    loading: false,
    error: null,
    fromCache: false,
  }),
}));

vi.mock('../../src/components/ui/DialogModal.jsx', () => ({
  DialogModal: ({ children }) => <div role="dialog">{children}</div>,
}));

import { BookingDetailModal } from '../../src/features/bookings/BookingDetailModal.jsx';
import { BOOKING_STATUS, MEMBER_STATUS, ROLES, SESSION_ACTION } from '../../src/domain/enums/roles.js';

function makeBooking(overrides = {}) {
  return {
    bookingId: 'booking-legacy-1',
    businessId: 'business-1',
    studioId: 'studio-a',
    serviceId: 'service-1',
    status: BOOKING_STATUS.IN_PROGRESS,
    dateKey: '2026-11-20',
    timezone: 'Asia/Jakarta',
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    bufferMinutes: 0,
    startAt: new Date('2026-11-20T11:00:00.000Z'),
    slotIds: [],
    rescheduleCount: 0,
    actualStartAt: new Date('2026-11-17T09:00:00.000Z'),
    actualStartByName: 'Legacy Operator',
    studioSnapshot: {
      name: 'Studio A',
      timezone: 'Asia/Jakarta',
      operatingHours: { openTime: '10:00', closeTime: '22:00' },
      slotGranularityMinutes: 15,
    },
    serviceSnapshot: { name: 'Rehearsal', configVersion: 1 },
    customerSnapshot: { name: 'Band Satu', phone: '08123456789' },
    priceSnapshot: { totalMinor: 300000, baseSubtotalMinor: 300000, discountMinor: 0 },
    commissionSnapshot: { amountMinor: 30000, method: 'percentage' },
    ...overrides,
  };
}

function renderModal(booking, overrides = {}) {
  const onClose = vi.fn();
  const onMutated = vi.fn();
  render(
    <BookingDetailModal
      booking={booking}
      member={{
        uid: 'owner-1',
        businessId: 'business-1',
        displayName: 'Studio Owner',
        role: ROLES.OWNER,
        status: MEMBER_STATUS.ACTIVE,
        assignedStudioIds: [],
        permissions: {},
      }}
      business={{ ownerUid: 'owner-1' }}
      isOnline
      studios={[]}
      services={[]}
      settingsMap={{}}
      onClose={onClose}
      onMutated={onMutated}
      {...overrides}
    />,
  );
  return { onClose, onMutated };
}

describe('BookingDetailModal session actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.performSessionAction.mockResolvedValue({
      bookingId: 'booking-legacy-1',
      status: 'COMPLETED_PENDING_SETTLEMENT',
      sessionStatus: 'COMPLETED',
    });
  });

  it('shows Complete for a legacy IN_PROGRESS booking only when actualStartAt exists', () => {
    const legacyBooking = makeBooking();
    delete legacyBooking.sessionStatus;

    renderModal(legacyBooking);
    expect(screen.getByRole('button', { name: 'Selesaikan Sesi' })).toBeInTheDocument();
    expect(screen.queryByText(/waktu mulai aktual tidak pernah direkam/i)).not.toBeInTheDocument();

    const withoutStart = makeBooking({ actualStartAt: null });
    delete withoutStart.sessionStatus;
    renderModal(withoutStart);

    expect(screen.queryByRole('button', { name: 'Selesaikan Sesi' })).not.toBeInTheDocument();
    expect(screen.getByText(/waktu mulai aktual tidak pernah direkam/i)).toBeInTheDocument();
  });

  it('routes successful legacy completion through the session use case and refresh callback', async () => {
    const booking = makeBooking();
    delete booking.sessionStatus;
    const { onClose, onMutated } = renderModal(booking);
    const completeButton = screen.getByRole('button', { name: 'Selesaikan Sesi' });

    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(mocks.performSessionAction).toHaveBeenCalledWith(expect.objectContaining({
        member: expect.objectContaining({ uid: 'owner-1', role: ROLES.OWNER }),
        booking,
        action: SESSION_ACTION.COMPLETE,
        isOnline: true,
      }));
      expect(onMutated).toHaveBeenCalledWith(
        'Sesi selesai dan diteruskan ke Finance.',
        expect.objectContaining({ status: 'COMPLETED_PENDING_SETTLEMENT' }),
      );
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('disables the critical completion action while offline', () => {
    const booking = makeBooking();
    delete booking.sessionStatus;
    renderModal(booking, { isOnline: false });
    expect(screen.getByRole('button', { name: 'Selesaikan Sesi' })).toBeDisabled();
  });
});
