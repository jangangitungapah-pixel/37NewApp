import {
  canViewBusinessAnalytics,
  canViewBusinessLedger,
  filterBookingsForAnalytics,
  filterCommissionEntriesForAnalytics,
} from '../policies/accessPolicy.js';
import { DomainValidationError } from '../validators/schemaValidators.js';

const FORMULA_TRIGGER_PATTERN = /^[\s\u00A0]*[=+\-@\t\r]/;

/**
 * Escapes a single cell value according to RFC-4180 CSV rules while neutralizing
 * Excel/Sheets formula injection (`=`, `+`, `-`, `@`, tab, CR prefixes) on string inputs.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (value instanceof Date) {
    return `"${value.toISOString()}"`;
  }

  let text = String(value);
  if (FORMULA_TRIGGER_PATTERN.test(text)) {
    text = `'${text}`;
  }

  const needsQuotes = /[",\r\n]/.test(text) || text.startsWith(' ') || text.endsWith(' ');
  const sanitized = text.replace(/"/g, '""');
  return needsQuotes ? `"${sanitized}"` : sanitized;
}

/**
 * Builds a complete CSV text document with UTF-8 BOM and CRLF rows.
 * @param {{ headers: string[], rows: unknown[][] }} params
 * @returns {string}
 */
export function buildCsvDocument({ headers, rows }) {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = (rows || []).map((row) => row.map(escapeCsvCell).join(','));
  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
}

/**
 * Generates an analytics booking report CSV scoped cleanly to Owner or Operator permissions.
 */
export function buildBookingsCsvReport({ member, bookings = [], studioNameMap = new Map() }) {
  const isOwner = canViewBusinessAnalytics(member);
  const scopedBookings = filterBookingsForAnalytics(member, bookings);

  if (isOwner) {
    const headers = [
      'Booking ID',
      'Tanggal',
      'Studio',
      'Customer',
      'Layanan',
      'Durasi (Menit)',
      'Status',
      'Total Kontrak (IDR)',
      'Terbayar (IDR)',
      'Metode Bayar',
    ];
    const rows = scopedBookings.map((b) => [
      b.bookingId,
      b.dateKey,
      studioNameMap.get(b.studioId) || b.studioName || b.studioId,
      b.customerName || '-',
      b.serviceName || b.serviceId || '-',
      Number(b.durationMinutes || 0),
      b.status,
      Number(b.priceSnapshot?.totalMinor || 0),
      Number(b.paidAmountMinor || 0),
      b.paymentMethod || '-',
    ]);
    return buildCsvDocument({ headers, rows });
  }

  // Operators export operational schedule rows strictly for assigned studios without global financial columns
  const headers = [
    'Booking ID',
    'Tanggal',
    'Studio',
    'Customer',
    'Layanan',
    'Durasi (Menit)',
    'Status',
  ];
  const rows = scopedBookings.map((b) => [
    b.bookingId,
    b.dateKey,
    studioNameMap.get(b.studioId) || b.studioName || b.studioId,
    b.customerName || '-',
    b.serviceName || b.serviceId || '-',
    Number(b.durationMinutes || 0),
    b.status,
  ]);
  return buildCsvDocument({ headers, rows });
}

/**
 * Generates an immutable ledger cashflow CSV strictly restricted to active Owners.
 */
export function buildLedgerCsvReport({ member, ledgerEntries = [], studioNameMap = new Map() }) {
  if (!canViewBusinessLedger(member)) {
    throw new DomainValidationError('Hanya Owner aktif yang diizinkan mengekspor laporan ledger.');
  }

  const headers = [
    'Entry ID',
    'Tanggal',
    'Studio',
    'Booking ID',
    'Jenis',
    'Arah',
    'Nominal (IDR)',
    'Metode Bayar',
    'Referensi',
    'Catatan',
  ];
  const rows = (ledgerEntries || []).map((entry) => [
    entry.entryId,
    entry.dateKey,
    studioNameMap.get(entry.studioId) || entry.studioId || '-',
    entry.bookingId || '-',
    entry.type,
    entry.direction,
    Number(entry.amountMinor || 0),
    entry.paymentMethod || '-',
    entry.reference || '-',
    entry.notes || entry.reason || '-',
  ]);

  return buildCsvDocument({ headers, rows });
}

/**
 * Generates a scoped commission report CSV (Owner: all operators; Operator: own entries only).
 */
export function buildCommissionCsvReport({
  member,
  commissionEntries = [],
  memberNameMap = new Map(),
}) {
  const scoped = filterCommissionEntriesForAnalytics(member, commissionEntries);
  const headers = [
    'Entry ID',
    'Tanggal',
    'Operator',
    'Booking ID',
    'Jenis',
    'Arah',
    'Nominal (IDR)',
    'Metode',
    'Basis',
    'Status',
    'Alasan',
  ];
  const rows = scoped.map((entry) => [
    entry.entryId,
    entry.dateKey,
    memberNameMap.get(entry.operatorUid) || entry.operatorUid,
    entry.bookingId,
    entry.entryType,
    entry.direction,
    Number(entry.amountMinor || 0),
    entry.method,
    entry.basis,
    entry.status,
    entry.reason || '-',
  ]);
  return buildCsvDocument({ headers, rows });
}
