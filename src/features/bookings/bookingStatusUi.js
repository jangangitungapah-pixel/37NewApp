import { BOOKING_STATUS, SESSION_STATUS } from '../../domain/enums/roles.js';

export const BOOKING_STATUS_META = Object.freeze({
  [BOOKING_STATUS.PENDING_CONFIRMATION]: {
    label: 'Menunggu Konfirmasi',
    badgeClass: 'badge-warning',
  },
  [BOOKING_STATUS.CONFIRMED]: {
    label: 'Terkonfirmasi',
    badgeClass: 'badge-info',
  },
  [BOOKING_STATUS.IN_PROGRESS]: {
    label: 'Sesi Berjalan',
    badgeClass: 'badge-success',
  },
  [BOOKING_STATUS.COMPLETED_PENDING_SETTLEMENT]: {
    label: 'Menunggu Settlement',
    badgeClass: 'badge-warning',
  },
  [BOOKING_STATUS.SETTLEMENT_REVIEW]: {
    label: 'Revisi Settlement',
    badgeClass: 'badge-danger',
  },
  [BOOKING_STATUS.SETTLED]: {
    label: 'Settled / Lunas',
    badgeClass: 'badge-success',
  },
  [BOOKING_STATUS.REJECTED]: {
    label: 'Ditolak',
    badgeClass: 'badge-danger',
  },
  [BOOKING_STATUS.CANCELLED]: {
    label: 'Dibatalkan',
    badgeClass: 'badge-danger',
  },
  [BOOKING_STATUS.NO_SHOW]: {
    label: 'No-Show',
    badgeClass: 'badge-danger',
  },
});

export function getBookingStatusMeta(status) {
  return (
    BOOKING_STATUS_META[status] || {
      label: status || 'Unknown',
      badgeClass: '',
    }
  );
}


export const SESSION_STATUS_META = Object.freeze({
  [SESSION_STATUS.PENDING]: {
    label: 'Menunggu Konfirmasi',
    badgeClass: 'badge-warning',
  },
  [SESSION_STATUS.UPCOMING]: {
    label: 'Menunggu Sesi',
    badgeClass: 'badge-info',
  },
  [SESSION_STATUS.IN_PROGRESS]: {
    label: 'Sedang Berjalan',
    badgeClass: 'badge-success',
  },
  [SESSION_STATUS.COMPLETED]: {
    label: 'Selesai',
    badgeClass: 'badge-success',
  },
  [SESSION_STATUS.NO_SHOW]: {
    label: 'No-Show',
    badgeClass: 'badge-danger',
  },
  [SESSION_STATUS.CANCELLED]: {
    label: 'Dibatalkan',
    badgeClass: 'badge-danger',
  },
});

export function getSessionStatusMeta(status) {
  return (
    SESSION_STATUS_META[status] || {
      label: status || 'Unknown',
      badgeClass: '',
    }
  );
}
